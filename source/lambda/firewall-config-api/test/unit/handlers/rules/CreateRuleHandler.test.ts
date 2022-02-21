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
import { CreateRuleHandler } from 'src/handlers/rules/CreateRuleHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { CreateFlowRuleInput, FlowRuleInput } from 'src/types/FlowRule';
import { CreateRuleInputValidator } from 'src/validators/CreateRuletInputValidator';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { anything, capture, instance, mock, reset, verify, when } from 'ts-mockito';

const DEFAULT_REQUESTOR = 'userArn';
const VALID_INPUT: FlowRule = {
    version: 0,
    action: 'pass',
    destination: 'Onprem_Server',
    failureReasons: [],
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-id',
    source: 'Ec2_Arn',
    status: 'ACTIVE',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
};
describe('CreateRuleHandler handler tests', () => {
    const ddb = mock(RulesDataSourceService);
    const validator = mock(CreateRuleInputValidator);
    const authorizationValidator = mock(RuleGroupAuthenticationValidator);
    const auditDatasource = mock(AuditsDataSourceService);
    const opaPolicyService = mock(OpaPolicyService);
    let handler: CreateRuleHandler;

    beforeEach(() => {
        reset(ddb);
        reset(validator);
        reset(authorizationValidator);
        reset(auditDatasource);
        reset(opaPolicyService);
        when(
            authorizationValidator.checkRuleGroupAccess(
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve(null);
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
        handler = new CreateRuleHandler(
            new StaticLoggerFactory(),
            instance(ddb),
            instance(auditDatasource),
            instance(validator),
            instance(authorizationValidator),
            instance(opaPolicyService)
        );
    });
    test('should create rule ', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.createRule);

        const [sentCmd] = captured.last();
        const rule = sentCmd as CreateFlowRuleInput;
        expect(rule.status).toEqual('PENDING');
        expect(rule.ruleBundleId).toEqual('rule-group-id');
        expect(result.statusCode).toBe(201);
    });

    test('should create rule with option fields ', async () => {
        when(validator.parseAndValidate(anything())).thenResolve({
            ...VALID_INPUT,
            optionFields: [{ key: 'server', value: '1' }],
        });
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.createRule);

        const [sentCmd] = captured.last();
        const rule = sentCmd as CreateFlowRuleInput;
        expect(rule.status).toEqual('PENDING');
        expect(rule.ruleBundleId).toEqual('rule-group-id');
        expect(result.statusCode).toBe(201);
    });

    test('should not create rule if policy violated ', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'NON_COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [
                { policyId: 'rulepolicy1', reason: 'not valid', status: 'NON_COMPLIANT' },
            ],
        });
        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        verify(ddb.createRule(anything())).never();
        expect(result.statusCode).toBe(400);
    });

    test('should not create rule if opa remote error ', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenReject(new Error('opa cluster error'));

        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        verify(ddb.createRule(anything())).never();
        expect(result.statusCode).toBe(500);
    });

    test('should return error when path and body group id not match', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'other-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
        verify(ddb.createRule(anything())).never();
    });

    test('should return error when path id not present', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
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

    test('should return error when db access failed', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(
            VALID_INPUT as FlowRuleInput
        );
        when(ddb.createRule(anything())).thenReject(new Error('insert failed'));
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(500);
    });

    test('should not create rules if not authorized to create it in group', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(VALID_INPUT);
        when(
            authorizationValidator.checkRuleGroupAccess(
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve(ServerlessResponse.ofObject(403, { message: 'not authorized' }));
        when(ddb.createRule(anything())).thenResolve(VALID_INPUT);
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'rule-group-id' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(ddb.createRule(anything())).never();

        expect(result.statusCode).toBe(403);
    });
});
