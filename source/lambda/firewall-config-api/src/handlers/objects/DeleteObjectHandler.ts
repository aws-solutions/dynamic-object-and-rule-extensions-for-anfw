/* 
  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
    AuditChangeResult,
    FlowAudit,
    FlowObject,
    Logger,
    LoggerFactory,
} from 'shared_types';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import RuleConfigError from 'src/common/RuleConfigError';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { inject, injectable } from 'tsyringe';

/**
 * @api {delete} /objects/{id} Delete an object
 * @apiGroup Objects
 * @apiDescription Delete an object referencing a cloud resource or fixed resource
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request DELETE 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/object_id' 
* @apiParam {UUID} id The object's id.
* @apiSuccess (Success 200) object updated
* @apiError (Error 404) object not found
* @apiError (Error 400) Invalid object value
* @apiError (Error 502) Time out
* @apiError (Error 503) Internal error
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "id": "object_id"
    }
* 
* @apiSampleRequest off
*/
@injectable()
export class DeleteObjectHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectsDataSourceService')
        private objectsDataSourceService: ObjectsDataSourceService,
        @inject('RulesDataSourceService')
        private ruleDataSourceService: RulesDataSourceService,
        @inject('AuditsDataSourceService')
        private auditsDataSourceService: AuditsDataSourceService,
        @inject('OpaPolicyService') private opaPolicyService: OpaPolicyService
    ) {
        this.logger = loggerFactory.getLogger('DeleteObjectHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.debug('Processing delete rule object request');
        if (!event.pathParameters) {
            return ServerlessResponse.ofError(new RuleConfigError(undefined, 400, false));
        }
        const id = event.pathParameters['id'];
        if (!id) {
            this.logger.info('Rule object id path parameter cannot be null or empty.');
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Rule object id path parameter cannot be null or empty.',
                    400,
                    false
                )
            );
        }
        const originalTarget = await this.objectsDataSourceService.getObjectBy(id);
        if (!originalTarget) {
            this.logger.info(`Target ${id} does not exist`);
            return ServerlessResponse.ofError(
                new RuleConfigError(`Target ${id} does not exist`, 404, false)
            );
        }
        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unknown';
        const accountId = event.requestContext.accountId ?? '100000';
        this.logger.info('requesting decision from opa');
        try {
            const response = await this.opaPolicyService.requestDecision(
                {
                    requester: {
                        arn: requestorIdentity,
                        accountId: accountId,
                    },
                },
                { object: originalTarget },
                'DELETE'
            );

            this.logger.info(' opa decision response', response);
            if (response.status === 'NON_COMPLIANT') {
                return ServerlessResponse.ofObject(400, {
                    message: response.reasonPhrases,
                });
            }
        } catch (e) {
            this.logger.error('opa error', e);
            return ServerlessResponse.ofObject(500, {
                message: `Unable to determine user accessibility, ${e}`,
            });
        }

        try {
            this.logger.info(`deleting object ${id}`);
            const rules = await this.ruleDataSourceService.getRuleByReferences(id);
            if (rules.length > 0) {
                this.logger.error(
                    'Error while deleting rule target, which has existing reference',
                    originalTarget
                );
                const rulesIds = rules.map((r) => r.id);
                return ServerlessResponse.ofObject(400, {
                    message: `Object ${id} is referenced by rules ${rulesIds}`,
                });
            }
            await this.objectsDataSourceService.deleteObject(id);
            await this.auditEntry(requestorIdentity, 'SUCCESS', originalTarget);

            return ServerlessResponse.ofObject(200, { id: id });
        } catch (e) {
            this.logger.error('Error while deleting rule target', e, originalTarget);
            this.auditEntry(requestorIdentity, 'REJECTED', originalTarget, [e.message]);
            return ServerlessResponse.ofObject(500, {
                message: `Error while deleting rule object ${id}`,
            });
        }
    }

    async auditEntry(
        requestorIdentity: string,
        status: AuditChangeResult,
        object: FlowObject,
        reasons?: string[]
    ): Promise<FlowAudit> {
        return this.auditsDataSourceService.createAuditEntry({
            requestedBy: requestorIdentity,
            requestedTimestamp: new Date().toISOString(),
            requestedChange: {
                type: 'DELETE', //CREATE/UPDATE/DELETE
                changeContent: {
                    requestedObject: object,
                },
                changeResult: status, // SUCCESS, REJECTED
                reasonPhrase: reasons ?? [],
            },
        });
    }
}
