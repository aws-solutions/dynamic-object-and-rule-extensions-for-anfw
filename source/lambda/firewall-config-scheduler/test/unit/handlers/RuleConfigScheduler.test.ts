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
import { InvokeCommandOutput, LambdaClient } from '@aws-sdk/client-lambda';
import * as lambda from 'aws-lambda';
import { Context } from 'aws-lambda';
import 'reflect-metadata';
import { StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { RuleConfigScheduler } from 'src/handlers/RuleConfigScheduler';
import { DDBdataSourceService } from 'src/service/DDBdataSourceService';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { TextEncoder } from 'util';

const DEFAULT_GROUP_1 = {
    id: 'rule-group-001',
    ruleGroupArn:
        'arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup',
    version: 0,
    description: 'test',
    ownerGroup: [],
};

const DEFAULT_GROUP_2 = {
    id: 'rule-group-002',
    ruleGroupArn: 'arn',
    version: 0,
    description: 'test',
    ownerGroup: [],
};

const DEFAULT_GROUP_3 = {
    id: 'rule-group-003',
    ruleGroupArn: 'arn',
    version: 0,
    description: 'test',
    ownerGroup: [],
};
describe('Test RuleConfigHandler', () => {
    const ddbService: DDBdataSourceService = mock(DDBdataSourceService);
    const mockedDDBService: DDBdataSourceService = instance(ddbService);

    const appConfig: AppConfiguration = mock(AppConfiguration);
    const mockedAppConfiguration: AppConfiguration = instance(appConfig);
    const lambdaClient: LambdaClient = mock(LambdaClient);
    const mockedLambdaClient: LambdaClient = instance(lambdaClient);

    beforeEach(() => {
        when(ddbService.getRuleBundles()).thenResolve([DEFAULT_GROUP_1]);
        const lambdaResponse: InvokeCommandOutput = {
            $metadata: {},
            Payload: new TextEncoder().encode(
                JSON.stringify({
                    statusCode: 200,
                    body:
                        '{"message":"successfully processed rules for rule bundle rule-group-001","ruleBundleId":"rule-group-001"}',
                    headers: { 'Content-Type': 'application/json' },
                })
            ),
        };
        when(lambdaClient.send(anything())).thenResolve(lambdaResponse);
    });
    afterEach(() => {
        resetCalls(lambdaClient);
        resetCalls(ddbService);
    });
    const objectUnderTest = new RuleConfigScheduler(
        new StaticLoggerFactory(),
        mockedDDBService,
        mockedAppConfiguration,
        mockedLambdaClient
    );

    describe('happy cases', () => {
        test('should successfully trigger the configuration lambda ', async () => {
            const result = await objectUnderTest.handle(
                {} as lambda.ScheduledEvent,
                {} as Context
            );
            expect(result.statusCode).toEqual(200);
        });

        test('should send request to trigger rule group evaluation', async () => {
            const lambdaResponse: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-001","ruleBundleIds":["rule-group-001"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            when(lambdaClient.send(anything())).thenResolve(lambdaResponse);
            const result = await objectUnderTest.handle(
                {} as lambda.ScheduledEvent,
                {} as Context
            );

            expect(result.statusCode).toEqual(200);
            // expect(JSON.parse(result.body)).toEqual("{\"succeeded\":[\"rule-group-001\"],\"failed\":[]}");
            expect(JSON.parse(result.body)).toEqual({
                succeeded: ['rule-group-001'],
                failed: [],
            });
        });

        test('should send request to trigger rule group evaluation in group', async () => {
            when(ddbService.getRuleBundles()).thenResolve([
                DEFAULT_GROUP_2,
                DEFAULT_GROUP_3,
            ]);

            const lambdaResponse: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-002,rule-group-003","ruleBundleIds":["rule-group-002","rule-group-003"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            when(lambdaClient.send(anything())).thenResolve(lambdaResponse);
            const result = await objectUnderTest.handle(
                {} as lambda.ScheduledEvent,
                {} as Context
            );
            expect(result.statusCode).toEqual(200);

            expect(JSON.parse(result.body)).toEqual({
                succeeded: ['rule-group-002', 'rule-group-003'],
                failed: [],
            });
        });

        test('should send request to trigger rule group evaluation in group by arn', async () => {
            when(ddbService.getRuleBundles()).thenResolve([
                DEFAULT_GROUP_2,
                DEFAULT_GROUP_3,
                DEFAULT_GROUP_1,
            ]);

            const lambdaResponse: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-002,rule-group-003","ruleBundleIds":["rule-group-002","rule-group-003"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            const lambdaResponse2: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-001","ruleBundleIds":["rule-group-001"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            when(lambdaClient.send(anything()))
                .thenResolve(lambdaResponse)
                .thenResolve(lambdaResponse2);

            const result = await objectUnderTest.handle(
                {} as lambda.ScheduledEvent,
                {} as Context
            );
            expect(result.statusCode).toEqual(200);

            expect(JSON.parse(result.body)).toEqual({
                succeeded: ['rule-group-002', 'rule-group-003', 'rule-group-001'],
                failed: [],
            });
        });

        test('should send request to trigger rule bundles evaluation', async () => {
            const lambdaResponse: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-001","ruleBundleIds":["rule-group-001"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            const lambdaResponse2: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-002","ruleBundleIds":["rule-group-002"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };

            when(lambdaClient.send(anything()))
                .thenResolve(lambdaResponse)
                .thenResolve(lambdaResponse2);
            when(ddbService.getRuleBundles()).thenResolve([
                DEFAULT_GROUP_1,
                DEFAULT_GROUP_2,
            ]);
            const result = await objectUnderTest.handle(
                {} as lambda.ScheduledEvent,
                {} as Context
            );

            expect(result.statusCode).toEqual(200);
            expect(JSON.parse(result.body)).toEqual({
                succeeded: ['rule-group-001', 'rule-group-002'],
                failed: [],
            });
            verify(lambdaClient.send(anything())).twice();
        });

        test('should send request to trigger rule bundles evaluation and report partial failure', async () => {
            const lambdaResponse: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 200,
                        body:
                            '{"message":"successfully processed rules for rule bundle rule-group-001","ruleBundleIds":["rule-group-001"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };
            const lambdaResponse2: InvokeCommandOutput = {
                $metadata: {},
                Payload: new TextEncoder().encode(
                    JSON.stringify({
                        statusCode: 400,
                        body:
                            '{"message":"failed applying rule-group-002","ruleBundleIds":["rule-group-002"]}',
                        headers: { 'Content-Type': 'application/json' },
                    })
                ),
            };

            when(lambdaClient.send(anything()))
                .thenResolve(lambdaResponse)
                .thenResolve(lambdaResponse2);
            when(ddbService.getRuleBundles()).thenResolve([
                DEFAULT_GROUP_1,
                DEFAULT_GROUP_2,
            ]);
            expect(
                objectUnderTest.handle({} as lambda.ScheduledEvent, {} as Context)
            ).rejects.toEqual(
                new Error(`Encounter error while evaluated rule bundles rule-group-002`)
            );
        });
    });
});
