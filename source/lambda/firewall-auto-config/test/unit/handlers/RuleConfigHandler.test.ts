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
import { Context } from 'aws-lambda';
import 'reflect-metadata';
import { RuleDefinitionResolver } from 'src/resolvers/RuleDefinitionResolver';
import {
    ConfigurationEvaluationTriggerEvent,
    DEFAULT_RULE,
    RuleConfigHandler,
} from 'src/handlers/RuleConfigHandler';
import { DDBdataSourceService } from 'src/service/DDBdataSourceService';

import { RuleUpdater } from 'src/service/RuleUpdater';
import { FlowObject, FlowRule } from 'shared_types';
import { anything, capture, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { RuleStatusNotifier } from 'src/service/RuleStatusNotifier';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';

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
    destination: 'SecurityGroup_Arn',
    id: 'Onprem-to-cloud-securitygrouparn-test',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'Onprem_Server',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    status: 'ACTIVE',
    version: 992,
};

const TEST_OBJECT_1: FlowObject = {
    id: 'SecurityGroup_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:1000:security-group/sg-04990f6f47563a65f',
};

const TEST_OBJECT_2: FlowObject = {
    id: 'Onprem_Server',
    type: 'Address',
    value: '172.16.1.20',
};

const DEFAULT_GROUP = {
    id: 'group_123',
    ruleGroupArn:
        'arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup',
    version: 0,
    description: 'test',
    ownerGroup: [],
};

const DEFAULT_GROUP_2 = {
    id: 'group_xyz',
    ruleGroupArn:
        'arn:aws:network-firewall:ap-southeast-2:2000:stateful-rulegroup/anfwconfig-testrulegroup-2',
    version: 0,
    description: 'test',
    ownerGroup: [],
};

