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
    BatchGetItemCommandOutput,
    DynamoDBClient,
    GetItemCommand,
    GetItemCommandOutput,
    QueryCommand,
    QueryCommandOutput,
    UpdateItemCommand,
    UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata';
import { FlowObject, FlowRule, StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { DDBdataSourceService } from 'src/service/DDBdataSourceService';
import { anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
const DEFAULT_RULE_GROUP = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
};
const TEST_RULE_1: FlowRule = {
    action: 'pass',
    destination: 'Onprem_Server',
    id: 'cloud-to-onpreim-test',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'SecurityGroup_Arn',
    status: 'ACTIVE',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    version: 10,
};
const TEST_RULE_2: FlowRule = {
    action: 'pass',
    id: 'dummy_server_to_fixed_ip',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'Dummy_server',
    destination: 'Fixed_ip',
    status: 'ACTIVE',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    version: 10,
};
const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    type: 'Address',
    value: '172.16.1.20',
};
const RULE_BUNDLE_TABLE_NAME = 'ruleGroupTableName';
const TARGET_TABLE_NAME = 'targetTableName';
const RULE_TABLE_NAME = 'ruleTableName';
describe('Test DDBdataSourceService', () => {
    const ddbService: DynamoDBClient = mock(DynamoDBClient);
    const mockedDDBService = instance(ddbService);

    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfig = instance(applicationConfig);
    const objectUnderTest = new DDBdataSourceService(
        new StaticLoggerFactory(),
        mockedDDBService,
        mockedAppConfig
    );
    beforeEach(() => {
        when(applicationConfig.getDefinitionSourceFor('RULEBUNDLE')).thenReturn({
            name: 'RULEBUNDLE',
            tableName: RULE_BUNDLE_TABLE_NAME,
        });

        when(applicationConfig.getDefinitionSourceFor('RULE')).thenReturn({
            name: 'RULE',
            tableName: RULE_TABLE_NAME,
        });

        when(applicationConfig.getDefinitionSourceFor('OBJECT')).thenReturn({
            name: 'OBJECT',
            tableName: TARGET_TABLE_NAME,
        });

        resetCalls(ddbService);
    });

    describe('Happy cases', () => {
        test('should retrieve rule group', async () => {
            const mockResponse: GetItemCommandOutput = {
                Item: marshall(DEFAULT_RULE_GROUP),
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundleBy('rule-group-01');

            const captured = capture(ddbService.send);
            expect(result).toEqual(DEFAULT_RULE_GROUP);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual(DEFAULT_RULE_GROUP.id);
        });

        test('should retrieve rule group in batch', async () => {
            const mockResponse: BatchGetItemCommandOutput = {
                $metadata: {},
                Responses: {
                    [RULE_BUNDLE_TABLE_NAME]: [marshall(DEFAULT_RULE_GROUP)],
                },
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundleByIds(['rule-group-01']);

            expect(result).toEqual([DEFAULT_RULE_GROUP]);
        });

        test('should retrieve rules', async () => {
            const mockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE_1)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRulesBy('rule-group-01');

            const captured = capture(ddbService.send);
            expect(result).toEqual([TEST_RULE_1]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as QueryCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
            expect(actualSentCmd.IndexName).toEqual('ruleBundleId');
        });

        test('should retrieve rules when paged result', async () => {
            const mockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE_1)],
                $metadata: {},
                LastEvaluatedKey: marshall({ id: 'nextId' }),
            };
            const secondMockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE_1)],
                $metadata: {},
            };
            when(ddbService.send(anything()))
                .thenResolve(mockResponse)
                .thenResolve(secondMockResponse);

            const result = await objectUnderTest.getRulesBy('rule-group-01');

            const captured = capture(ddbService.send);
            expect(result).toEqual([TEST_RULE_1, TEST_RULE_1]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as QueryCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
            expect(actualSentCmd.IndexName).toEqual('ruleBundleId');

            verify(ddbService.send(anything())).twice();
        });

        test('should retrieve objects', async () => {
            const mockResponse: BatchGetItemCommandOutput = {
                $metadata: {},
                Responses: {
                    [TARGET_TABLE_NAME]: [marshall(TEST_OBJECT_1)],
                },
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getObjects(['Onprem_Server']);

            expect(result).toEqual([TEST_OBJECT_1]);
        });

        test('should retrieve objects in batch if id exceeded 100', async () => {
            const firstMockResponse: BatchGetItemCommandOutput = {
                $metadata: {},
                Responses: {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    [TARGET_TABLE_NAME]: [...Array(100).keys()].map((_) =>
                        marshall(TEST_OBJECT_1)
                    ),
                },
            };
            const secondMockResponse: BatchGetItemCommandOutput = {
                $metadata: {},
                Responses: {
                    [TARGET_TABLE_NAME]: [marshall(TEST_OBJECT_1)],
                },
            };

            // 1st time return 100, 2nd time return 1 item
            when(ddbService.send(anything()))
                .thenResolve(firstMockResponse)
                .thenResolve(secondMockResponse);
            const tooManyIdsForOneGo = [...Array(101).keys()].map(
                (i) => `Onprem_Server_${i}`
            );

            const result = await objectUnderTest.getObjects(tooManyIdsForOneGo);

            verify(ddbService.send(anything())).twice();
            expect(result).toHaveLength(101);
        });

        test('should update rules', async () => {
            const secondMockResponse: UpdateItemCommandOutput = {
                $metadata: { httpStatusCode: 200 },
            };
            when(ddbService.send(anything())).thenResolve(secondMockResponse);

            const result = await objectUnderTest.updateRules([TEST_RULE_1, TEST_RULE_2]);

            const captured = capture(ddbService.send);
            expect(result).toEqual([TEST_RULE_1, TEST_RULE_2]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as UpdateItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);

            verify(ddbService.send(anything())).twice();
        });
    });
});
