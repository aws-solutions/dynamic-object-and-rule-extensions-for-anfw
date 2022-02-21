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
    PutItemCommand,
    PutItemCommandOutput,
    QueryCommand,
    QueryCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata';
import { FlowAudit, FlowObject, StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import {
    anything,
    capture,
    deepEqual,
    instance,
    mock,
    resetCalls,
    when,
} from 'ts-mockito';
const AUDIT_TABLE_NAME = 'auditTableName';
const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const TEST_AUDIT_1: FlowAudit = {
    id: 'audit-1',
    requestedBy: 'bla',
    requestedTimestamp: new Date().toISOString(),
    requestedChange: {
        type: 'CREATE',
        changeContent: {
            requestedObject: TEST_OBJECT_1,
        },
        changeResult: 'SUCCESS',

        reasonPhrase: [],
    },
};

describe('Test AuditsDataSourceService', () => {
    const ddbService: DynamoDBClient = mock(DynamoDBClient);
    const mockedDDBService = instance(ddbService);

    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfig = instance(applicationConfig);

    let objectUnderTest: AuditsDataSourceService;
    beforeEach(() => {
        resetCalls(ddbService);

        when(applicationConfig.getDefinitionSourceFor(deepEqual('AUDIT'))).thenReturn({
            name: 'AUDIT',
            tableName: AUDIT_TABLE_NAME,
        });

        objectUnderTest = new AuditsDataSourceService(
            new StaticLoggerFactory(),
            mockedDDBService,
            mockedAppConfig
        );
    });

    test('should return all audits', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_AUDIT_1)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getAudits();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(AUDIT_TABLE_NAME);

        expect(result.results).toHaveLength(1);
    });

    test('should return all adutis with paginated info', async () => {
        const nextToken = 'LastEvaluatedKey1';
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_AUDIT_1)],
            $metadata: {},
            LastEvaluatedKey: marshall({ id: nextToken }),
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getAudits();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(AUDIT_TABLE_NAME);

        expect(result.results).toHaveLength(1);
        expect(result.nextToken).toEqual(nextToken);
    });

    test('should return audits based on limit and token', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_AUDIT_1)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const limit = 55;
        const tokenValue = 'nextToken';
        const result = await objectUnderTest.getAudits(limit, tokenValue);

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(AUDIT_TABLE_NAME);
        expect(actualSentCmd.Limit).toEqual(limit);
        expect(actualSentCmd.ExclusiveStartKey).toEqual(marshall({ id: tokenValue }));

        expect(result.results).toHaveLength(1);
    });

    test('should create entry', async () => {
        const mockResponse: PutItemCommandOutput = { $metadata: {} };
        when(ddbService.send(anything())).thenResolve(mockResponse);

        const result = await objectUnderTest.createAuditEntry(TEST_AUDIT_1);

        expect(result).toBeDefined();
        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as PutItemCommand).input;
        expect(actualSentCmd.TableName).toEqual(AUDIT_TABLE_NAME);
    });

    test('should raise exception on ddb exception', async () => {
        when(ddbService.send(anything())).thenReject(new Error('ddb error'));

        await expect(objectUnderTest.createAuditEntry(TEST_AUDIT_1)).rejects.toEqual(
            new RuleConfigError('An error occurred when saving the new object', 500, true)
        );
    });
});
