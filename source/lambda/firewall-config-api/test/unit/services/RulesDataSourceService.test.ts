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
    ScanCommand,
    ScanCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata';
import { FlowRule, StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { CreateFlowRuleInput } from 'src/types/FlowRule';
import {
    anything,
    capture,
    deepEqual,
    instance,
    mock,
    resetCalls,
    when,
} from 'ts-mockito';
const RULE_TABLE_NAME = 'ruleTableName';

const TEST_RULE: FlowRule = {
    id: 'rule-id',
    version: 0,
    failureReasons: [],
    action: 'pass',
    destination: 'Onprem_Server',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-003',
    source: 'Ec2_Arn',
    destinationPort: {
        type: 'SinglePort',
        value: '123',
    },
    sourcePort: {
        type: 'Any',
    },
    status: 'ACTIVE',
};

const TEST_RULE_INPUT: CreateFlowRuleInput = {
    ...TEST_RULE,
};

describe('Test RulesDataSourceService', () => {
    const ddbService: DynamoDBClient = mock(DynamoDBClient);
    const mockedDDBService = instance(ddbService);

    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfig = instance(applicationConfig);

    let objectUnderTest: RulesDataSourceService;
    beforeEach(() => {
        resetCalls(ddbService);

        when(applicationConfig.getDefinitionSourceFor(deepEqual('RULE'))).thenReturn({
            name: 'RULE',
            tableName: RULE_TABLE_NAME,
        });

        objectUnderTest = new RulesDataSourceService(
            new StaticLoggerFactory(),
            mockedDDBService,
            mockedAppConfig
        );
    });

    test('should return all rules', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_RULE_INPUT)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getRules();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);

        expect(result.results).toHaveLength(1);
    });

    test('should return all objects with paginated info', async () => {
        const nextToken = 'LastEvaluatedKey1';
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_RULE_INPUT)],
            $metadata: {},
            LastEvaluatedKey: marshall({ id: nextToken }),
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const result = await objectUnderTest.getRules();

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);

        expect(result.results).toHaveLength(1);
        expect(result.nextToken).toEqual(nextToken);
    });

    test('should return objects based on limit and token', async () => {
        const mockResponse: QueryCommandOutput = {
            Items: [marshall(TEST_RULE_INPUT)],
            $metadata: {},
        };
        when(ddbService.send(anything())).thenResolve(mockResponse);
        const limit = 55;
        const tokenValue = 'nextToken';
        const result = await objectUnderTest.getRules(limit, tokenValue);

        const captured = capture(ddbService.send);
        const [sentCmd] = captured.last();
        const actualSentCmd = (sentCmd as QueryCommand).input;
        expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
        expect(actualSentCmd.Limit).toEqual(limit);
        expect(actualSentCmd.ExclusiveStartKey).toEqual(marshall({ id: tokenValue }));

        expect(result.results).toHaveLength(1);
    });

    describe('get rules', () => {
        test('should retrieve rules', async () => {
            const mockResponse: GetItemCommandOutput = {
                Item: marshall(TEST_RULE),
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBy('rule-id');

            const captured = capture(ddbService.send);
            expect(result).toEqual(TEST_RULE_INPUT);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual(TEST_RULE.id);
        });

        test('should return undefine if no rule found', async () => {
            const mockResponse: GetItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBy('object-99999');

            const captured = capture(ddbService.send);

            expect(result).toBeUndefined();
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual('object-99999');
        });
    });

    describe('rule creation', () => {
        test('should create rule', async () => {
            const mockResponse: PutItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.createRule(TEST_RULE_INPUT);

            expect(result).toBeDefined();
            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as PutItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
        });

        test('should raise exception', async () => {
            when(ddbService.send(anything())).thenReject(new Error('ddb error'));

            await expect(objectUnderTest.createRule(TEST_RULE_INPUT)).rejects.toEqual(
                new RuleConfigError(
                    'An error occurred when saving the new rule',
                    500,
                    true
                )
            );
        });
    });

    describe('rule update', () => {
        test('should update rule and return the new version', async () => {
            const mockResponse: PutItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.updateRule(TEST_RULE);

            expect(result).toBeDefined();
            expect(result.version).toBe(TEST_RULE.version + 1);
            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as PutItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
        });

        test('should raise exception', async () => {
            when(ddbService.send(anything())).thenReject(new Error('ddb error'));

            await expect(objectUnderTest.updateRule(TEST_RULE)).rejects.toEqual(
                new RuleConfigError(
                    'An error occurred when saving the new rule',
                    500,
                    true
                )
            );
        });
    });
    describe('rule listing', () => {
        const groupId = 'groupId';
        test('should return all rules in rule bundles', async () => {
            const mockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);
            const result = await objectUnderTest.getRulesByBundleId(groupId);

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as QueryCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);

            expect(result.results).toHaveLength(1);
        });

        test('should return all objects with paginated info', async () => {
            const nextToken = 'LastEvaluatedKey1';
            const mockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE)],
                $metadata: {},
                LastEvaluatedKey: marshall({ id: nextToken, ruleBundleId: groupId }),
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);
            const result = await objectUnderTest.getRulesByBundleId(groupId);

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as QueryCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);

            expect(result.results).toHaveLength(1);
            expect(result.nextToken).toEqual(nextToken);
        });

        test('should return objects based on limit and token', async () => {
            const mockResponse: QueryCommandOutput = {
                Items: [marshall(TEST_RULE)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);
            const limit = 55;
            const tokenValue = 'nextToken';
            const result = await objectUnderTest.getRulesByBundleId(
                groupId,
                limit,
                tokenValue
            );

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as QueryCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
            expect(actualSentCmd.Limit).toEqual(limit);
            expect(actualSentCmd.ExclusiveStartKey).toEqual(
                marshall({ id: tokenValue, ruleBundleId: groupId })
            );

            expect(result.results).toHaveLength(1);
        });
    });

    describe('delete rules', () => {
        test('should delete rule', async () => {
            const groupId = 'groupId';
            const mockResponse: DeleteItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);
            await objectUnderTest.deleteRuleBy(groupId, 'ruleid');

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as DeleteItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
        });
        test('should raise exception when ddb error rule', async () => {
            const groupId = 'groupId';

            when(ddbService.send(anything())).thenReject(new Error('ddb error'));

            await expect(objectUnderTest.deleteRuleBy(groupId, 'ruleid')).rejects.toEqual(
                new RuleConfigError(
                    'An error occurred when deleting an existing rule',
                    500,
                    true
                )
            );
        });
    });

    describe('get referenced rules', () => {
        test('should delete rule', async () => {
            const mockResponse: ScanCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);
            await objectUnderTest.getRuleByReferences('objectId');

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_TABLE_NAME);
        });
    });
});
