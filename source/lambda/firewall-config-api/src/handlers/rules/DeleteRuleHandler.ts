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
    FlowRule,
    Logger,
    LoggerFactory,
} from 'shared_types';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import RuleConfigError from 'src/common/RuleConfigError';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { inject, injectable } from 'tsyringe';

/**
 * @api {delete} /rulebundles/{id}/rules/{ruleId} Delete a rule
 * @apiGroup Rule
 * @apiDescription Delete a rule in a rule bundle 
 * 
 * @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/rule_id'
* @apiSuccess (Success 201) Rule created
* @apiError (Error 400) BadRequest Rule bundle id path parameter cannot be null or empty
* @apiError (Error 400) BadRequest Rule bundle id path parameter does not match request body groupId
* @apiError (Error 400) BadRequest RuleGroup  does not exists
* @apiError (Error 403) Forbidden Requestor's arn is not authorized to perform this action
* @apiError (Error 500) RemoteError Error while creating rule object
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "ruleId": "rule_id"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class DeleteRuleHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RulesDataSourceService')
        private ruleDataSourceService: RulesDataSourceService,
        @inject('AuditsDataSourceService')
        private auditsDataSourceService: AuditsDataSourceService,
        @inject('RuleGroupAuthenticationValidator')
        private ruleGroupAuthenticationValidator: RuleGroupAuthenticationValidator
    ) {
        this.logger = loggerFactory.getLogger('DeleteRuleHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        if (!event.pathParameters) {
            return ServerlessResponse.ofError(new RuleConfigError(undefined, 400, false));
        }
        const ruleId = event.pathParameters['ruleId'];
        const ruleGroupdId = event.pathParameters['id'];
        if (!event.pathParameters || !ruleGroupdId || !ruleId) {
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Parameter rule id or rule bundle id not found',
                    400,
                    false
                )
            );
        }
        this.logger.debug('Processing delete rule request');

        const rule = await this.ruleDataSourceService.getRuleBy(ruleId);
        this.logger.info('retrieved rule', rule);

        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unkonwn';
        const requestingAccountId = event.requestContext.accountId;
        const errorResponse = await this.ruleGroupAuthenticationValidator.checkRuleGroupAccess(
            requestorIdentity,
            ruleGroupdId,
            requestingAccountId,
            'DELETE'
        );
        if (errorResponse) {
            this.logger.error(`Authorization error ${errorResponse.body}`);
            return errorResponse;
        }

        this.logger.info('retrieved rule', rule);
        const matchingRuleGroupId = rule?.ruleBundleId === ruleGroupdId;

        if (rule && matchingRuleGroupId) {
            await this.ruleDataSourceService.deleteRuleBy(ruleGroupdId, ruleId);
            await this.auditEntryForCreation(
                requestorIdentity,
                'SUCCESS',
                ruleGroupdId,
                rule
            );
            return ServerlessResponse.ofObject(200, { ruleId });
        } else {
            const message = rule
                ? 'Rule bundle id does not matching the requested rule'
                : 'Rule not found';
            await this.auditEntryForCreation(
                requestorIdentity,
                'REJECTED',
                ruleGroupdId,
                rule ?? ({ id: ruleId } as FlowRule),
                [message]
            );
            return ServerlessResponse.ofObject(404, { message });
        }
    }

    async auditEntryForCreation(
        requestorIdentity: string,
        status: AuditChangeResult,
        ruleBundleId: string,
        rule: FlowRule,
        reasons?: string[]
    ): Promise<FlowAudit> {
        return this.auditsDataSourceService.createAuditEntry({
            requestedBy: requestorIdentity,
            requestedTimestamp: new Date().toISOString(),
            flowRuleGroupId: ruleBundleId,
            requestedChange: {
                type: 'DELETE', //CREATE/UPDATE/DELETE
                changeContent: {
                    requestedObject: rule,
                },
                changeResult: status, // SUCCESS, REJECTED
                reasonPhrase: reasons ?? [],
            },
        });
    }
}
