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
import { GeneralRuleBundleInputValidator } from 'src/validators/GeneralRuleBundleInputValidator';
import { UpdateRuleBundleInputValidator } from 'src/validators/UpdateRuleBundleInputValidator';
import { anything, instance, mock, reset, when } from 'ts-mockito';

const createGWEvent = (body: Record<string, unknown>) =>
    ({ body: JSON.stringify(body) } as APIGatewayProxyEvent);
const DEFAULT_RULEGROU_INPUT = {
    id: 'id',
    aggregatorName: 'org-aggregator',
    description: 'description a',
    ownerGroup: ['admin-arn', 'user-arn'],
    ruleGroupArn:
        'arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup-04',
};

describe('Test UpdateRuleGroupInputValidator', () => {
    const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
    const mockedAwsConfigClient = instance(awsConfigClient);

    const networkFirewallClient: NetworkFirewallClient = mock(NetworkFirewallClient);
    const mockednetworkFirewallClient = instance(networkFirewallClient);
    let objectUnderTest: UpdateRuleBundleInputValidator;

    beforeEach(() => {
        reset(awsConfigClient);
        when(networkFirewallClient.send(anything())).thenResolve({
            $metadata: { httpStatusCode: 200 },
        });
        when(awsConfigClient.send(anything())).thenResolve({
            $metadata: { httpStatusCode: 200 },
        } as DescribeConfigurationAggregatorsCommandOutput);
        const applicationConfig = {
            adminRole: 'admin-arn',
            applicationOwnerRoles: ['user-arn'],
        } as AppConfiguration;
        const logFactory = new StaticLoggerFactory();
        objectUnderTest = new UpdateRuleBundleInputValidator(
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

        expect.assertions(1);
        expect(result).toEqual(DEFAULT_RULEGROU_INPUT);
    });

    test('should report error when id not present', async () => {
        const inputEvent = createGWEvent({ ...DEFAULT_RULEGROU_INPUT, id: undefined });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'id violated restriction, expecting /^[:0-9a-zA-Z_-]{1,100}$/',
                400,
                false
            )
        );
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

    test('should report error when aggregatorName not found', async () => {
        const inputEvent = createGWEvent(DEFAULT_RULEGROU_INPUT);
        when(awsConfigClient.send(anything())).thenReject({
            name: 'NoSuchConfigurationAggregatorException',
        } as Error);
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
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
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('ruleGroupArn : notARn is not a valid arn.', 400, false)
        );
    });

    test('should report error when ruleGroupArn is empty', async () => {
        const inputEvent = createGWEvent({ ...DEFAULT_RULEGROU_INPUT, ruleGroupArn: '' });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ruleGroupArn cannot be null or empty., ruleGroupArn :  is not a valid arn.',
                400,
                false
            )
        );
    });

    test('should report error when ruleGroupArn is not valid rulegroup', async () => {
        const inputEvent = createGWEvent({ ...DEFAULT_RULEGROU_INPUT });
        when(networkFirewallClient.send(anything())).thenReject({
            name: 'ResourceNotFoundException',
        } as Error);
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ruleGroup : arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup-04 does not exists.',
                400,
                false
            )
        );
    });

    test('should report error when ownerGroup is not valid arn', async () => {
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            ownerGroup: ['admin-arn', 'user-not-exist'],
        });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ownerGroup : admin-arn,user-not-exist contains invalid role arn,  valid roles are admin-arn,user-arn',
                400,
                false
            )
        );
    });

    test('should report error when ownerGroup does not contain admin', async () => {
        const inputEvent = createGWEvent({
            ...DEFAULT_RULEGROU_INPUT,
            ownerGroup: ['user-arn'],
        });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'ownerGroup : user-arn does not contain admin role, valid roles are admin-arn',
                400,
                false
            )
        );
    });
});
