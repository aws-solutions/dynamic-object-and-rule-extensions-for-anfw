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
import { FlowRule, StaticLoggerFactory } from 'shared_types';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { DeleteRuleHandler } from 'src/handlers/rules/DeleteRuleHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { anything, capture, instance, mock, reset, verify, when } from 'ts-mockito';

const DEFAULT_REQUESTOR = 'userArn';
const DEFAULT_RULE: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    failureReasons: [],
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-id',
    source: 'Ec2_Arn',
    status: 'ACTIVE',
    destinationPort: {
        type: 'SinglePort',
        value: '123',
    },
    sourcePort: {
        type: 'Any',
    },
};
describe('DeleteRuleHandler handler tests', () => {
    const ddb = mock(RulesDataSourceService);
    const authorizationValidator = mock(RuleGroupAuthenticationValidator);
    const auditDatasource = mock(AuditsDataSourceService);
    const handler = new DeleteRuleHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(auditDatasource),
        instance(authorizationValidator)
    );

    beforeEach(() => {
        reset(ddb);
        when(ddb.getRuleBy('id')).thenResolve(DEFAULT_RULE);
    });
    test('should delete rule', async () => {
        when(ddb.deleteRuleBy(anything(), anything())).thenResolve('id');
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.deleteRuleBy);

        const [ruleBundleId, ruleId] = captured.last();

        expect(ruleBundleId).toEqual('rule-group-id');
        expect(ruleId).toEqual('id');
        expect(result.statusCode).toBe(200);
    });

    test('should return not found when path and body group id not match', async () => {
        when(ddb.deleteRuleBy(anything(), anything())).thenResolve('id');
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'other-rule-group-id', ruleId: 'id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toEqual(
            'Rule bundle id does not matching the requested rule'
        );
        verify(ddb.createRule(anything())).never();
    });

    test('should return not found when rule not found in db', async () => {
        when(ddb.getRuleBy(anything())).thenResolve(undefined);
        when(ddb.deleteRuleBy(anything(), anything())).thenResolve('id');
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'other-rule-group-id', ruleId: 'id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toEqual('Rule not found');
        verify(ddb.createRule(anything())).never();
    });

    test('should return error when path id not present', async () => {
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: {},
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
        verify(ddb.createRule(anything())).never();
    });

    test('should not delete rules if not authorized to create it in group', async () => {
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
        verify(ddb.deleteRuleBy(anything(), anything())).never();
        expect(result.statusCode).toBe(403);
    });
});
