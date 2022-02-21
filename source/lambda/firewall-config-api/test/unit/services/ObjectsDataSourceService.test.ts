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
    DeleteItemCommandOutput,
    DynamoDBClient,
    GetItemCommand,
    GetItemCommandOutput,
    PutItemCommand,
    PutItemCommandOutput,
    QueryCommand,
    QueryCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata';
import { FlowObject, StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { anything, capture, deepEqual, instance, mock, reset, when } from 'ts-mockito';
const TARGET_TABLE_NAME = 'targetTableName';
const TEST_OBJECT_1: FlowObject = {
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    id: 'Onprem_Server',
    type: 'Address',
    value: '172.16.1.20',
};
const DEFAULT_REQUESTOR = 'userArn';
describe('Test TargetsDataSourceService', () => {
    const ddbService: DynamoDBClient = mock(DynamoDBClient);
    const mockedDDBService = instance(ddbService);

    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfig = instance(applicationConfig);

    let objectUnderTest: ObjectsDataSourceService;
    beforeEach(() => {
        reset(ddbService);

        when(applicationConfig.getDefinitionSourceFor(deepEqual('OBJECT'))).thenReturn({
            name: 'OBJECT',
            tableName: TARGET_TABLE_NAME,
        });

        objectUnderTest = new ObjectsDataSourceService(
            new StaticLoggerFactory(),
            mockedDDBService,
            mockedAppConfig
        );
    });

    test('should return all targets', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_OBJECT_1)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getObjects();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);

        expect(result.results).toHaveLength(1);
    });

    test('should return all targets with paginated info', async () => {
        const nextToken = 'LastEvaluatedKey1';
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_OBJECT_1)],
            $metadata: {},
            LastEvaluatedKey: marshall({ id: nextToken }),
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getObjects();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);

        expect(result.results).toHaveLength(1);
        expect(result.nextToken).toEqual(nextToken);
    });

    test('should return targets based on limit and token', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_OBJECT_1)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const limit = 55;
        const tokenValue = 'nextToken';
        const result = await objectUnderTest.getObjects(limit, tokenValue);

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
        expect(actualSentCmd.Limit).toEqual(limit);
        expect(actualSentCmd.ExclusiveStartKey).toEqual(marshall({ id: tokenValue }));

        expect(result.results).toHaveLength(1);
    });

    describe('get target', () => {
        test('should retrieve rule target', async () => {
            const mockResponse: GetItemCommandOutput = {
                Item: marshall(TEST_OBJECT_1),
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getObjectBy('Onprem_Server');

            const captured = capture(ddbService.send);
            expect(result).toEqual(TEST_OBJECT_1);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual(TEST_OBJECT_1.id);
        });

        test('should return undefine if no rule target found', async () => {
            const mockResponse: GetItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getObjectBy('object-99999');

            const captured = capture(ddbService.send);

            expect(result).toBeUndefined();
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual('object-99999');
        });
    });

    describe('target creation', () => {
        test('should create target', async () => {
            const mockResponse: PutItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.createObject(
                TEST_OBJECT_1,
                DEFAULT_REQUESTOR
            );

            expect(result).toBeDefined();
            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as PutItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
        });

        test('should raise exception target', async () => {
            when(ddbService.send(anything())).thenReject(new Error('ddb error'));

            await expect(
                objectUnderTest.createObject(TEST_OBJECT_1, DEFAULT_REQUESTOR)
            ).rejects.toEqual(
                new RuleConfigError(
                    'An error occurred when saving the new object',
                    500,
                    true
                )
            );
        });
    });

    describe('target updating', () => {
        test('should update target', async () => {
            const mockResponse: DeleteItemCommandOutput = {
                $metadata: { httpStatusCode: 200 },
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            await objectUnderTest.deleteObject(TEST_OBJECT_1.id);

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as DeleteItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
        });
    });

    describe('target updating', () => {
        test('should update target', async () => {
            const mockResponse: GetItemCommandOutput = {
                $metadata: {},
                Item: marshall(TEST_OBJECT_1),
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.updateObject(TEST_OBJECT_1);

            expect(result).toBeDefined();
            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as PutItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(TARGET_TABLE_NAME);
        });

        test('should raise exception target', async () => {
            const mockResponse: GetItemCommandOutput = {
                $metadata: {},
                Item: marshall(TEST_OBJECT_1),
            };
            when(ddbService.send(anything()))
                .thenResolve(mockResponse)
                .thenReject(new Error('ddb error'));

            await expect(objectUnderTest.updateObject(TEST_OBJECT_1)).rejects.toEqual(
                new RuleConfigError(
                    'An error occurred when saving the new object',
                    500,
                    true
                )
            );
        });

        test('should raise exception target not exists', async () => {
            const mockResponse: PutItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            await expect(objectUnderTest.updateObject(TEST_OBJECT_1)).rejects.toEqual(
                new RuleConfigError(
                    'Requested object not exists Onprem_Server',
                    404,
                    true
                )
            );
        });
    });
});
