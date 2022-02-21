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
import RuleConfigError from 'src/common/RuleConfigError';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { inject, injectable } from 'tsyringe';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import { ServerlessResponse } from 'src/common/ServerlessResponse';

export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleId: string;
};

/**
 * @api {get} /rulebundles Get a rule bundle
 * @apiGroup RuleBundle
 * @apiDescription Get get rule bundle 
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/{id}'
* @apiSuccess (Success 201) Rule Bundle created
* @apiError (Error 403) Forbidden Requestor's arn is not authorized to perform this action
* @apiError (Error 404) NotFound The rule bundle with {id} does not exits
* @apiError (Error 400) BadRequest ruleGroupArn does not exists
* @apiError (Error 502) Timeout
* @apiError (Error 503) ServiceUnavailable
* 
* @apiSuccessExample Success-Response: 
*  HTTP/1.1 200 OK
*  {
    "id":"demo-group-demo",
    "description": "demo rule bundle",
    "ownerGroup": [
        "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
    ],
    "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup-1"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class GetRuleConfigHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleBundleDataSourceService: RuleBundleDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('RuleConfigHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        if (!event.pathParameters || !event.pathParameters['id']) {
            return ServerlessResponse.ofError(
                new RuleConfigError('Parameter rule bundle id not found', 400, false)
            );
        }

        const ruleBundleId = event.pathParameters['id'];

        const ruleGroup = await this.ruleBundleDataSourceService.getRuleBundleBy(
            ruleBundleId
        );
        const returnCode = ruleGroup ? 200 : 404;
        return ServerlessResponse.ofObject(returnCode, ruleGroup ?? {});
    }
}
