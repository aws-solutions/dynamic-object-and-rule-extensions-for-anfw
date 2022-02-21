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
    APIGatewayProxyEvent,
    APIGatewayProxyEventPathParameters,
    Context,
} from 'aws-lambda';
import 'reflect-metadata';
import { FlowRule, StaticLoggerFactory } from 'shared_types';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { ListRulesHandler } from 'src/handlers/rules/ListRulesHandler';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import {
    anything,
    capture,
    deepEqual,
    instance,
    mock,
    reset,
    resetCalls,
    verify,
    when,
} from 'ts-mockito';

const DEFAULT_REQUESTOR = 'userArn';
const SAMPLE_REQUEST = {
    queryStringParameters: {
        limit: '2',
        nextToken: 'bla-123',
    } as APIGatewayProxyEventPathParameters,
    requestContext: {
        identity: { userArn: DEFAULT_REQUESTOR },
        accountId: '1000',
    },
} as APIGatewayProxyEvent;

const SAMPLE_REQUEST_EMPTY_PARAMETERS = {
    queryStringParameters: {} as APIGatewayProxyEventPathParameters,
    requestContext: {
        identity: { userArn: DEFAULT_REQUESTOR },
        accountId: '1000',
    },
} as APIGatewayProxyEvent;

const RULE_GROUP_ID = 'rule-group-id';
const TEST_RULE_1: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    failureReasons: [],
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: RULE_GROUP_ID,
    source: 'Ec2_Arn',
    status: 'ACTIVE',
};
const TEST_RULE_2: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    failureReasons: [],
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: RULE_GROUP_ID,
    source: 'Ec2_Arn',
    status: 'ACTIVE',
};

describe('ListRulesHandler handler tests', () => {
    const mockdb = mock(RulesDataSourceService);
    const validator = mock(RuleGroupAuthenticationValidator);

    const handler = new ListRulesHandler(
        new StaticLoggerFactory(),
        instance(mockdb),
        instance(validator)
    );

    beforeEach(() => {
        resetCalls(mockdb);
        reset(validator);
        when(
            validator.checkRuleGroupAccess(anything(), anything(), anything(), anything())
        ).thenResolve(null);
    });

    test('should list all rules', async () => {
        const expected = { results: [TEST_RULE_1, TEST_RULE_2], nextToken: '' };
        when(
            mockdb.getRulesByBundleId(anything(), deepEqual(100), anything())
        ).thenResolve(expected);

        const response = await handler.handle(
            {
                ...SAMPLE_REQUEST_EMPTY_PARAMETERS,
                pathParameters: {
                    id: '123',
                },
            },
            {} as Context
        );

        const captured = capture(mockdb.getRulesByBundleId);

        const [ruleBundleId, limit, token] = captured.last();
        // DEFAULT limit applies
        expect(ruleBundleId).toEqual('123');
        expect(limit).toEqual(100);
        expect(token).toBeUndefined();

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });

    test('should not return rules if not authorized to list them', async () => {
        const expected = { results: [TEST_RULE_1, TEST_RULE_2], nextToken: '' };
        when(
            mockdb.getRulesByBundleId(anything(), deepEqual(100), anything())
        ).thenResolve(expected);
        when(
            validator.checkRuleGroupAccess(anything(), anything(), anything(), anything())
        ).thenResolve(ServerlessResponse.ofObject(403, { message: 'not authorized' }));
        const response = await handler.handle(
            {
                ...SAMPLE_REQUEST_EMPTY_PARAMETERS,
                pathParameters: {
                    id: '123',
                },
            },
            {} as Context
        );
        expect(response.statusCode).toBe(403);
        verify(mockdb.getRulesByBundleId(anything())).never();
    });

    test('should raise exception if no id provided', async () => {
        const expected = { results: [TEST_RULE_1, TEST_RULE_2], nextToken: '' };
        when(
            mockdb.getRulesByBundleId(anything(), deepEqual(100), anything())
        ).thenResolve(expected);

        const response = await handler.handle(
            {
                ...SAMPLE_REQUEST_EMPTY_PARAMETERS,
                pathParameters: {},
            },
            {} as Context
        );

        expect(response.statusCode).toEqual(400);
    });

    test('with limit and token', async () => {
        const expected = { results: [TEST_RULE_1, TEST_RULE_2], nextToken: 'bla' };
        when(mockdb.getRulesByBundleId(anything(), anything(), anything())).thenResolve(
            expected
        );

        const response = await handler.handle(
            {
                ...SAMPLE_REQUEST,
                pathParameters: {
                    id: 'new-123',
                },
            },
            {} as Context
        );
        expect(response.statusCode).toBe(200);
        const captured = capture(mockdb.getRulesByBundleId);

        const [ruleBundleId, limit, token] = captured.last();
        expect(ruleBundleId).toEqual('new-123');
        expect(limit).toEqual(2);
        expect(token).toEqual('bla-123');

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });
});