describe('Test RuleConfigHandler', () => {
    const ddbService: DDBdataSourceService = mock(DDBdataSourceService);
    const mockedDDBService: DDBdataSourceService = instance(ddbService);

    const definitionResolver: RuleDefinitionResolver = mock(RuleDefinitionResolver);
    const mockedDefinitionResolver: RuleDefinitionResolver = instance(definitionResolver);

    const ruleUpdater: RuleUpdater = mock(RuleUpdater);
    const mockedRuleUpdater: RuleUpdater = instance(ruleUpdater);
    const ruleStatusNotifier: RuleStatusNotifier = mock(RuleStatusNotifier);
    const mockRuleStatusNotifier = instance(ruleStatusNotifier);
    let objectUnderTest: RuleConfigHandler;
    beforeEach(() => {
        when(ddbService.getRuleBundleByIds(deepEqual([DEFAULT_GROUP.id]))).thenResolve([
            DEFAULT_GROUP,
        ]);
        const rules = [TEST_RULE_1, TEST_RULE_2];
        const objects = [TEST_OBJECT_1, TEST_OBJECT_2];
        when(ddbService.getRulesBy(deepEqual(DEFAULT_GROUP.id))).thenResolve(rules);

        when(ddbService.getObjects(anything())).thenResolve(objects);

        when(
            definitionResolver.resolveRules(
                anything(),
                deepEqual(rules),
                deepEqual(objects),
                anything()
            )
        ).thenResolve(rules);
        when(ruleUpdater.updateRules(DEFAULT_GROUP.ruleGroupArn, rules));
        objectUnderTest = new RuleConfigHandler(
            new StaticLoggerFactory(),
            mockedDDBService,
            mockedDefinitionResolver,
            mockedRuleUpdater,
            mockRuleStatusNotifier
        );
    });

    describe('negative cases', () => {
        test('should ignore the process if no rule group found', async () => {
            const result = await objectUnderTest.handle(
                { ruleBundleIds: [''] },
                {} as Context
            );
            expect(result.statusCode).toEqual(404);
            expect(JSON.parse(result.body).message).toEqual('rule bundle not found ');
        });

        test('should not update anything if invalid request', async () => {
            when(
                definitionResolver.resolveRules(
                    anything(),
                    anything(),
                    anything(),
                    anything()
                )
            ).thenResolve([]);
            when(ddbService.getRulesBy(DEFAULT_GROUP.id)).thenResolve([]);
            const result = await objectUnderTest.handle(
                {} as ConfigurationEvaluationTriggerEvent,
                {} as Context
            );

            expect(result.statusCode).toEqual(400);
            expect(JSON.parse(result.body).message).toEqual(
                `rule bundle ids not provided`
            );
        });

        test('should not update anything if request group is targeting at different anfw group', async () => {
            when(ddbService.getRuleBundleByIds(anything())).thenResolve([
                DEFAULT_GROUP,
                DEFAULT_GROUP_2,
            ]);
            when(ddbService.getRulesBy(DEFAULT_GROUP.id)).thenResolve([]);
            const result = await objectUnderTest.handle(
                { ruleBundleIds: [DEFAULT_GROUP.id, DEFAULT_GROUP_2.id] },
                {} as Context
            );

            expect(result.statusCode).toEqual(400);
            expect(JSON.parse(result.body).message).toEqual(
                `rule bundles group_123,group_xyz are targeting at different firewall rules`
            );
        });

        test('should not update anything if AWS config remote error', async () => {
            when(ddbService.getRuleBundleByIds(anything())).thenResolve([DEFAULT_GROUP]);
            when(
                definitionResolver.resolveRules(
                    anything(),
                    anything(),
                    anything(),
                    anything()
                )
            ).thenReject(new UnderlyingServiceError('AWS remote error'));

            const result = await objectUnderTest.handle(
                { ruleBundleIds: [DEFAULT_GROUP.id] },
                {} as Context
            );

            verify(ddbService.updateRules(anything())).never();
            expect(result.statusCode).toEqual(503);
            expect(JSON.parse(result.body).message).toEqual(
                'Unable to update group_123 due to underlying service error'
            );
        });

        test('should not update anything if general error', async () => {
            when(ddbService.getRuleBundleByIds(anything())).thenResolve([DEFAULT_GROUP]);
            when(
                definitionResolver.resolveRules(
                    anything(),
                    anything(),
                    anything(),
                    anything()
                )
            ).thenReject(new Error('AWS remote error'));

            const result = await objectUnderTest.handle(
                { ruleBundleIds: [DEFAULT_GROUP.id] },
                {} as Context
            );

            verify(ddbService.updateRules(anything())).never();
            expect(result.statusCode).toEqual(503);
            expect(JSON.parse(result.body).message).toEqual(
                'Unable to update group_123 due to unexpected internal error'
            );
        });
    });

    describe('happy cases', () => {
        test('should update rules to ACTIVE', async () => {
            when(ddbService.getRuleBundleByIds(anything())).thenResolve([DEFAULT_GROUP]);
            const result = await objectUnderTest.handle(
                { ruleBundleIds: [DEFAULT_GROUP.id] },
                {} as Context
            );

            expect(result.statusCode).toEqual(200);
            expect(JSON.parse(result.body).message).toEqual(
                'successfully processed rules for rule bundle group_123'
            );
        });

        test('should apply default denial rule when no rules found for all rulegroup targeted at same ANFW rulegroup', async () => {
            when(
                definitionResolver.resolveRules(
                    anything(),
                    anything(),
                    anything(),
                    anything()
                )
            ).thenResolve([]);
            when(ddbService.getRulesBy(DEFAULT_GROUP.id)).thenResolve([]);
            const result = await objectUnderTest.handle(
                { ruleBundleIds: [DEFAULT_GROUP.id] },
                {} as Context
            );

            expect(result.statusCode).toEqual(200);
            const captured = capture(ruleUpdater.updateRules);

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, rules, updateStatus] = captured.last();
            expect(rules).toHaveLength(1);
            rules[0].id = DEFAULT_RULE.id;
            expect(updateStatus).toEqual(false);
            expect(JSON.parse(result.body).message).toEqual(
                `successfully processed rules for rule bundle ${DEFAULT_GROUP.id}`
            );
        });
    });
});
