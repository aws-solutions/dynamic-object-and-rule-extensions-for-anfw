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
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { FlowObjectInput } from 'src/types/FlowTarget';
import { CreateObjectInputValidator } from 'src/validators/CreateObjectInputValidator';
import { inject, injectable } from 'tsyringe';
import RuleConfigError from 'src/common/RuleConfigError';

/**
 * @api {post} /objects Create new object
 * @apiGroup Objects
 * @apiDescription Create new object referencing a cloud resource or fixed resource
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request POST 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/audits' --data-raw '{
    "id": "Onprem_Server",
    "value": "172.16.1.20",
    "type": "Address"
}'
* @apiSuccess (Success 201) object created object values
* @apiParam {String[1..100]="[ 0-9a-zA-Z_-]+"}  id The object's id.
* @apiParam {string} type The object's type 'Address' | 'Cidr' | 'Arn' | 'Tagged'
* @apiParam {value}  value The object's value, can a an ARN or A tag list \
* e.g ARN arn:aws:ec2:ap-southeast-2:<account_number>:subnet/subnet-123
* e.g  A tag list  { \
*          "value": "1", \
*          "key": "FF_TEST"\
*        }
* @apiError (Error 400) UnsupportedObjectType Supported object type 'SinglePort' , 'Any' , 'PortRange'
* @apiError (Error 400) InvalidObjectValue When request contains unsupported object value, supported 'Address' | 'Cidr' | 'Arn' | 'Tagged'; 
* @apiError (Error 400) ObjectInvalidReference When requested object is not reference to a concrete resource with IP
* @apiError (Error 400) BadRequest NONE_COMPLIANT due to violate OPA policy
* @apiError (Error 502) Time out
* @apiError (Error 503) Internal error
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "object": {
        "id": "Onprem_Server",
        "type": "Address",
        "value": "172.16.1.20",
        "createdBy": "arn:aws:sts::1000000:assumed-role/ObjectExtensionSecOpsAdminRole/DeviceClient",
        "lastUpdated": "2021-09-15T06:39:38.997Z"
    }
}
* 
* @apiSampleRequest off
*/
@injectable()
export class CreateObjectHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectsDataSourceService')
        private objectsDataSourceService: ObjectsDataSourceService,
        @inject('AuditsDataSourceService')
        private auditsDataSourceService: AuditsDataSourceService,
        @inject('CreateObjectInputValidator')
        private validator: CreateObjectInputValidator,
        @inject('OpaPolicyService') private opaPolicyService: OpaPolicyService
    ) {
        this.logger = loggerFactory.getLogger('CreateObjectHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.debug('Processing create rule object request');
        const input = await this.validator.parseAndValidate(event);

        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unknown';
        const accountId = event.requestContext.accountId ?? '100000';
        this.logger.debug('sending to opa');
        try {
            const response = await this.opaPolicyService.requestDecision(
                {
                    requester: {
                        arn: requestorIdentity,
                        accountId: accountId,
                    },
                },
                { object: input },
                'CREATE'
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

        const objectToBeCreated: FlowObjectInput = {
            id: input.id,
            type: input.type,
            value: input.value,
        };

        try {
            const existingTarget = await this.objectsDataSourceService.getObjectBy(
                objectToBeCreated.id
            );

            if (existingTarget) {
                this.logger.error(
                    `Duplicated id found for object ${objectToBeCreated.id}`,
                    existingTarget
                );
                this.auditEntryForCreation(requestorIdentity, 'REJECTED', input, [
                    `Duplicated id found for object ${objectToBeCreated.id}`,
                ]);
                return ServerlessResponse.ofError(
                    new RuleConfigError(
                        `Duplicated id found for object ${objectToBeCreated.id}`,
                        409,
                        true
                    )
                );
            }
            const object = await this.objectsDataSourceService.createObject(
                objectToBeCreated,
                requestorIdentity
            );
            await this.auditEntryForCreation(requestorIdentity, 'SUCCESS', object);

            return ServerlessResponse.ofObject(201, { object });
        } catch (e) {
            this.logger.error('Error while creating rule object', e, input);
            this.auditEntryForCreation(requestorIdentity, 'REJECTED', input, [
                (e as Error).message,
            ]);
            return ServerlessResponse.ofObject(500, {
                message: 'Error while creating rule object',
            });
        }
    }

    async auditEntryForCreation(
        requestorIdentity: string,
        status: AuditChangeResult,
        object: FlowObject,
        reasons?: string[]
    ): Promise<FlowAudit> {
        return this.auditsDataSourceService.createAuditEntry({
            requestedBy: requestorIdentity,
            requestedTimestamp: new Date().toISOString(),
            requestedChange: {
                type: 'CREATE', //CREATE/UPDATE/DELETE
                changeContent: {
                    requestedObject: object,
                },
                changeResult: status, // SUCCESS, REJECTED
                reasonPhrase: reasons ?? [],
            },
        });
    }
}
