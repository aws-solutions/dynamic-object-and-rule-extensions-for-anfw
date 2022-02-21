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
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { inject, injectable } from 'tsyringe';

/**
 * @api {get} /objects/{id} Get an object
 * @apiGroup Objects
 * @apiDescription Get an object referencing a cloud resource or fixed resource
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/Onprem_Server' 
* @apiSuccess (Success 200) Object updated
* @apiError (Error 404) Object not found
* @apiError (Error 400) Invalid Object value
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
export class GetObjectHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectsDataSourceService')
        private objectsDataSourceService: ObjectsDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('GetTargetHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        if (!event.pathParameters || !event.pathParameters['id']) {
            return ServerlessResponse.ofError(
                new RuleConfigError('Parameter rule object id not found', 400, false)
            );
        }

        const objectId = event.pathParameters['id'];

        const target = await this.objectsDataSourceService.getObjectBy(objectId);
        const returnCode = target ? 200 : 404;
        return ServerlessResponse.ofObject(returnCode, target ?? {});
    }
}
