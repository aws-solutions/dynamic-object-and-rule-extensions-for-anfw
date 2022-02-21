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
import 'reflect-metadata';
import { FlowObject, FlowRule, FlowRuleBundle } from 'shared_types';

import { RuleDefinitionResolver } from 'src/resolvers/RuleDefinitionResolver';
import { anything, instance, mock, when } from 'ts-mockito';
import { ObjectDefinitionResolver } from 'shared_types/src/resolvers/ObjectDefinitionResolver';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';

const TEST_RULE_1: FlowRule = {
    action: 'pass',
    id: 'cloud-to-onpreim-test',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'SecurityGroup_Arn',
    destination: 'Onprem_Server',
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

const TEST_RULE_INVALID_REFERENCE: FlowRule = {
    action: 'pass',
    id: 'cloud-to-onpreim-test',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-001',
    source: 'NOT_EXISTING_SRC_OBJECT',
    destination: 'Onprem_Server',
    destinationPort: {
        type: 'SinglePort',
        value: '123',
    },
    sourcePort: {
        type: 'Any',
    },
    status: 'ACTIVE',
    version: 10,
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

const DEFAULT_RULEGROUP: FlowRuleBundle = {
    id: 'rulegroup-1',
    ruleGroupArn: 'arn',
    aggregatorName: 'aggregator',
    version: 0,
    description: 'test rule group',
    ownerGroup: ['admin', 'app_owner_1'],
};

describe('Test RuleDefinitionResolver', () => {
    const objectResolver: ObjectDefinitionResolver = mock(ObjectDefinitionResolver);
    const mockedObjectResolver: ObjectDefinitionResolver = instance(objectResolver);

    const objectUnderTest = new RuleDefinitionResolver(
        new StaticLoggerFactory(),
        mockedObjectResolver
    );

    test('should resolve rule', async () => {
        when(objectResolver.resolveTarget(anything(), anything())).thenResolve({
            ...TEST_OBJECT_1,
            addresses: ['0.0.0.0'],
        });
        const result = await objectUnderTest.resolveRules(
            DEFAULT_RULEGROUP,
            [TEST_RULE_1],
            [TEST_OBJECT_1, TEST_OBJECT_2],
            0
        );
        expect(result).toHaveLength(1);
        expect(result[0].suricataString?.trim()).toEqual(
            'pass tcp 0.0.0.0 any ->  0.0.0.0 123 (msg: "cloud-to-onpreim-test"; sid: 1;)'
        );
    });

    test('should resolve rule with option fields', async () => {
        when(objectResolver.resolveTarget(anything(), anything())).thenResolve({
            ...TEST_OBJECT_1,
            addresses: ['0.0.0.0'],
        });
        const result = await objectUnderTest.resolveRules(
            DEFAULT_RULEGROUP,
            [
                {
                    ...TEST_RULE_1,
                    optionFields: [
                        { key: 'content', value: '"a.jsp"' },
                        { key: 'flow', value: 'to_server' },
                    ],
                },
            ],
            [TEST_OBJECT_1, TEST_OBJECT_2],
            0
        );
        expect(result).toHaveLength(1);
        expect(result[0].suricataString?.trim()).toEqual(
            'pass tcp 0.0.0.0 any ->  0.0.0.0 123 (msg: "cloud-to-onpreim-test"; sid: 1; content: "a.jsp"; flow: to_server;)'
        );
    });

    test('should set rule to fail if referenced object is not found', async () => {
        const result = await objectUnderTest.resolveRules(
            DEFAULT_RULEGROUP,
            [TEST_RULE_INVALID_REFERENCE],
            [TEST_OBJECT_1, TEST_OBJECT_2],
            1
        );
        expect(result).toHaveLength(1);
        expect(result[0].status).toEqual('FAILED');
        expect(result[0].failureReasons).toEqual([
            'Unable to resolve reference object of source and/or destination',
        ]);
    });

    test('should update rule status if src object is not resolvable', async () => {
        when(objectResolver.resolveTarget(anything(), anything()))
            .thenResolve({ ...TEST_OBJECT_1, addresses: [] })
            .thenResolve({
                ...TEST_OBJECT_2,
                addresses: ['10.0.0.0'],
            });
        const result = await objectUnderTest.resolveRules(
            DEFAULT_RULEGROUP,
            [TEST_RULE_1],
            [TEST_OBJECT_1, TEST_OBJECT_2],
            1
        );
        expect(result).toHaveLength(1);
        expect(result[0].status).toEqual('FAILED');
        expect(result[0].failureReasons).toEqual([
            'Can not resolve source object to address SecurityGroup_Arn',
        ]);
    });

    test('should update rule status if dest object is not resolvable', async () => {
        when(objectResolver.resolveTarget(anything(), anything()))
            .thenResolve({ ...TEST_OBJECT_1, addresses: ['10.0.0.0'] })
            .thenResolve({ ...TEST_OBJECT_2, addresses: [] });
        const result = await objectUnderTest.resolveRules(
            DEFAULT_RULEGROUP,
            [TEST_RULE_1],
            [TEST_OBJECT_1, TEST_OBJECT_2],
            1
        );
        expect(result).toHaveLength(1);
        expect(result[0].status).toEqual('FAILED');
        expect(result[0].failureReasons).toEqual([
            'Can not resolve destination object to address Onprem_Server',
        ]);
    });

    test('should raise exception when object encounter remote exception', async () => {
        when(objectResolver.resolveTarget(anything(), anything())).thenReject(
            new Error('unknown error')
        );

        expect(
            objectUnderTest.resolveRules(
                DEFAULT_RULEGROUP,
                [TEST_RULE_1],
                [TEST_OBJECT_1, TEST_OBJECT_2],
                1
            )
        ).rejects.toEqual(
            new UnderlyingServiceError(
                'An error occurred when saving the new object',
                503,
                true
            )
        );
    });
});
