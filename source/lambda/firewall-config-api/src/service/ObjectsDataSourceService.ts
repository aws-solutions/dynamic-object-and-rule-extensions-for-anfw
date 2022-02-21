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
    ScanCommand,
} from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { FlowObject, Logger, LoggerFactory, PaginatedResults } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { FlowObjectInput } from 'src/types/FlowTarget';
import { inject, injectable } from 'tsyringe';
@injectable()
export class ObjectsDataSourceService {
    logger: Logger;
    objectTableName: string;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('ObjectsDataSourceService');
        this.objectTableName =
            this.appConfiguration.getDefinitionSourceFor('OBJECT')?.tableName ?? '';
    }

    public async getObjects(
        limit?: number,
        nextToken?: string
    ): Promise<PaginatedResults<FlowObject>> {
        this.logger.info(
            `Scanning table ${this.objectTableName} with ${limit} and nextToken ${nextToken}`
        );
        const scanTableCommand: ScanCommand = new ScanCommand({
            TableName: this.objectTableName,
            ...(limit && { Limit: limit }),
            ...(nextToken && { ExclusiveStartKey: marshall({ id: nextToken }) }),
        });
        const response = await this.dynamoDBClient.send(scanTableCommand);
        const lastEvaluatedKey = response.LastEvaluatedKey?.id
            ? unmarshall(response.LastEvaluatedKey)
            : undefined;
        return {
            results: response.Items?.map((i) => unmarshall(i) as FlowObject) ?? [],
            ...(lastEvaluatedKey && { nextToken: lastEvaluatedKey['id'] }),
        };
    }

    public async getObjectBy(id: string): Promise<FlowObject | undefined> {
        const getItemCommand: GetItemCommand = new GetItemCommand({
            Key: marshall({ id: id }),
            TableName: this.objectTableName,
        });
        const { Item: item } = await this.dynamoDBClient.send(getItemCommand);

        return item ? (unmarshall(item) as FlowObject) : undefined;
    }

    public async createObject(
        targetInput: FlowObjectInput,
        operatorIdentity: string
    ): Promise<FlowObject> {
        const input: FlowObject = {
            ...targetInput,
            createdBy: operatorIdentity,
            lastUpdated: new Date().toISOString(),
        };
        const getItemCommand: PutItemCommand = new PutItemCommand({
            Item: marshall(input),
            TableName: this.objectTableName,
            ConditionExpression: 'attribute_not_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        });
        try {
            await this.dynamoDBClient.send(getItemCommand);
        } catch (error) {
            this.logger.error(
                'Error occurred when inserting a new object into database ',
                error
            );
            throw new RuleConfigError(
                'An error occurred when saving the new object',
                500,
                true
            );
        }
        return input;
    }

    public async deleteObject(id: string): Promise<void> {
        this.logger.info(`attempt to delete the object ${id}`);

        const deleteItemCmd: DeleteItemCommand = new DeleteItemCommand({
            Key: marshall({ id: id }),
            TableName: this.objectTableName,
            ConditionExpression: 'attribute_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        });

        await this.dynamoDBClient.send(deleteItemCmd);
    }

    public async updateObject(ruleObject: FlowObjectInput): Promise<FlowObject> {
        const currentTarget = await this.getObjectBy(ruleObject.id);
        if (!currentTarget) {
            throw new RuleConfigError(
                `Requested object not exists ${ruleObject.id}`,
                404,
                true
            );
        }

        const input: FlowObject = {
            ...currentTarget,
            type: ruleObject.type,
            value: ruleObject.value,
            lastUpdated: new Date().toISOString(),
        };
        const getItemCommand: PutItemCommand = new PutItemCommand({
            Item: marshall(input),
            TableName: this.objectTableName,
            ConditionExpression: 'attribute_exists(#id)',
            ExpressionAttributeNames: {
                '#id': 'id',
            },
        });
        try {
            await this.dynamoDBClient.send(getItemCommand);
        } catch (error) {
            this.logger.error(
                'Error occurred when updating a new object into database ',
                error
            );
            throw new RuleConfigError(
                'An error occurred when saving the new object',
                500,
                true
            );
        }
        return input;
    }
}
