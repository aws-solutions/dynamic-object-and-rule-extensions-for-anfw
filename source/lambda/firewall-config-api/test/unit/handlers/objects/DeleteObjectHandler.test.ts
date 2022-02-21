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
import { FlowObject, FlowRule, StaticLoggerFactory } from 'shared_types';
import { DeleteObjectHandler } from 'src/handlers/objects/DeleteObjectHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { PolicyDecisionResponse } from 'src/types/PolicyDecisionResponse';
import {
    anyString,
    anything,
    deepEqual,
    instance,
    mock,
    reset,
    verify,
    when,
} from 'ts-mockito';
const DEFAULT_REQUESTOR = 'userArn';
const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const TEST_RULE: FlowRule = {
    id: 'rule-id',
    version: 0,
    failureReasons: [],
    action: 'pass',
    destination: 'Onprem_Server',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-003',
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

const compliantResult: PolicyDecisionResponse = {
    status: 'COMPLIANT',
    timestamp: 123123123,
    reasonPhrases: [
        { policyId: 'policy1', status: 'COMPLIANT', reason: 'validation passed' },
    ],
};
describe('DeleteTargetHandler handler tests', () => {
    const ddb = mock(ObjectsDataSourceService);
    const auditsDataSourceService = mock(AuditsDataSourceService);
    const opaPolicyService = mock(OpaPolicyService);
    const rulesDataSourceService = mock(RulesDataSourceService);
    let handler: DeleteObjectHandler;

    beforeEach(() => {
        reset(ddb);
        reset(auditsDataSourceService);
        reset(opaPolicyService);
        reset(rulesDataSourceService);
        when(ddb.getObjectBy(anything())).thenResolve(TEST_OBJECT_1);
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve(compliantResult);
        when(rulesDataSourceService.getRuleByReferences(anyString())).thenResolve([]);
        handler = new DeleteObjectHandler(
            new StaticLoggerFactory(),
            instance(ddb),
            instance(rulesDataSourceService),
            instance(auditsDataSourceService),
            instance(opaPolicyService)
        );
    });
    test('returns 400 if path parameter is undefined', async () => {
        // act
        const result = await handler.handle(
            { requestContext: { accountId: '10001' } } as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('returns 400 if no id parameter provided', async () => {
        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    accountId: '10001',
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { random: 123 },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('returns 400 if opa validation non_compliant', async () => {
        const nonCompliantResult: PolicyDecisionResponse = {
            status: 'NON_COMPLIANT',
            timestamp: 123123123,
            reasonPhrases: [
                {
                    policyId: 'policy1',
                    status: 'NON_COMPLIANT',
                    reason: 'validation failed',
                },
            ],
        };
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve(nonCompliantResult);
        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 123 },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('returns 500 if opa cluster error', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenReject(new Error('opa cluster error'));
        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 123 },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(500);
    });

    test('return 200 with id', async () => {
        // arrange
        when(ddb.getObjectBy('Onprem_Server')).thenResolve(TEST_OBJECT_1);

        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'Onprem_Server' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        verify(ddb.deleteObject(anything())).once();
        expect(result.statusCode).toBe(200);
        const response = JSON.parse(result.body);
        expect(response).not.toBeUndefined();
        expect(response.id).toEqual('Onprem_Server');
    });

    test('return 400 when object is referenced by rules', async () => {
        // arrange
        when(ddb.getObjectBy('Onprem_Server')).thenResolve(TEST_OBJECT_1);
        when(rulesDataSourceService.getRuleByReferences('Onprem_Server')).thenResolve([
            TEST_RULE,
        ]);
        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'Onprem_Server' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        verify(ddb.deleteObject(anything())).never();
        expect(result.statusCode).toBe(400);
        const response = JSON.parse(result.body);
        expect(response).not.toBeUndefined();
        expect(response.message).toEqual(
            'Object Onprem_Server is referenced by rules rule-id'
        );
    });

    test('return 500 if database deletion failed', async () => {
        // arrange
        when(ddb.getObjectBy('Onprem_Server')).thenResolve(TEST_OBJECT_1);
        when(ddb.deleteObject('Onprem_Server')).thenReject(new Error('Database error'));
        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'Onprem_Server' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert

        expect(result.statusCode).toBe(500);
        const response = JSON.parse(result.body);
        expect(response).not.toBeUndefined();
        expect(response.message).toEqual(
            'Error while deleting rule object Onprem_Server'
        );
    });

    test('return 404 if target not found', async () => {
        // arrange
        when(ddb.getObjectBy('Onprem_Server')).thenResolve(undefined);

        // act
        const result = await handler.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
                pathParameters: { id: 'Onprem_Server' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        verify(ddb.deleteObject(deepEqual('Onprem_Server'))).never();
        expect(result.statusCode).toBe(404);
    });
});
