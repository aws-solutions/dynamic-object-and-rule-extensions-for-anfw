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
import { inject, injectable } from 'tsyringe';

export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleId: string;
};

/**
 * @api {delete} /rulebundles/{id} Delete rule bundle
 * @apiGroup RuleBundle
 * @apiDescription Delete a rule bundle
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request DELETE 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-demo1' 
* @apiSuccess (Success 200) Object updated
* @apiError (Error 404) Object not found
* @apiError (Error 400) Invalid Object value
* @apiError (Error 502) Time out
* @apiError (Error 503) Internal error
* 
* @apiSuccessExample Success-Response: 
*  HTTP/1.1 200 OK
*  {
    "id": "demo-group-demo1"
    }
* 
* @apiSampleRequest off
*/
@injectable()
export class DeleteRuleConfigHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleBundleDataSourceService: RuleBundleDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('DeleteRuleConfigHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.debug('Processing delete rule bundle request');

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
        try {
            const ruleBundles = await this.ruleBundleDataSourceService.getRulesBy(
                ruleBundleId
            );
            if (ruleBundles.length === 0) {
                this.logger.info(`Deleting empty referenced rulegorup ${ruleBundleId}`);
                await this.ruleBundleDataSourceService.deleteRuleBundle(ruleBundleId);
                return ServerlessResponse.ofObject(200, { ruleBundleId: ruleBundleId });
            } else {
                this.logger.info(
                    `Can not delete non-empty referenced rulegorup ${ruleBundleId}`
                );
                return ServerlessResponse.ofObject(400, {
                    message: `${ruleBundleId} was not able to be deleted as it referenced by active rules`,
                    rulesId: ruleBundles.map((r) => r.id),
                });
            }
        } catch (e) {
            this.logger.error(`Error while deleting rule bundle ${ruleBundleId}`, e);
            return ServerlessResponse.ofObject(500, {
                message: `${ruleBundleId} was not able to be deleted`,
            });
        }
    }
}
