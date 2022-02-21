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
    BatchGetItemCommand,
    BatchGetItemCommandInput,
    DynamoDBClient,
    GetItemCommand,
    QueryCommand,
    QueryCommandInput,
    UpdateItemCommand,
    UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
    FlowObject,
    FlowRule,
    FlowRuleBundle,
    Logger,
    LoggerFactory,
} from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { inject, injectable } from 'tsyringe';
type KeyAttribute = { id: { S: string } };
@injectable()
export class DDBdataSourceService {
    DEFAULT_CHUNK_SIZE = 100;
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('DDBdataSourceService');
    }

    public async getRulesBy(ruleBundleId: string): Promise<FlowRule[]> {
        this.logger.info(`get rules by rule bundle id => ${ruleBundleId}`);
        const objectTableName = this.appConfiguration.getDefinitionSourceFor('RULE')
            ?.tableName;

        const input: QueryCommandInput = {
            TableName: objectTableName,
            IndexName: 'ruleBundleId',
            KeyConditionExpression: '#ruleBundleId = :ruleBundleId',
            ExpressionAttributeValues: marshall({
                ':ruleBundleId': ruleBundleId,
                ':status': 'FAILED',
            }),
            ExpressionAttributeNames: {
                '#ruleBundleId': 'ruleBundleId',
                '#status': 'status',
            },
            FilterExpression: '#status <> :status',
        };

        let LastEvaluatedKey;
        let response;
        let results: FlowRule[] = [];
        while (LastEvaluatedKey || !response) {
            input.ExclusiveStartKey = LastEvaluatedKey;
            const command = new QueryCommand(input);

            this.logger.info('sending query command to ddb', input);
            response = await this.dynamoDBClient.send(command);
            this.logger.info('dynamoDBClient object', response);
            LastEvaluatedKey = response.LastEvaluatedKey;
            const currentBatch =
                response.Items?.map((element) => unmarshall(element) as FlowRule) ?? [];
            this.logger.info('dynamoDBClient currentBatch', currentBatch);
            results = results.concat(currentBatch);
        }
        return results;
    }

    public async getObjects(objReferenceIds: string[]): Promise<FlowObject[]> {
        this.logger.info('get object', objReferenceIds);
        const objectTableName =
            this.appConfiguration.getDefinitionSourceFor('OBJECT')?.tableName ?? '';
        const requestingTargetIds: KeyAttribute[] = objReferenceIds.map((id) => ({
            id: { S: id },
        }));
        const chunked = this.chunkIds(requestingTargetIds);

        return Promise.all(
            chunked.map(async (batchIds) =>
                this.getObjectsByIds(objectTableName, batchIds)
            )
        ).then((r) => r.flatMap((i) => i));
    }

    private chunkIds(requestingTargetIds: KeyAttribute[]): KeyAttribute[][] {
        // https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html
        const chunked = new Array<KeyAttribute[]>();
        const size = this.DEFAULT_CHUNK_SIZE;
        Array.from({ length: Math.ceil(requestingTargetIds.length / size) }, (_, i) => {
            chunked.push(requestingTargetIds.slice(i * size, i * size + size));
        });
        return chunked;
    }

    private async getObjectsByIds(
        targetTableName: string,
        requestingObjectIds: KeyAttribute[]
    ): Promise<FlowObject[]> {
        const input: BatchGetItemCommandInput = {
            RequestItems: {
                [targetTableName]: {
                    Keys: requestingObjectIds,
                },
            },
        };
        this.logger.info('requesting batch', input);

        const command = new BatchGetItemCommand(input);

        const response = await this.dynamoDBClient.send(command);
        this.logger.info('dynamoDBClient response', response);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return response.Responses![targetTableName].map(
            (item) => unmarshall(item) as FlowObject
        );
    }

    public async getRuleBundleBy(id: string): Promise<FlowRuleBundle | undefined> {
        const ruleBundleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULEBUNDLE')?.tableName ?? '';
        const getItemCommand: GetItemCommand = new GetItemCommand({
            Key: marshall({ id: id }),
            TableName: ruleBundleTableName,
        });
        const { Item: item } = await this.dynamoDBClient.send(getItemCommand);

        return item ? (unmarshall(item) as FlowRuleBundle) : undefined;
    }

    async getRuleBundleByIds(ruleBundleIds: string[]): Promise<FlowRuleBundle[]> {
        const requestingObjectIds: KeyAttribute[] = ruleBundleIds.map((id) => ({
            id: { S: id },
        }));

        const ruleBundleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULEBUNDLE')?.tableName ?? '';
        const input: BatchGetItemCommandInput = {
            RequestItems: {
                [ruleBundleTableName]: {
                    Keys: requestingObjectIds,
                },
            },
        };
        this.logger.info('requesting batch', input);

        const command = new BatchGetItemCommand(input);

        const response = await this.dynamoDBClient.send(command);
        this.logger.info('dynamoDBClient response', response);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return response.Responses![ruleBundleTableName].map(
            (item) => unmarshall(item) as FlowRuleBundle
        );
    }
    public async updateRules(rules: FlowRule[]): Promise<FlowRule[]> {
        //replace with transaction write
        // should only update failed rules, or pending rules to active/fail
        const ruleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULE')?.tableName ?? '';
        for await (const rule of rules) {
            // TODO add error handling when tx failed/version clash
            this.logger.info('updating rule to ddb', rule);
            const currentVersion = rule.version;
            const udpateItemInput: UpdateItemCommandInput = {
                TableName: ruleTableName,
                Key: marshall({
                    id: rule.id,
                }),
                UpdateExpression:
                    'set #status = :newStatus, #failureReasons = :failureReasons, #version = :newVersion',
                ConditionExpression: '#version = :expectedVersion',
                ExpressionAttributeNames: {
                    '#status': 'status',
                    '#version': 'version',
                    '#failureReasons': 'failureReasons',
                },
                ExpressionAttributeValues: marshall({
                    ':newStatus': rule.status,
                    ':newVersion': currentVersion + 1,
                    ':expectedVersion': currentVersion,
                    ':failureReasons': rule.failureReasons ?? [],
                }),
            };
            const command = new UpdateItemCommand(udpateItemInput);
            const response = await this.dynamoDBClient.send(command);
            this.logger.info('ddb updating result', response);
        }

        return rules;
    }
}
