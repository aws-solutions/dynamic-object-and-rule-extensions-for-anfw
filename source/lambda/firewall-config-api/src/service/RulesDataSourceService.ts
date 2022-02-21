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
    QueryCommand,
    QueryCommandInput,
    ScanCommand,
    ScanCommandInput,
} from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { FlowRule, Logger, LoggerFactory, PaginatedResults } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { CreateFlowRuleInput } from 'src/types/FlowRule';
import { inject, injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
@injectable()
export class RulesDataSourceService {
    logger: Logger;
    ruleTableName: string;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('RuleDataSourceService');
        this.ruleTableName =
            this.appConfiguration.getDefinitionSourceFor('RULE')?.tableName ?? '';
    }

    public async getRuleByReferences(objectId: string): Promise<FlowRule[]> {
        //scan table for reference, return only limit=50 tops rules
        this.logger.info(`Query table ${this.ruleTableName} `);
        const input: ScanCommandInput = {
            TableName: this.ruleTableName,
            ExpressionAttributeValues: marshall({
                ':source': objectId,
                ':destination': objectId,
            }),
            ExpressionAttributeNames: {
                '#source': 'source',
                '#destination': 'destination',
            },
            FilterExpression: '#source = :source or #destination =:destination',
        };
        const cmd = new ScanCommand(input);
        const response = await this.dynamoDBClient.send(cmd);
        this.logger.info('getRuleByReferences response', response);
        return response.Items?.map((i) => unmarshall(i) as FlowRule) ?? [];
    }

    public async getRulesByBundleId(
        ruleBundleId: string,
        limit?: number,
        nextToken?: string
    ): Promise<PaginatedResults<FlowRule>> {
        this.logger.info(
            `Query table ${this.ruleTableName} with ${limit} and nextToken ${nextToken} , rulegroupId ${ruleBundleId}`
        );
        const input: QueryCommandInput = {
            TableName: this.ruleTableName,
            IndexName: 'ruleBundleId',
            KeyConditionExpression: '#ruleBundleId = :ruleBundleId',
            ExpressionAttributeValues: marshall({
                ':ruleBundleId': ruleBundleId,
                ':status': 'DELETED',
            }),
            ExpressionAttributeNames: {
                '#ruleBundleId': 'ruleBundleId',
                '#status': 'status',
            },
            FilterExpression: '#status <> :status',
            ...(limit && { Limit: limit }),
            ...(nextToken && {
                ExclusiveStartKey: marshall({
                    id: nextToken,
                    ruleBundleId: ruleBundleId,
                }),
            }),
        };
        const command = new QueryCommand(input);

        this.logger.info('sending query command to ddb', input);

        const response = await this.dynamoDBClient.send(command);
        this.logger.info('dynamoDBClient object', response);

        const lastEvaluatedKey = response.LastEvaluatedKey?.id
            ? unmarshall(response.LastEvaluatedKey)
            : undefined;
        return {
            results: response.Items?.map((i) => unmarshall(i) as FlowRule) ?? [],
            ...(lastEvaluatedKey && { nextToken: lastEvaluatedKey['id'] }),
        };
    }

    public async getRuleBy(id: string): Promise<FlowRule | undefined> {
        const getItemCommand: GetItemCommand = new GetItemCommand({
            Key: marshall({ id: id }),
            TableName: this.ruleTableName,
        });
        const { Item: item } = await this.dynamoDBClient.send(getItemCommand);

        return item ? (unmarshall(item) as FlowRule) : undefined;
    }

    public async getRules(
        limit?: number,
        nextToken?: string
    ): Promise<PaginatedResults<FlowRule>> {
        this.logger.info(
            `Scaning table ${this.ruleTableName} with ${limit} and nextToken ${nextToken}`
        );
        const scanTableCommand: ScanCommand = new ScanCommand({
            TableName: this.ruleTableName,
            ...(limit && { Limit: limit }),
            ...(nextToken && { ExclusiveStartKey: marshall({ id: nextToken }) }),
        });
        const response = await this.dynamoDBClient.send(scanTableCommand);
        const lastEvaluatedKey = response.LastEvaluatedKey?.id
            ? unmarshall(response.LastEvaluatedKey)
            : undefined;
        return {
            results: response.Items?.map((i) => unmarshall(i) as FlowRule) ?? [],
            ...(lastEvaluatedKey && { nextToken: lastEvaluatedKey['id'] }),
        };
    }
    public async deleteRuleBy(ruleBundleId: string, ruleId: string): Promise<string> {
        const updateItemCommand: DeleteItemCommand = new DeleteItemCommand({
            Key: marshall({ id: ruleId }),
            TableName: this.ruleTableName,
            ConditionExpression:
                'attribute_exists(#id) and #ruleBundleId = :ruleBundleId',
            ExpressionAttributeNames: {
                '#id': 'id',
                '#ruleBundleId': 'ruleBundleId',
            },
            ExpressionAttributeValues: marshall({
                ':ruleBundleId': ruleBundleId,
            }),
        });
        try {
            await this.dynamoDBClient.send(updateItemCommand);
        } catch (error) {
            this.logger.error('An error occurred when deleting an existing rule', error);
            throw new RuleConfigError(
                'An error occurred when deleting an existing rule',
                500,
                true
            );
        }
        return ruleId;
    }

    public async createRule(requestedRule: CreateFlowRuleInput): Promise<FlowRule> {
        const input: FlowRule = {
            ...requestedRule,
            lastUpdated: new Date().toISOString(),
            id: uuidv4(),
            version: 0,
        };
        const getItemCommand: PutItemCommand = new PutItemCommand({
            Item: marshall(input),
            TableName: this.ruleTableName,
            ConditionExpression: 'attribute_not_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        });
        try {
            await this.dynamoDBClient.send(getItemCommand);
        } catch (error) {
            this.logger.error(
                'Error occurred when inserting a new rule into database ',
                error
            );
            throw new RuleConfigError(
                'An error occurred when saving the new rule',
                500,
                true
            );
        }
        return input;
    }

    public async updateRule(requestedRule: FlowRule): Promise<FlowRule> {
        const currentVersion = requestedRule.version;
        const newVersion = currentVersion + 1;
        const ruleTobeUpdated: FlowRule = {
            ...requestedRule,
            lastUpdated: new Date().toISOString(),
            version: newVersion,
        };
        const getItemCommand: PutItemCommand = new PutItemCommand({
            Item: marshall(ruleTobeUpdated),
            TableName: this.ruleTableName,
            ConditionExpression:
                'attribute_exists(#id) and #ruleBundleId = :ruleBundleId and #version = :expectedVersion',

            ExpressionAttributeNames: {
                '#id': 'id',
                '#ruleBundleId': 'ruleBundleId',
                '#version': 'version',
            },
            ExpressionAttributeValues: marshall({
                ':ruleBundleId': requestedRule.ruleBundleId,
                ':expectedVersion': currentVersion,
            }),
        });
        try {
            await this.dynamoDBClient.send(getItemCommand);
        } catch (error) {
            this.logger.error(
                'Error occurred when inserting a new rule into database ',
                error
            );
            throw new RuleConfigError(
                'An error occurred when saving the new rule',
                500,
                true
            );
        }
        return ruleTobeUpdated;
    }
}
