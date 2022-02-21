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
import { UpdateRuleHandler } from 'src/handlers/rules/UpdateRuleHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { FlowRuleInput } from 'src/types/FlowRule';
import { CreateRuleInputValidator } from 'src/validators/CreateRuletInputValidator';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { anything, capture, instance, mock, reset, verify, when } from 'ts-mockito';

const DEFAULT_REQUESTOR = 'userArn';
const VALID_RULE: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    failureReasons: [],
    id: 'rule-id',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-id',
    source: 'Ec2_Arn',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    status: 'ACTIVE',
};

describe('UpdateRuleHandler handler tests', () => {
    const ddb = mock(RulesDataSourceService);
    const validator = mock(CreateRuleInputValidator);
    const auditDatasource = mock(AuditsDataSourceService);
    const authorizationValidator = mock(RuleGroupAuthenticationValidator);
    const opaPolicyService = mock(OpaPolicyService);
    const handler = new UpdateRuleHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(auditDatasource),
        instance(validator),
        instance(authorizationValidator),
        instance(opaPolicyService)
    );

    beforeEach(() => {
        reset(ddb);
        reset(validator);
        reset(authorizationValidator);
        reset(auditDatasource);
        reset(opaPolicyService);
        when(ddb.getRuleBy(anything())).thenResolve(VALID_RULE);
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
    });
    test('should update rule group', async () => {
        when(ddb.updateRule(anything())).thenResolve(VALID_RULE);
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);

        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.updateRule);

        const [sentCmd] = captured.last();
        const rule = sentCmd as FlowRule;
        expect(rule.status).toEqual('ACTIVE');
        expect(rule.ruleBundleId).toEqual('rule-group-id');
        expect(result.statusCode).toBe(200);
    });

    test('should return errro when policy violated', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'NON_COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [
                { policyId: 'rulepolicy1', reason: 'not valid', status: 'NON_COMPLIANT' },
            ],
        });

        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);

        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(ddb.updateRule(anything())).never();
        expect(result.statusCode).toBe(400);
    });

    test('should return internal error when opa cluster remote error', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenReject(new Error('opa cluster error'));

        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);

        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(ddb.updateRule(anything())).never();
        expect(result.statusCode).toBe(500);
    });

    test('should return error when path and body group id not match', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);
        when(ddb.createRule(anything())).thenResolve(VALID_RULE);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'other-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
        verify(ddb.createRule(anything())).never();
    });

    test('should return error when path and body rule id not match', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);
        when(ddb.createRule(anything())).thenResolve(VALID_RULE);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'other-rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
        verify(ddb.createRule(anything())).never();
    });

    test('should return error when path id not present', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);
        when(ddb.createRule(anything())).thenResolve(VALID_RULE);
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

    test('should return 404 when rule', async () => {
        when(ddb.getRuleBy(anything())).thenResolve(undefined);
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);
        when(ddb.createRule(anything())).thenResolve(VALID_RULE);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(404);
        verify(ddb.createRule(anything())).never();
    });

    test('should return error when db access failed', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(
            VALID_RULE as FlowRuleInput
        );
        when(ddb.updateRule(anything())).thenReject(new Error('insert failed'));
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(500);
    });

    test('should update rule group', async () => {
        when(ddb.updateRule(anything())).thenResolve(VALID_RULE);
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);

        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.updateRule);

        const [sentCmd] = captured.last();
        const rule = sentCmd as FlowRule;
        expect(rule.status).toEqual('ACTIVE');
        expect(rule.ruleBundleId).toEqual('rule-group-id');
        expect(result.statusCode).toBe(200);
    });

    test('should return error when not authorized', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_RULE);
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
                pathParameters: { id: 'rule-group-id', ruleId: 'rule-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        verify(ddb.updateRule(anything())).never();

        expect(result.statusCode).toBe(403);
    });
});
