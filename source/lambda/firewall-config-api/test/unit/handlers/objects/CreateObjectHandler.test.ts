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
import { FlowObject, StaticLoggerFactory } from 'shared_types';
import { CreateObjectHandler } from 'src/handlers/objects/CreateObjectHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { CreateObjectInputValidator } from 'src/validators/CreateObjectInputValidator';
import {
    anyString,
    anything,
    deepEqual,
    instance,
    mock,
    reset,
    resetCalls,
    verify,
    when,
} from 'ts-mockito';

const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const DEFAULT_REQUESTOR = 'userArn';
describe('CreateTargetHandler handler tests', () => {
    const ddb = mock(ObjectsDataSourceService);
    const validator = mock(CreateObjectInputValidator);
    const auditDatasource = mock(AuditsDataSourceService);
    const opaPolicyService = mock(OpaPolicyService);

    const objectUnderTest: CreateObjectHandler = new CreateObjectHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(auditDatasource),
        instance(validator),
        instance(opaPolicyService)
    );

    afterEach(() => {
        reset(validator);
        reset(auditDatasource);
        resetCalls(auditDatasource);
        reset(opaPolicyService);
        resetCalls(opaPolicyService);
        reset(ddb);
    });

    test('should not create target when violate opa policy', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'NON_COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
        // when(ddb.createObject(deepEqual(TEST_OBJECT_1), deepEqual(DEFAULT_REQUESTOR))).thenResolve(TEST_OBJECT_1);
        const result = await objectUnderTest.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
        verify(ddb.createObject(anything(), anything())).never();
    });
    test('should create rule target', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.getObjectBy(deepEqual(TEST_OBJECT_1.id))).thenResolve(undefined);
        when(
            ddb.createObject(deepEqual(TEST_OBJECT_1), deepEqual(DEFAULT_REQUESTOR))
        ).thenResolve(TEST_OBJECT_1);
        const result = await objectUnderTest.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(201);
    });

    test('should return 409 when request duplicated id', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.getObjectBy(anything())).thenResolve(TEST_OBJECT_1);

        const result = await objectUnderTest.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(
            ddb.createObject(deepEqual(TEST_OBJECT_1), deepEqual(DEFAULT_REQUESTOR))
        ).never();
        expect(result.statusCode).toBe(409);
    });

    test('should return error when db access failed', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.getObjectBy(deepEqual(TEST_OBJECT_1.id))).thenResolve(undefined);
        when(ddb.createObject(anything(), anyString())).thenReject(
            new Error('insert failed')
        );
        const result = await objectUnderTest.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(500);
    });

    test('should not create object and return error opa cluster remote error', async () => {
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenReject(new Error('opa cluster error'));
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);

        const result = await objectUnderTest.handle(
            ({
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        verify(ddb.createObject(anything(), anything())).never();
        expect(result.statusCode).toBe(500);
    });
});
