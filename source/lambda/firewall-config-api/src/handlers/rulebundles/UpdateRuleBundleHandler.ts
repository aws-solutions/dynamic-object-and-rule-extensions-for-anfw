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
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { UpdateRuleBundleInput } from 'src/types/RuleGroups';
import { UpdateRuleBundleInputValidator } from 'src/validators/UpdateRuleBundleInputValidator';
import { inject, injectable } from 'tsyringe';

/**
 * @api {put} /rulebundles Update a rule bundle
 * @apiGroup RuleBundle
 * @apiDescription Create new rule bundle to encapsulate the underling Network firewall rule bundles
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request PUT 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/' --data-raw '{
    "id":"demo-group-demo",
    "description": "demo rule bundle",
    "ownerGroup": [
        "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
    ],
    "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup-1"
}'
* @apiSuccess (Success 201) Rule Group created
* @apiParam {string} description Description of this rule bundle
* @apiParam {string} id Id of this rule bundle
* @apiParam {list[]}  ownerGroup The owner group, this is SecOpsAdminRole provided by the solution
* @apiParam {string}  ruleGroupArn The underlying AWS network firewall rule bundle arn
* @apiError (Error 403) Forbidden Requestor's arn is not authorized to perform this action
* @apiError (Error 409) Conflict Requested id already exists
* @apiError (Error 400) BadRequest ruleGroupArn does not exists
* @apiError (Error 502) Timeout
* @apiError (Error 503) ServiceUnavailable
* 
* @apiSuccessExample Success-Response: 
*  HTTP/1.1 200 OK
*  {
    "ruleBundleId": "demo-group-demo"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class UpdateRuleBundleHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleBundleDataSourceService: RuleBundleDataSourceService,
        @inject('UpdateRuleBundleInputValidator')
        private validator: UpdateRuleBundleInputValidator
    ) {
        this.logger = loggerFactory.getLogger('CreateRuleConfigHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.debug('Processing update rule bundle request');
        if (!event.pathParameters) {
            return ServerlessResponse.ofError(new RuleConfigError(undefined, 400, false));
        }
        const ruleBundleId = event.pathParameters['id'];
        if (!ruleBundleId) {
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Rule bundle id path parameter cannot be null or empty.',
                    400,
                    false
                )
            );
        }

        const input: UpdateRuleBundleInput = await this.validator.parseAndValidate(event);

        if (input.id != ruleBundleId) {
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Rule bundle id not matching the the id in path parameter',
                    400,
                    false
                )
            );
        }
        const ruleGroupToBeUpdated: UpdateRuleBundleInput = {
            id: input.id,
            aggregatorName: input.aggregatorName,
            description: input.description,
            ownerGroup: input.ownerGroup,
            ruleGroupArn: input.ruleGroupArn,
        };
        try {
            const ruleBundle = await this.ruleBundleDataSourceService.updateRuleBundle(
                ruleGroupToBeUpdated
            );

            return ServerlessResponse.ofObject(200, ruleBundle);
        } catch (e) {
            this.logger.error('Error while updating rule bundle', e, input);
            return ServerlessResponse.ofObject(503, {
                message: `Error while update rule bundle ${ruleBundleId}, ${e.message}`,
            });
        }
    }
}
