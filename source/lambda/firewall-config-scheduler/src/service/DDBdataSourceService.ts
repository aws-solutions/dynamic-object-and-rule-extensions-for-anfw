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
import {
    DynamoDBClient,
    ScanCommand,
    UpdateItemCommand,
    UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { FlowRuleBundle, Logger, LoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { inject, injectable } from 'tsyringe';
@injectable()
export class DDBdataSourceService {
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('DDBdataSourceService');
    }

    public async getRuleBundles(): Promise<FlowRuleBundle[]> {
        const ruleBundleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULEBUNDLE')?.tableName ?? '';
        const scanCommand: ScanCommand = new ScanCommand({
            TableName: ruleBundleTableName,
        });
        const scanResposne = await this.dynamoDBClient.send(scanCommand);
        const allRuleGroups = scanResposne.Items?.map(
            (i) => unmarshall(i) as FlowRuleBundle
        );
        this.logger.info('got all rulegroups', allRuleGroups);

        return allRuleGroups ?? [];
    }

    async updateRuleGroupTimeStamps(ruleBundles: FlowRuleBundle[]): Promise<void> {
        const ruleBundleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULEBUNDLE')?.tableName ?? '';
        for await (const bundle of ruleBundles) {
            const udpateItemInput: UpdateItemCommandInput = {
                TableName: ruleBundleTableName,
                Key: marshall({
                    id: bundle.id,
                }),
                UpdateExpression:
                    'set  #lastSuccessSyncTimestamp = :lastSuccessSyncTimestamp',

                ExpressionAttributeNames: {
                    '#lastSuccessSyncTimestamp': 'lastSuccessSyncTimestamp',
                },
                ExpressionAttributeValues: marshall({
                    ':lastSuccessSyncTimestamp': new Date().toISOString(),
                }),
            };
            const command = new UpdateItemCommand(udpateItemInput);
            const response = await this.dynamoDBClient.send(command);
            this.logger.info('ddb updating result', response);
        }
    }
}
