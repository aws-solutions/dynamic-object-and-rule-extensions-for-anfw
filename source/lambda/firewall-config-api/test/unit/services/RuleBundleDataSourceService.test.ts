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
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import {
    anything,
    capture,
    deepEqual,
    instance,
    mock,
    resetCalls,
    verify,
    when,
} from 'ts-mockito';
const DEFAULT_RULE_GROUP = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
};

const DEFAULT_RULE_GROUP_2 = {
    id: 'rule-group-02',
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
    destinationPort: {
        type: 'SinglePort',
        value: '123',
    },
    sourcePort: {
        type: 'Any',
    },
    version: 10,
};
const RULE_BUNDLE_TABLE_NAME = 'ruleBundleTableName';
const TARGET_TABLE_NAME = 'targetTableName';
const RULE_TABLE_NAME = 'ruleTableName';
describe('Test DDBdataSourceService', () => {
    const ddbService: DynamoDBClient = mock(DynamoDBClient);
    const mockedDDBService = instance(ddbService);

    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfig = instance(applicationConfig);

    let objectUnderTest: RuleBundleDataSourceService;
    beforeEach(() => {
        resetCalls(ddbService);
        when(
            applicationConfig.getDefinitionSourceFor(deepEqual('RULEBUNDLE'))
        ).thenReturn({
            name: 'RULEBUNDLE',
            tableName: RULE_BUNDLE_TABLE_NAME,
        });

        when(applicationConfig.getDefinitionSourceFor(deepEqual('RULE'))).thenReturn({
            name: 'RULE',
            tableName: RULE_TABLE_NAME,
        });

        when(applicationConfig.getDefinitionSourceFor(deepEqual('OBJECT'))).thenReturn({
            name: 'OBJECT',
            tableName: TARGET_TABLE_NAME,
        });
        objectUnderTest = new RuleBundleDataSourceService(
            new StaticLoggerFactory(),
            mockedDDBService,
            mockedAppConfig
        );
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

        test('should return undefine if no rule group found', async () => {
            const mockResponse: GetItemCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundleBy('rule-group-99999');

            const captured = capture(ddbService.send);

            expect(result).toBeUndefined();
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as GetItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(actualSentCmd.Key!).id).toEqual('rule-group-99999');
        });

        test('should retrieve rule bundles contain only 1', async () => {
            const mockResponse: ScanCommandOutput = {
                Items: [marshall(DEFAULT_RULE_GROUP)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles(
                undefined,
                undefined,
                'arn'
            );

            const captured = capture(ddbService.send);
            expect(result.results).toEqual([DEFAULT_RULE_GROUP]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
        });

        test('should retrieve rule bundles contain no items', async () => {
            const mockResponse: ScanCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles(
                undefined,
                undefined,
                'arn'
            );

            const captured = capture(ddbService.send);
            expect(result.results).toEqual([]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
        });

        test('should retrieve rule bundles', async () => {
            const mockResponse: ScanCommandOutput = {
                Items: [marshall(DEFAULT_RULE_GROUP), marshall(DEFAULT_RULE_GROUP_2)],
                $metadata: {},
                LastEvaluatedKey: marshall({
                    id: 'nextRuleGroupId',
                }),
            };

            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles(
                undefined,
                undefined,
                'arn'
            );

            const captured = capture(ddbService.send);
            expect(result.results).toEqual([DEFAULT_RULE_GROUP, DEFAULT_RULE_GROUP_2]);
            expect(result.nextToken).toEqual('nextRuleGroupId');
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
        });

        test('should retrieve rule bundles by limit', async () => {
            const mockResponse: ScanCommandOutput = {
                Items: [marshall(DEFAULT_RULE_GROUP)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles(1, undefined, 'arn');

            const captured = capture(ddbService.send);
            expect(result.results).toEqual([DEFAULT_RULE_GROUP]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(actualSentCmd.Limit).toEqual(1);
        });

        test('should retrieve rule bundles by batch', async () => {
            const mockResponse: ScanCommandOutput = {
                Items: [marshall(DEFAULT_RULE_GROUP)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles(1, 'nextToken', 'arn');

            const captured = capture(ddbService.send);
            expect(result.results).toEqual([DEFAULT_RULE_GROUP]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(actualSentCmd.Limit).toEqual(1);
            const sentExclusiveStartKey = actualSentCmd.ExclusiveStartKey;
            expect(sentExclusiveStartKey).toBeDefined();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(unmarshall(sentExclusiveStartKey!)['id']).toEqual('nextToken');
        });

        describe('rule group creation', () => {
            test('should create rule group', async () => {
                const mockResponse: PutItemCommandOutput = { $metadata: {} };
                when(ddbService.send(anything())).thenResolve(mockResponse);

                const result = await objectUnderTest.createRuleBundle({
                    aggregatorName: 'aggregator',
                    description: 'default rule',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: 'arn',
                });

                expect(result).toBeDefined();
                const captured = capture(ddbService.send);
                const [sentCmd] = captured.last();
                const actualSentCmd = (sentCmd as PutItemCommand).input;
                expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            });
        });

        describe('rule rules', () => {
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
        });
        describe('rule group deleting', () => {
            test('should delete rule group', async () => {
                const ruleGroupArn = 'arn';
                const ruleGroup = {
                    id: 'id',
                    aggregatorName: 'aggregator',
                    description: 'xxxx',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: ruleGroupArn,
                };
                const getItemMockResponse: GetItemCommandOutput = {
                    $metadata: {},
                    Item: marshall(ruleGroup),
                };

                const mockResponse: DeleteItemCommandOutput = {
                    $metadata: { httpStatusCode: 200 },
                };
                when(ddbService.send(anything()))
                    .thenResolve(getItemMockResponse)
                    .thenResolve(mockResponse);

                //only change description
                await objectUnderTest.deleteRuleBundle('id');

                const captured = capture(ddbService.send);
                const [sentCmd] = captured.first();

                const actualSentCmd = (sentCmd as DeleteItemCommand).input;
                expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);

                const [finalSentCmd] = captured.last();
                const actualTxDeleteSentCmd = (finalSentCmd as DeleteItemCommand).input;

                expect(actualTxDeleteSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            });

            test('should not delete rule group when not exists', async () => {
                const getItemMockResponse: GetItemCommandOutput = { $metadata: {} };

                when(ddbService.send(anything())).thenResolve(getItemMockResponse);

                //only change description
                await expect(objectUnderTest.deleteRuleBundle('id')).rejects.toEqual(
                    new RuleConfigError(`id not exists`, 400)
                );

                const captured = capture(ddbService.send);
                const [sentCmd] = captured.first();

                const actualSentCmd = (sentCmd as GetItemCommand).input;
                expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);

                verify(ddbService.send(anything())).once();
            });
        });
        describe('rule group updating', () => {
            test('should update rule group', async () => {
                const ruleGroupArn = 'arn';
                const ruleGroup = {
                    id: 'id',
                    aggregatorName: 'aggregator',
                    description: 'xxxx',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: ruleGroupArn,
                };
                const getItemMockResponse: GetItemCommandOutput = {
                    $metadata: {},
                    Item: marshall(ruleGroup),
                };

                const mockResponse: PutItemCommandOutput = {
                    $metadata: { httpStatusCode: 200 },
                };
                when(ddbService.send(anything()))
                    .thenResolve(getItemMockResponse)
                    .thenResolve(mockResponse);

                //only change description
                await objectUnderTest.updateRuleBundle({
                    id: 'id',
                    aggregatorName: 'aggregator',
                    description: 'default rule',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: ruleGroupArn,
                });

                const captured = capture(ddbService.send);
                const [sentCmd] = captured.last();

                const actualSentCmd = (sentCmd as PutItemCommand).input;
                expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            });

            test('should raise error when rule group not found', async () => {
                const ruleGroupArn = 'arn';
                const getItemMockResponse: GetItemCommandOutput = { $metadata: {} };

                when(ddbService.send(anything())).thenResolve(getItemMockResponse);

                //only change description
                await expect(
                    objectUnderTest.updateRuleBundle({
                        id: 'id',
                        aggregatorName: 'aggregator',
                        description: 'default rule',
                        ownerGroup: ['admin', 'user'],
                        ruleGroupArn: ruleGroupArn,
                    })
                ).rejects.toEqual(
                    new RuleConfigError('Rule bundle not found', 404, true)
                );

                verify(ddbService.send(anything())).once();
            });

            test('should update rule group ', async () => {
                const ruleGroupArn = 'arn';
                const ruleGroup = {
                    id: 'id',
                    aggregatorName: 'aggregator',
                    description: 'xxxx',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: ruleGroupArn,
                };
                const getItemMockResponse: GetItemCommandOutput = {
                    $metadata: {},
                    Item: marshall(ruleGroup),
                };

                const mockResponse: PutItemCommandOutput = {
                    $metadata: { httpStatusCode: 200 },
                };
                when(ddbService.send(anything()))
                    .thenResolve(getItemMockResponse)
                    .thenResolve(mockResponse);

                //only change description
                await objectUnderTest.updateRuleBundle({
                    id: 'id',
                    aggregatorName: 'aggregator',
                    description: 'default rule',
                    ownerGroup: ['admin', 'user'],
                    ruleGroupArn: ruleGroupArn + 'new arn',
                });

                const captured = capture(ddbService.send);
                const [sentCmd] = captured.last();

                const actualSentCmd = (sentCmd as GetItemCommand).input;
                expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
            });
        });
    });
});
