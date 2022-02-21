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
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { inject, injectable } from 'tsyringe';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { parse, build } from '@aws-sdk/util-arn-parser';

export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleId: string;
};

const MAX_NUM_RESULTS = 100;
const STS_ROLE_REGEX = /(assumed-role)\/(.*)\/(.*)/;
/**
 * @api {get} /rulebundles List rule bundles
 * @apiGroup RuleBundle
 * @apiDescription List rule bundles belongs to this requestor's arn
 * 
 * @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/'
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
            "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account_number>:stateful-rulegroup/anfwconfig-testrulegroup-demo",
            "ownerGroup": [
                "arn:aws:iam::<account_number>:role/ObjectExtensionSecOpsAdminRole"
            ],
            "description": "integration rule bundle admin only",
            "id": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23",
            "createdTimestamp": "2021-09-15T02:53:53.435Z",
            "aggregatorName": "org-replicator"
        }
    ],
    "nextToken": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class ListRuleBundlesHandler
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

        let limit = parseInt(event.queryStringParameters?.limit as string);
        if (!limit || limit <= 0 || limit > MAX_NUM_RESULTS) {
            limit = MAX_NUM_RESULTS;
        }
        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unkonwn';
        this.logger.debug(
            `Listing ruleBundles for ${requestorIdentity}, up to ${limit} estates will be returned.`
        );
        const requestorAssumedRole = this.extractRequestorAssumedRole(
            requestorIdentity,
            event.requestContext.accountId
        );

        const ruleBundles = await this.ruleBundleDataSourceService.getRuleBundles(
            limit,
            event.queryStringParameters?.nextToken,
            requestorAssumedRole
        );
        this.logger.debug(`Found ${ruleBundles?.results.length} rule bundles.`);

        return ServerlessResponse.ofObject(200, ruleBundles);
    }

    private extractRequestorAssumedRole(requestorIdentity: string, accountId: string) {
        const result = parse(requestorIdentity);
        const match = result.resource.match(STS_ROLE_REGEX);

        const roleName = match && match[2];

        const requestorAssumedRole = build({
            accountId: accountId,
            region: '',
            service: 'iam',
            resource: `role/${roleName}`,
        });
        this.logger.info(`requestorAssumedRole ${requestorAssumedRole}`);
        return requestorAssumedRole;
    }
}
