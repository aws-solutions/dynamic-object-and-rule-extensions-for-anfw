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
    ConfigServiceClient,
    DescribeConfigurationAggregatorsCommandOutput,
} from '@aws-sdk/client-config-service';
import { NetworkFirewallClient } from '@aws-sdk/client-network-firewall';
import { APIGatewayProxyEvent } from 'aws-lambda';
import 'reflect-metadata';
import { StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import RuleConfigError from 'src/common/RuleConfigError';
import { CreateRuleBundleInput } from 'src/types/RuleGroups';
import { CreateRuleBundleInputValidator } from 'src/validators/CreateRuleBundleInputValidator';
import { GeneralRuleBundleInputValidator } from 'src/validators/GeneralRuleBundleInputValidator';
import { anything, instance, mock, reset, when } from 'ts-mockito';
const createGWEvent = (body: Record<string, unknown>) =>
    ({ body: JSON.stringify(body) } as APIGatewayProxyEvent);
const DEFAULT_RULEGROU_INPUT = {
    aggregatorName: 'org-aggregator',
    description: 'description a',
    ownerGroup: ['admin', 'user'],
    ruleGroupArn:
        'arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup-03',
};

describe('Test CreateRuleGroupInputValidator', () => {
    const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
    const mockedAwsConfigClient = instance(awsConfigClient);

    const networkFirewallClient: NetworkFirewallClient = mock(NetworkFirewallClient);
    const mockednetworkFirewallClient = instance(networkFirewallClient);
    let objectUnderTest: CreateRuleBundleInputValidator;

    beforeEach(() => {
        reset(awsConfigClient);
        when(networkFirewallClient.send(anything())).thenResolve({
            $metadata: { httpStatusCode: 200 },
        });
        when(awsConfigClient.send(anything())).thenResolve({
            $metadata: { httpStatusCode: 200 },
        } as DescribeConfigurationAggregatorsCommandOutput);
        const applicationConfig = {
            adminRole: 'admin',
            applicationOwnerRoles: ['user'],
        } as AppConfiguration;
        const logFactory = new StaticLoggerFactory();
        objectUnderTest = new CreateRuleBundleInputValidator(
            logFactory,
            new GeneralRuleBundleInputValidator(
                logFactory,
                applicationConfig,
                mockedAwsConfigClient,
                mockednetworkFirewallClient
            )
        );
    });

    test('should pass', async () => {
        const inputEvent = createGWEvent(DEFAULT_RULEGROU_INPUT);
        const result: CreateRuleBundleInput = await objectUnderTest.parseAndValidate(
            inputEvent
        );

        expect(result).toEqual(DEFAULT_RULEGROU_INPUT);
    });

    test('should report error when aggregatorName not found', async () => {
        const inputEvent = createGWEvent(DEFAULT_RULEGROU_INPUT);
        when(awsConfigClient.send(anything())).thenReject({
            name: 'NoSuchConfigurationAggregatorException',
        } as Error);
        expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'aggregator : org-aggregator does not exists.',
                400,
                false
            )
        );
    });

    test('should report error when ruleGroupArn is not valid arn', async () => {
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            ruleGroupArn: 'notARn',
        });
        expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('ruleGroupArn : notARn is not a valid arn.', 400, false)
        );
    });

    test('should report error when ruleGroupArn is not valid rulegroup', async () => {
        const inputEvent = createGWEvent({ ...DEFAULT_RULEGROU_INPUT });
        when(networkFirewallClient.send(anything())).thenReject({
            name: 'ResourceNotFoundException',
        } as Error);
        expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ruleGroup : arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup-03 does not exists.',
                400,
                false
            )
        );
    });

    test('throw error if invalid input', async () => {
        await expect(
            objectUnderTest.parseAndValidate(createGWEvent({}))
        ).rejects.toBeDefined();
        expect(objectUnderTest.errors.length).toBe(2);
    });

    test('should report error when id violates restriction ', async () => {
        const idTooLong = 'a'.repeat(101);
        const inputEvent = createGWEvent({ ...DEFAULT_RULEGROU_INPUT, id: idTooLong });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'id violated restriction, expecting /^[:0-9a-zA-Z_-]{1,100}$/',
                400,
                false
            )
        );
    });

    test('should report error when description violates restriction ', async () => {
        const longDescriptionWith1001Chars = 'bla'.repeat(1000) + '1';
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            description: longDescriptionWith1001Chars,
        });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'description violated restriction, expecting /^[ 0-9a-zA-Z_-\\s]{1,1000}$/',
                400,
                false
            )
        );
    });

    test('throw error if invalid json input', async () => {
        await expect(
            objectUnderTest.parseAndValidate({ body: 'notjson' } as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        // expect(objectUnderTest.errors.length).toBe(2);
        expect(objectUnderTest.errors).toEqual(['Request body contains invalid JSON.']);
    });

    test('throw error if empty body', async () => {
        await expect(
            objectUnderTest.parseAndValidate({} as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        expect(objectUnderTest.errors.length).toBe(1);
    });

    test('should report error when ownerGroup is not valid arn', async () => {
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            ownerGroup: ['admin', 'user1'],
        });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ownerGroup : admin,user1 contains invalid role arn, valid roles are admin,user',
                400,
                false
            )
        );
    });

    test('should report error when ownerGroup does not contain admin', async () => {
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            ownerGroup: ['user'],
        });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ownerGroup : user does not contain admin role, valid roles are admin',
                400,
                false
            )
        );
    });
});
