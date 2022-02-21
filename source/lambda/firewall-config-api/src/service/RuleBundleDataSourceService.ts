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
    DeleteItemCommand,
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    PutItemCommandInput,
    QueryCommand,
    QueryCommandInput,
    ScanCommand,
} from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
    FlowRule,
    FlowRuleBundle,
    Logger,
    LoggerFactory,
    PaginatedResults,
} from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { CreateRuleBundleInput, UpdateRuleBundleInput } from 'src/types/RuleGroups';
import { inject, injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
@injectable()
export class RuleBundleDataSourceService {
    logger: Logger;
    ruleGroupTableName: string;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('RuleBundleDataSourceService');
        this.ruleGroupTableName =
            this.appConfiguration.getDefinitionSourceFor('RULEBUNDLE')?.tableName ?? '';
    }

    public async getRuleBundleBy(id: string): Promise<FlowRuleBundle | undefined> {
        const getItemCommand: GetItemCommand = new GetItemCommand({
            Key: marshall({ id: id }),
            TableName: this.ruleGroupTableName,
        });
        const { Item: item } = await this.dynamoDBClient.send(getItemCommand);

        return item ? (unmarshall(item) as FlowRuleBundle) : undefined;
    }

    public async getRuleBundles(
        limit?: number,
        nextToken?: string,
        requesterArn?: string
    ): Promise<PaginatedResults<FlowRuleBundle>> {
        this.logger.info(
            `Scaning table ${this.ruleGroupTableName} with ${limit} and nextToken ${nextToken}`
        );
        const scanTableCommand: ScanCommand = new ScanCommand({
            TableName: this.ruleGroupTableName,
            ExpressionAttributeNames: {
                '#ownerGroup': 'ownerGroup',
            },
            FilterExpression: 'contains(#ownerGroup, :requesterArn)',
            ExpressionAttributeValues: marshall({ ':requesterArn': requesterArn }),
            ...(limit && { Limit: limit }),
            ...(nextToken && { ExclusiveStartKey: marshall({ id: nextToken }) }),
        });
        const response = await this.dynamoDBClient.send(scanTableCommand);
        const lastEvaluatedKey = response.LastEvaluatedKey?.id
            ? unmarshall(response.LastEvaluatedKey)
            : undefined;
        return {
            results: response.Items?.map((i) => unmarshall(i) as FlowRuleBundle) ?? [],
            ...(lastEvaluatedKey && { nextToken: lastEvaluatedKey['id'] }),
        };
    }

    async updateRuleBundle(input: UpdateRuleBundleInput): Promise<FlowRuleBundle> {
        const currentRuleGroup = await this.getRuleBundleBy(input.id);
        if (!currentRuleGroup) {
            throw new RuleConfigError('Rule bundle not found', 404, true);
        }

        const ruleGroup = { ...currentRuleGroup, ...input };
        await this.simpleUpdate(ruleGroup);
        return ruleGroup;
    }

    private async simpleUpdate(input: FlowRuleBundle) {
        this.logger.info('attempt to update the rule bundle basic info', input);
        // simple update
        const putCmdInput = {
            TableName: this.ruleGroupTableName,
            Item: marshall(input),
            ConditionExpression: 'attribute_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        };
        const command = new PutItemCommand(putCmdInput);
        await this.dynamoDBClient.send(command);
    }

    async createRuleBundle(input: CreateRuleBundleInput): Promise<string> {
        const newId = input.id ?? uuidv4();
        const newRuleGroup = {
            ...input,
            id: newId,
            createdTimestamp: new Date().toISOString(),
        };
        this.logger.info(`creating rule bundle of arn ${newRuleGroup.ruleGroupArn}`);
        const cmdInput: PutItemCommandInput = {
            TableName: this.ruleGroupTableName,
            Item: marshall(newRuleGroup),
            ConditionExpression: 'attribute_not_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        };
        const command = new PutItemCommand(cmdInput);

        await this.dynamoDBClient.send(command);

        return newId;
    }

    public async getRulesBy(bundleId: string): Promise<FlowRule[]> {
        this.logger.info(`get rules by rule bundle id => ${bundleId}`);
        const objectTableName = this.appConfiguration.getDefinitionSourceFor('RULE')
            ?.tableName;

        const input: QueryCommandInput = {
            TableName: objectTableName,
            IndexName: 'ruleBundleId',
            KeyConditionExpression: '#ruleBundleId = :ruleBundleId',
            ExpressionAttributeValues: marshall({
                ':ruleBundleId': bundleId,
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

    public async deleteRuleBundle(bundleId: string): Promise<void> {
        this.logger.info('attempt to delete the rule bundle basic info', bundleId);
        const currentRuleGroup = await this.getRuleBundleBy(bundleId);
        if (!currentRuleGroup) {
            throw new RuleConfigError(`${bundleId} not exists`, 400);
        }
        const deleteItemCmd: DeleteItemCommand = new DeleteItemCommand({
            Key: marshall({ id: bundleId }),
            TableName: this.ruleGroupTableName,
            ConditionExpression: 'attribute_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        });

        await this.dynamoDBClient.send(deleteItemCmd);
    }
}
