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
import { StaticLoggerFactory } from 'shared_types';
import {
    DescribeRuleGroupCommandOutput,
    NetworkFirewallClient,
    UpdateRuleGroupCommandOutput,
} from '@aws-sdk/client-network-firewall';
import 'reflect-metadata';
import { FlowRule } from 'shared_types';
import { DDBdataSourceService } from 'src/service/DDBdataSourceService';
import { RuleUpdater } from 'src/service/RuleUpdater';
import { anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { RuleStatusNotifier } from 'src/service/RuleStatusNotifier';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';

const TEST_RULE_1: FlowRule = {
    action: 'pass',
    destination: 'Onprem_Server',
    id: 'cloud-to-onpreim-test',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'SecurityGroup_Arn',
    status: 'PENDING',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    version: 10,
};
const TEST_RULE_FAILED_01: FlowRule = {
    action: 'pass',
    destination: 'Onprem_Server',
    id: 'cloud-to-onpreim-test-failed',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'SecurityGroup_Arn',
    status: 'FAILED',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    failureReasons: ['object resolution failure Onprem_Server'],
    version: 0,
};

const TEST_RULE_2: FlowRule = {
    action: 'pass',
    id: 'dummy_server_to_fixed_ip',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'Dummy_server',
    destination: 'Fixed_ip',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    status: 'PENDING',
    version: 10,
};

describe('Test DDBdataSourceService', () => {
    const ddbService: DDBdataSourceService = mock(DDBdataSourceService);
    const mockedDDBService = instance(ddbService);
    const networkFirewallClient: NetworkFirewallClient = mock(NetworkFirewallClient);
    const mockedNetworkFirewallClient = instance(networkFirewallClient);
    const ruleStatusNotifier: RuleStatusNotifier = mock(RuleStatusNotifier);
    const mockRuleStatusNotifier = instance(ruleStatusNotifier);
    const objectUnderTest: RuleUpdater = new RuleUpdater(
        new StaticLoggerFactory(),
        mockedDDBService,
        mockedNetworkFirewallClient,
        mockRuleStatusNotifier
    );

    beforeEach(() => {
        resetCalls(ddbService);
        resetCalls(networkFirewallClient);
        resetCalls(ruleStatusNotifier);
    });
    describe('happy cases', () => {
        test('should update rules', async () => {
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;
            const updateRuleGroupOutcome: UpdateRuleGroupCommandOutput = {} as UpdateRuleGroupCommandOutput;
            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenResolve(updateRuleGroupOutcome);

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                ]);
            } catch (e) {
                error = e;
            }
            verify(ddbService.updateRules(anything())).times(1);
            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();
            expect(caputredParamRules.length).toBe(2);
            expect(error).toBeUndefined();
        });

        test('should only apply rules when parameter updateStatus is set to false', async () => {
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;
            const updateRuleGroupOutcome: UpdateRuleGroupCommandOutput = {} as UpdateRuleGroupCommandOutput;
            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenResolve(updateRuleGroupOutcome);

            let error;
            try {
                await objectUnderTest.updateRules(
                    'arn',
                    [{ ...TEST_RULE_1 }, { ...TEST_RULE_2 }],
                    false
                );
            } catch (e) {
                error = e;
            }
            verify(ddbService.updateRules(anything())).never();
            expect(error).toBeUndefined();
        });

        test('should not update rule status which already marked as failure due to previous stesps', async () => {
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;
            const updateRuleGroupOutcome: UpdateRuleGroupCommandOutput = {} as UpdateRuleGroupCommandOutput;
            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenResolve(updateRuleGroupOutcome);

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                    { ...TEST_RULE_FAILED_01 },
                ]);
            } catch (e) {
                error = e;
            }
            verify(ddbService.updateRules(anything())).times(1);
            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();
            expect(caputredParamRules.length).toBe(3);
            expect(error).toBeUndefined();

            // previous marked rule stays FAILED
            expect(caputredParamRules.find((f) => f.status === 'FAILED')?.id).toBe(
                'cloud-to-onpreim-test-failed'
            );
            // new rules changed to ACTIVE
            expect(
                caputredParamRules.find((f) => f.id === 'cloud-to-onpreim-test')?.status
            ).toBe('ACTIVE');
            expect(
                caputredParamRules.find((f) => f.id === 'dummy_server_to_fixed_ip')
                    ?.status
            ).toBe('ACTIVE');
        });
    });
    describe('negative case', () => {
        test('should not call network firewall when no valid rules available', async () => {
            let error;
            try {
                await objectUnderTest.updateRules('arn', [{ ...TEST_RULE_FAILED_01 }]);
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
            verify(ddbService.updateRules(anything())).times(1);
            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();
            expect(
                caputredParamRules.find((f) => f.id === TEST_RULE_FAILED_01.id)?.status
            ).toBe('FAILED');
            verify(networkFirewallClient.send(anything())).never();
            const notifiedCapure = capture(ruleStatusNotifier.notify);
            const [ruleSattus] = notifiedCapure.last();
            expect(ruleSattus.ruleId).toBe(TEST_RULE_FAILED_01.id);
        });

        test('should update rules to FAILED IF firewall config failed', async () => {
            // standard ANFW error
            //[
            //   'stateful rule is invalid',
            //   ' rule: pass tcp 10.0.0.0 123987 -> 172.31.32.64 any (msg: "Onprem-to-cloud-securitygrouparn-test"; sid: 1; gid:123;)',
            //   ' reason:  failed to parse port "123987"'
            // ]
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;

            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenReject({
                    name: 'InvalidRequestException',
                    message:
                        'stateful rule is invalid,  rule: pass tcp 172.31.32.64 any -> 172.16.1.20 123912 (msg: "cloud-to-onpreim-test"; sid: 1; gid:123;), reason:  failed to parse port "123912"\nstateful rule is invalid',
                });

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                ]);
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();
            expect(
                caputredParamRules.find((f) => f.id === 'cloud-to-onpreim-test')?.status
            ).toBe('FAILED');
            expect(
                caputredParamRules.find((f) => f.id === 'dummy_server_to_fixed_ip')
                    ?.status
            ).toBe('PENDING');
            const notifiedCapure = capture(ruleStatusNotifier.notify);
            const [ruleSattus] = notifiedCapure.last();
            expect(ruleSattus.ruleId).toBe('cloud-to-onpreim-test');
        });

        test('should update all rules to FAILED IF firewall config failed without matching ids', async () => {
            // standard ANFW error
            //[
            //   'stateful rule is invalid',
            //   ' rule: pass tcp 10.0.0.0 123987 -> 172.31.32.64 any (msg: "Onprem-to-cloud-securitygrouparn-test"; sid: 1; gid:123;)',
            //   ' reason:  failed to parse port "123987"'
            // ]
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;

            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenReject({
                    name: 'InvalidRequestException',
                    message:
                        'stateful rule is invalid,  rule: pass tcp 172.31.32.64 any -> 172.16.1.20 123912 (msg: "cloud-to-onpreim-test-123"; sid: 1; gid:123;), reason:  failed to parse port "123912"\nstateful rule is invalid',
                });

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                ]);
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();

            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();

            expect(caputredParamRules.filter((f) => f.status === 'FAILED').length).toBe(
                2
            );
            expect(
                caputredParamRules.filter((f) => f.status === 'FAILED')[0].failureReasons
            ).toEqual([
                'Encountered unresolvable error: stateful rule is invalid,  rule: pass tcp 172.31.32.64 any -> 172.16.1.20 123912 (msg: "cloud-to-onpreim-test-123"; sid: 1; gid:123;), reason:  failed to parse port "123912"\nstateful rule is invalid',
            ]);
            expect(
                caputredParamRules.filter((f) => f.status === 'FAILED')[0].failureReasons
            ).toEqual([
                'Encountered unresolvable error: stateful rule is invalid,  rule: pass tcp 172.31.32.64 any -> 172.16.1.20 123912 (msg: "cloud-to-onpreim-test-123"; sid: 1; gid:123;), reason:  failed to parse port "123912"\nstateful rule is invalid',
            ]);
        });

        test('should update all rules to FAILED IF firewall config failed with no specific rules info', async () => {
            // standard ANFW error
            //[
            //   'stateful rule is invalid',
            //   ' rule: pass tcp 10.0.0.0 123987 -> 172.31.32.64 any (msg: "Onprem-to-cloud-securitygrouparn-test"; sid: 1; gid:123;)',
            //   ' reason:  failed to parse port "123987"'
            // ]
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;

            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenReject({
                    name: 'InvalidRequestException',
                    message: 'stateful rule is invalid,  general info',
                });

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                ]);
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();

            const captured = capture(ddbService.updateRules);
            const [caputredParamRules] = captured.last();

            expect(caputredParamRules.filter((f) => f.status === 'FAILED').length).toBe(
                2
            );
            expect(
                caputredParamRules.filter((f) => f.status === 'FAILED')[0].failureReasons
            ).toEqual([
                'Encountered unresolvable error: stateful rule is invalid,  general info',
            ]);
            expect(
                caputredParamRules.filter((f) => f.status === 'FAILED')[0].failureReasons
            ).toEqual([
                'Encountered unresolvable error: stateful rule is invalid,  general info',
            ]);
        });

        test('should not update rules status when unhandlable error happened when updating rules to ANFW', async () => {
            const describeRuleGroupOutcome: DescribeRuleGroupCommandOutput = {
                UpdateToken: 'token',
            } as DescribeRuleGroupCommandOutput;

            when(networkFirewallClient.send(anything()))
                .thenResolve(describeRuleGroupOutcome)
                .thenReject({
                    name: 'SomeOtherException',
                    message: 'no meaningful message',
                });

            let error;
            try {
                await objectUnderTest.updateRules('arn', [
                    { ...TEST_RULE_1 },
                    { ...TEST_RULE_2 },
                ]);
            } catch (e) {
                error = e;
            }

            verify(ddbService.updateRules(anything())).never();
            expect(error).toEqual(
                new UnderlyingServiceError(
                    'An error occurred when applying rules to ANFW',
                    503,
                    true
                )
            );

            // const captured = capture(ddbService.updateRules);
            // const [caputredParamRules] = captured.last();

            // expect(caputredParamRules.filter(f => f.status === 'FAILED').length).toBe(2);
            // expect(caputredParamRules.filter(f => f.status === 'FAILED')[0].failureReasons).toEqual(['Encountered unresolvable error: no meaningful message']);
            // expect(caputredParamRules.filter(f => f.status === 'FAILED')[1].failureReasons).toEqual(['Encountered unresolvable error: no meaningful message']);
        });
    });
});
