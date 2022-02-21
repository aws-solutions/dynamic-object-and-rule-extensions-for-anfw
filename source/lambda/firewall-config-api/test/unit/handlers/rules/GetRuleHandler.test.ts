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
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import 'reflect-metadata';
import { FlowRule, FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { GetRuleHandler } from 'src/handlers/rules/GetRuleHandler';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';

const RULE_GROUP_ID = 'rule-group-id';
const TEST_RULE_1: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    failureReasons: [],
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: RULE_GROUP_ID,
    source: 'Ec2_Arn',
    status: 'ACTIVE',
};
const DEFAULT_REQUESTOR = 'userArn';
describe('GetRuleHandler handler tests', () => {
    const ddb = mock(RulesDataSourceService);
    const authorizationValidator = mock(RuleGroupAuthenticationValidator);
    let handler: GetRuleHandler;

    beforeEach(() => {
        reset(authorizationValidator);
        reset(ddb);
        when(
            authorizationValidator.checkRuleGroupAccess(
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve(null);
        handler = new GetRuleHandler(
            new StaticLoggerFactory(),
            instance(ddb),
            instance(authorizationValidator)
        );
    });
    test('return 200 with rule', async () => {
        // arrange
        when(ddb.getRuleBy('rule-123')).thenResolve(TEST_RULE_1);

        // act
        const result = await handler.handle(
            ({
                pathParameters: {
                    id: RULE_GROUP_ID,
                    ruleId: 'rule-123',
                },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(200);
        const attestation = <FlowRuleBundle>JSON.parse(result.body);
        expect(attestation).not.toBeUndefined();
    });

    test('return 403 when attempting to get rule from unauthorized rule group', async () => {
        // arrange
        when(
            authorizationValidator.checkRuleGroupAccess(
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve(ServerlessResponse.ofObject(403, { message: 'not authorized' }));
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(ddb.getRuleBy(anything())).never();
        expect(result.statusCode).toBe(403);
    });

    test('returns 400 if path parameter is undefined', async () => {
        // act
        const result = await handler.handle({} as APIGatewayProxyEvent, {} as Context);

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('returns 400 if no id parameter provided', async () => {
        // act
        const result = await handler.handle(
            ({
                pathParameters: { random: 123 },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('return 404 if rule not found', async () => {
        // arrange
        when(ddb.getRuleBy('rule-123')).thenResolve(undefined);

        // act
        const result = await handler.handle(
            ({
                pathParameters: { id: RULE_GROUP_ID, ruleId: 'rule-123' },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toBe('Rule not found');
    });

    test('return 404 if rule found but not in the given rulegroup', async () => {
        // arrange
        when(ddb.getRuleBy('rule-123')).thenResolve({
            ...TEST_RULE_1,
            ruleBundleId: 'other-group',
        });

        // act
        const result = await handler.handle(
            ({
                pathParameters: { id: RULE_GROUP_ID, ruleId: 'rule-123' },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toBe(
            'Rule bundle id does not matching the requested rule'
        );
    });

    test('return 200 with rule', async () => {
        // arrange
        when(ddb.getRuleBy('rule-123')).thenResolve(TEST_RULE_1);

        // act
        const result = await handler.handle(
            ({
                pathParameters: { id: RULE_GROUP_ID, ruleId: 'rule-123' },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(200);
        const attestation = <FlowRuleBundle>JSON.parse(result.body);
        expect(attestation).not.toBeUndefined();
    });
});
