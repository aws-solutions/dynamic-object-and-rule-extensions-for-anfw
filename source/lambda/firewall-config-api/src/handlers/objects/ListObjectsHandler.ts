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
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { inject, injectable } from 'tsyringe';

const MAX_NUM_RESULTS = 100;

/**
 * @api {get} /objects List objects
 * @apiGroup Objects
 * @apiDescription List objects
 * 
 * @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/'
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
            "value": "arn:aws:ec2:ap-southeast-2:10000:vpc/vpc-0c315768612ee4eb1",
            "lastUpdated": "2021-09-15T02:53:38.350Z",
            "id": "Ec2_VPC_int_kbxZPcQP9dz3Fc3PsqZ23y",
            "createdBy": "arn:aws:sts::10000:assumed-role/ObjectExtensionSecOpsAdminRole/ObjectExtensionSecOpsAdminRole",
            "type": "Arn"
        }
    }
* 
* @apiSampleRequest off
*/
@injectable()
export class ListObjectsHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectsDataSourceService')
        private objectsDataSourceService: ObjectsDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('ListTargetsHandler');
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
        this.logger.debug(`Listing objects, up to ${limit} targets will be returned.`);
        const objects = await this.objectsDataSourceService.getObjects(
            limit,
            event.queryStringParameters?.nextToken
        );
        this.logger.debug(`Found ${objects.results.length} objects.`);

        return ServerlessResponse.ofObject(200, objects);
    }
}
