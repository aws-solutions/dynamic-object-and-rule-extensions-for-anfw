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
    ScanCommand,
    ScanCommandOutput,
    UpdateItemCommand,
    UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata';
import { StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { DDBdataSourceService } from 'src/service/DDBdataSourceService';
import { anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
const DEFAULT_RULE_GROUP = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
    description: 'rule gorup 1',
    ownerGroup: ['admin', 'user1'],
    version: 0,
};
const DEFAULT_RULE_GROUP_2 = {
    id: 'rule-group-02',
    ruleGroupArn: 'arn2',
    description: 'rule gorup 2',
    ownerGroup: ['admin'],
    version: 0,
};
const RULE_BUNDLE_TABLE_NAME = 'ruleGroupTableName';

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
        resetCalls(ddbService);
    });

    describe('Happy cases', () => {
        test('should retrieve rule bundles', async () => {
            const mockResponse: ScanCommandOutput = {
                Items: [marshall(DEFAULT_RULE_GROUP)],
                $metadata: {},
            };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles();

            const captured = capture(ddbService.send);
            expect(result).toEqual([DEFAULT_RULE_GROUP]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
        });

        test('should retrieve rule bundles as empty list', async () => {
            const mockResponse: ScanCommandOutput = { $metadata: {} };
            when(ddbService.send(anything())).thenResolve(mockResponse);

            const result = await objectUnderTest.getRuleBundles();

            const captured = capture(ddbService.send);
            expect(result).toEqual([]);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as ScanCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);
        });

        test('should update rules', async () => {
            const secondMockResponse: UpdateItemCommandOutput = {
                $metadata: { httpStatusCode: 200 },
            };
            when(ddbService.send(anything())).thenResolve(secondMockResponse);

            await objectUnderTest.updateRuleGroupTimeStamps([
                DEFAULT_RULE_GROUP_2,
                DEFAULT_RULE_GROUP,
            ]);

            const captured = capture(ddbService.send);
            const [sentCmd] = captured.last();
            const actualSentCmd = (sentCmd as UpdateItemCommand).input;
            expect(actualSentCmd.TableName).toEqual(RULE_BUNDLE_TABLE_NAME);

            verify(ddbService.send(anything())).twice();
        });
    });
});
