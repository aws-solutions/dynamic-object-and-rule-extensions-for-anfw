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
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { CreateRuleBundleInputValidator } from 'src/validators/CreateRuleBundleInputValidator';
import { inject, injectable } from 'tsyringe';

export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleId: string;
};

/**
 * @api {post} /rulebundles Create new rule bundle
 * @apiGroup RuleBundle
 * @apiDescription Create new rule bundle referencing a cloud resource or fixed resource
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request POST 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/' --data-raw '{
  "id":"demo-bundle",
  "description": "demo rule bundle",
  "ownerGroup": [
    "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
  ],
  "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup"
}'
* @apiSuccess (Success 201) Rule Bundle created
* @apiParam {string} description Description of this rule bundle
* @apiParam {String[1..100]="[0-9a-zA-Z_-]+"}  id The object's id. id Id of this rule bundle
* @apiParam {list[]}  ownerGroup The owner group, this is SecOpsAdminRole provided by the solution
* @apiParam {string}  ruleGroupArn The underlying AWS network firewall rule bundle arn
* @apiParam {String[1..1000]="[ 0-9a-zA-Z_-]+"}  description of the rule bundle
* @apiError (Error 400) Unsupported Port Type
* @apiError (Error 400) Unsupported Object Type
* @apiError (Error 400) Invalid Object value
* @apiError (Error 502) Time out
* @apiError (Error 503) Internal error
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 201 OK
*  {
    "id": "demo-bundle"
}
* 
* @apiSampleRequest off
*/
@injectable()
export class CreateRuleBundleHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;
    private readonly defaultAggregatorName: string;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleBundleDataSourceService: RuleBundleDataSourceService,
        @inject('CreateRuleBundleInputValidator')
        private validator: CreateRuleBundleInputValidator,
        @inject('AppConfiguration') appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('CreateRuleConfigHandler');
        this.defaultAggregatorName = appConfiguration.defaultAggregatorName;
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        this.logger.debug('Processing create rule bundle request');
        const input = await this.validator.parseAndValidate(event);

        const ruleBundleToBeCreated = {
            ...(input.id && { id: input.id }),
            aggregatorName: input.aggregatorName ?? this.defaultAggregatorName,
            description: input.description,
            ownerGroup: input.ownerGroup,
            ruleGroupArn: input.ruleGroupArn,
        };

        try {
            if (input.id) {
                const existingRuleBundles = await this.ruleBundleDataSourceService.getRuleBundleBy(
                    input.id
                );
                if (existingRuleBundles) {
                    this.logger.error(
                        `Error while creating rule bundle, ${input.id} already exists`,
                        existingRuleBundles
                    );

                    return ServerlessResponse.ofError(
                        new RuleConfigError(
                            `Error while creating rule bundle, ${existingRuleBundles.id} already exists`,
                            409,
                            true
                        )
                    );
                }
            }

            const bundleId = await this.ruleBundleDataSourceService.createRuleBundle(
                ruleBundleToBeCreated
            );

            return ServerlessResponse.ofObject(201, { id: bundleId });
        } catch (e) {
            this.logger.error('Error while updating rule bundle', e, input);
            return ServerlessResponse.ofObject(503, {
                message: `Error while creating rule bundle , ${e.message}`,
            });
        }
    }
}
