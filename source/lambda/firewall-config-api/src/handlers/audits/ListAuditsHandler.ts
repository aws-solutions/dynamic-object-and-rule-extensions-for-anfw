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
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { inject, injectable } from 'tsyringe';

const MAX_NUM_RESULTS = 100;

/**
 * @api {get} /audits List audits request
 * @apiName GetAudits
 * @apiGroup Audits
 *  @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/audits' 
 * @apiParam (Optional Query Parameters) {number{1-100}} [limit=100] The number of audits per page.
* @apiParam (Optional Query Parameters) {string} [nextToken] The pagination token.
* @apiSuccess (Success 200) Evaluation result
* @apiError (Error 503) Internal error
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "results": [
        {
            "requestedTimestamp": "2021-09-15T02:53:39.725Z",
            "requestedBy": "arn:aws:sts::<account_number>:assumed-role/ObjectExtensionSecOpsAdminRole/ObjectExtensionSecOpsAdminRole",
            "id": "0236070c-d95c-49fe-84ef-47e9625b4312",
            "requestedChange": {
                "type": "CREATE",
                "changeContent": {
                    "requestedObject": {
                        "lastUpdated": "2021-09-15T02:53:39.702Z",
                        "protocol": "tcp",
                        "destination": "Ec2_VPC_int_kbxZPcQP9dz3Fc3PsqZ23y",
                        "action": "pass",
                        "source": "Onprem_Server_int_kbxZPcQP9dz3Fc3PsqZ23y",
                        "id": "0902f0e0-269e-466e-aa0e-48630aab0d2e",
                        "ruleBundleId": "integration-test-group-e99dfe8d-c143-4f72-9252-89dd75345d23",
                        "version": 0,
                        "status": "PENDING"
                    }
                },
                "changeResult": "SUCCESS",
                "reasonPhrase": []
            }
        }]
}  
* 
* @apiSampleRequest off
 */

@injectable()
export class ListAuditsHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('AuditsDataSourceService')
        private auditsDataSourceService: AuditsDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('ListObjectsHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        this.logger.info('lambda event context', _context);

        let limit = parseInt(event.queryStringParameters?.limit as string);
        if (!limit || limit <= 0 || limit > MAX_NUM_RESULTS || isNaN(limit)) {
            limit = MAX_NUM_RESULTS;
        }
        this.logger.debug(`Listing objects, up to ${limit} audits will be returned.`);
        const auditsRecords = await this.auditsDataSourceService.getAudits(
            limit,
            event.queryStringParameters?.nextToken
        );
        this.logger.debug(`Found ${auditsRecords.results.length} audits records.`);

        return ServerlessResponse.ofObject(200, auditsRecords);
    }
}
