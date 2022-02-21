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

const MAX_NUM_RESULTS = 100;
/**
 * @api {get} /rulebundles/{id}/rules List rules
 * @apiGroup Rule
 * @apiDescription List rule bundles belongs to requestor's arn
 * 
 * @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/rulebundle_id/rules'
* @apiParam (Optional Query Parameters) {number{1-100}} [limit=100] The number of object per page.
* @apiParam (Optional Query Parameters) {string} [nextToken] The pagination token.
* @apiSuccess (Success 200) Object results
* @apiError (Error 502) Timeout Service timed out
* @apiError (Error 503) InternalError Internal error occurred 
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "results": [
        {
            "id": "rule_id",
            "version": 536,
            "lastUpdated": "2021-09-15T02:53:53.754Z",
            "action": "drop",
            "protocol": "udp",
            "status": "ACTIVE",
            "ruleBundleId": "rulebundle_id",
            "destination": "Ec2_SUBNET",
            "source": "Onprem_Server",
            "failureReasons": [],
             "destinationPort": {
            "type": "SinglePort",
            "value": '123'
            },
            "sourcePort": {
                "type": "Any"
            },
        }
    ],
    "nextToken": "rule_id_2"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class ListRulesHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RulesDataSourceService')
        private rulesDataSourceService: RulesDataSourceService,
        @inject('RuleGroupAuthenticationValidator')
        private ruleGroupAuthenticationValidator: RuleGroupAuthenticationValidator
    ) {
        this.logger = loggerFactory.getLogger('ListRulesHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        this.logger.info('lambda event context', _context);

        let limit = parseInt(event.queryStringParameters?.limit as string);
        if (!limit || limit <= 0 || limit > MAX_NUM_RESULTS) {
            limit = MAX_NUM_RESULTS;
        }
        this.logger.debug(`Listing objects, up to ${limit} objects will be returned.`);
        if (!event.pathParameters) {
            return ServerlessResponse.ofError(new RuleConfigError(undefined, 400, false));
        }
        const pathRuleGroupId = event.pathParameters['id'];
        if (!pathRuleGroupId) {
            this.logger.error('Rule bundle id path parameter cannot be null or empty.');
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Rule bundle id path parameter cannot be null or empty.',
                    400,
                    false
                )
            );
        }

        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unkonwn';
        const requestingAccountId = event.requestContext.accountId;
        const errorResposne = await this.ruleGroupAuthenticationValidator.checkRuleGroupAccess(
            requestorIdentity,
            pathRuleGroupId,
            requestingAccountId,
            'LIST'
        );
        if (errorResposne) {
            this.logger.error(`Authorization error ${errorResposne.body}`);
            return errorResposne;
        }

        const rules = await this.rulesDataSourceService.getRulesByBundleId(
            pathRuleGroupId,
            limit,
            event.queryStringParameters?.nextToken
        );
        this.logger.debug(`Found ${rules.results.length} objects.`);

        return ServerlessResponse.ofObject(200, rules);
    }
}
