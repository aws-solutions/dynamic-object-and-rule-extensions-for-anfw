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
import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb'; // ES Modules
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { FlowAudit, Logger, LoggerFactory, PaginatedResults } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { inject, injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
type FlowAuditInput = Omit<FlowAudit, 'id'>;
@injectable()
export class AuditsDataSourceService {
    logger: Logger;
    auditTableName: string;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DynamoDBClient') private dynamoDBClient: DynamoDBClient,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('AuditsDataSourceService');
        this.auditTableName =
            this.appConfiguration.getDefinitionSourceFor('AUDIT')?.tableName ?? '';
    }

    public async getAudits(
        limit?: number,
        nextToken?: string
    ): Promise<PaginatedResults<FlowAudit>> {
        this.logger.info(
            `Scanning table ${this.auditTableName} with ${limit} and nextToken ${nextToken}`
        );
        const scanTableCommand: ScanCommand = new ScanCommand({
            TableName: this.auditTableName,
            ...(limit && { Limit: limit }),
            ...(nextToken && { ExclusiveStartKey: marshall({ id: nextToken }) }),
        });
        const response = await this.dynamoDBClient.send(scanTableCommand);
        const lastEvaluatedKey = response.LastEvaluatedKey?.id
            ? unmarshall(response.LastEvaluatedKey)
            : undefined;
        return {
            results: response.Items?.map((i) => unmarshall(i) as FlowAudit) ?? [],
            ...(lastEvaluatedKey && { nextToken: lastEvaluatedKey['id'] }),
        };
    }

    public async createAuditEntry(audit: FlowAuditInput): Promise<FlowAudit> {
        const id = uuidv4();
        this.logger.info(`Adding new audit record ${id} `);
        const input: FlowAudit = {
            ...audit,
            id: id,
            requestedTimestamp: new Date().toISOString(),
        };
        const getItemCommand: PutItemCommand = new PutItemCommand({
            Item: marshall(input),
            TableName: this.auditTableName,
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
}
