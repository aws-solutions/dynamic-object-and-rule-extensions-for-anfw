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
import { Logger, LoggerFactory } from 'shared_types';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import RuleConfigError from 'src/common/RuleConfigError';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { inject, injectable } from 'tsyringe';

/**
 * @api {get} /rulebundles/{id}/rules/{ruleId} Get a rule
 * @apiGroup Rule
 * @apiDescription Get a rule in a rule bundle referencing a cloud resource or fixed resource
 * 
 * @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/rule_id'
* @apiSuccess (Success 201) Rule created
* @apiError (Error 400) BadRequest Rule bundle id path parameter cannot be null or empty
* @apiError (Error 400) BadRequest Rule bundle id path parameter does not match request body groupId
* @apiError (Error 400) BadRequest Rule bundle does not exists
* @apiError (Error 403) Forbidden Requestor's arn is not authorized to perform this action
* @apiError (Error 500) RemoteError Error while creating rule object
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "rule": {
        "protocol": "tcp",
        "action": "drop",
        "source": "Ec2_Arn_DEMO",
        "destination": "Onprem_Server",
        "status": "PENDING",
        "ruleBundleId": "ruleGroup_Id",
        "lastUpdated": "2021-09-16T23:11:56.198Z",
        "id": "rule_id",
        "destinationPort": {
            "type": "SinglePort",
            "value": '123'
            },
        "sourcePort": {
            "type": "Any"
        },
        "version": 0
    }
}
* 
* @apiSampleRequest off
*/
@injectable()
export class GetRuleHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RulesDataSourceService')
        private rulesDataSourceService: RulesDataSourceService,
        @inject('RuleGroupAuthenticationValidator')
        private ruleGroupAuthenticationValidator: RuleGroupAuthenticationValidator
    ) {
        this.logger = loggerFactory.getLogger('GetRuleHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        if (
            !event.pathParameters ||
            !event.pathParameters['id'] ||
            !event.pathParameters['ruleId']
        ) {
            return ServerlessResponse.ofError(
                new RuleConfigError('Parameter rule object id not found', 400, false)
            );
        }

        const ruleId = event.pathParameters['ruleId'];
        const ruleBundleId = event.pathParameters['id'];
        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unkonwn';
        const requestingAccountId = event.requestContext.accountId;
        const errorResponse = await this.ruleGroupAuthenticationValidator.checkRuleGroupAccess(
            requestorIdentity,
            ruleBundleId,
            requestingAccountId,
            'GET'
        );
        if (errorResponse) {
            this.logger.error(`Authorization error ${errorResponse.body}`);
            return errorResponse;
        }

        const rule = await this.rulesDataSourceService.getRuleBy(ruleId);
        this.logger.info('retrieved rule', rule);
        const matchingRuleGroupId = rule?.ruleBundleId === event.pathParameters['id'];

        if (rule && matchingRuleGroupId) {
            return ServerlessResponse.ofObject(200, rule);
        } else {
            const message = rule
                ? 'Rule bundle id does not matching the requested rule'
                : 'Rule not found';
            return ServerlessResponse.ofObject(404, { message });
        }
    }
}
