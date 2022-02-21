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
import { UpdateObjectHandler } from 'src/handlers/objects/UpdateObjectHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { CreateObjectInputValidator } from 'src/validators/CreateObjectInputValidator';
import { anything, deepEqual, instance, mock, reset, verify, when } from 'ts-mockito';

const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const DEFAULT_REQUESTOR = 'userArn';
const DEFAULT_REQUEST_CONTEXT = {
    requestContext: {
        identity: { userArn: DEFAULT_REQUESTOR },
    },
};
describe('UpdateObjectHandler handler tests', () => {
    const ddb = mock(ObjectsDataSourceService);
    const validator = mock(CreateObjectInputValidator);
    const auditsDataSourceService = mock(AuditsDataSourceService);
    const opaPolicyService = mock(OpaPolicyService);
    const handler = new UpdateObjectHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(auditsDataSourceService),
        instance(validator),
        instance(opaPolicyService)
    );

    beforeEach(() => {
        reset(ddb);
        reset(opaPolicyService);
        reset(auditsDataSourceService);
        reset(validator);
        when(
            opaPolicyService.requestDecision(anything(), anything(), anything())
        ).thenResolve({
            status: 'COMPLIANT',
            timestamp: 123123,
            reasonPhrases: [],
        });
    });

    test('should update rule object', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.updateObject(deepEqual(TEST_OBJECT_1))).thenReturn();
        when(ddb.getObjectBy(deepEqual(TEST_OBJECT_1.id))).thenResolve(TEST_OBJECT_1);
        const result = await handler.handle(
            ({
                ...DEFAULT_REQUEST_CONTEXT,
                pathParameters: { id: 'Onprem_Server' },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        expect(result.statusCode).toBe(200);
    });

    test('should return error when id not match', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.updateObject(deepEqual(TEST_OBJECT_1))).thenReturn();
        const result = await handler.handle(
            ({
                ...DEFAULT_REQUEST_CONTEXT,
                pathParameters: { id: 'id1' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
    });

    test('should return error when path parameters missing', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.updateObject(deepEqual(TEST_OBJECT_1))).thenReturn();
        const result = await handler.handle(
            ({
                requestContext: {},
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
    });

    test('should return error when id not exists', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.getObjectBy(deepEqual(TEST_OBJECT_1.id))).thenResolve(undefined);
        when(ddb.updateObject(deepEqual(TEST_OBJECT_1))).thenReturn();
        const result = await handler.handle(
            ({
                ...DEFAULT_REQUEST_CONTEXT,
                pathParameters: { id: 'Onprem_Server' },
                requestContext: {
                    identity: { userArn: DEFAULT_REQUESTOR },
                },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        expect(result.statusCode).toBe(404);
    });

    test('should return error when id missing from path', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.updateObject(deepEqual(TEST_OBJECT_1))).thenReturn();
        const result = await handler.handle(
            ({
                ...DEFAULT_REQUEST_CONTEXT,
                pathParameters: {},
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
    });

    test('should return error when db access failed', async () => {
        when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
        when(ddb.getObjectBy(deepEqual(TEST_OBJECT_1.id))).thenResolve(TEST_OBJECT_1);
        when(
            ddb.updateObject(
                deepEqual({
                    id: TEST_OBJECT_1.id,
                    type: TEST_OBJECT_1.type,
                    value: TEST_OBJECT_1.value,
                })
            )
        ).thenReject(new Error('ddb failed'));
        const result = await handler.handle(
            ({
                ...DEFAULT_REQUEST_CONTEXT,
                pathParameters: { id: 'Onprem_Server' },
            } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(500);
    });

    describe('opa evaluation', () => {
        test('should not create object and return error opa cluster remote error', async () => {
            when(
                opaPolicyService.requestDecision(anything(), anything(), anything())
            ).thenReject(new Error('opa cluster error'));
            when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);

            const result = await handler.handle(
                ({
                    ...DEFAULT_REQUEST_CONTEXT,
                    pathParameters: { id: 'Onprem_Server' },
                    requestContext: {
                        identity: { userArn: DEFAULT_REQUESTOR },
                    },
                } as unknown) as APIGatewayProxyEvent,
                {} as Context
            );
            verify(ddb.updateObject(anything())).never();
            expect(result.statusCode).toBe(500);
        });

        test('should not update object when violate opa policy', async () => {
            when(validator.parseAndValidate(anything())).thenResolve(TEST_OBJECT_1);
            when(
                opaPolicyService.requestDecision(anything(), anything(), anything())
            ).thenResolve({
                status: 'NON_COMPLIANT',
                timestamp: 123123,
                reasonPhrases: [],
            });
            // when(ddb.createObject(deepEqual(TEST_OBJECT_1), deepEqual(DEFAULT_REQUESTOR))).thenResolve(TEST_OBJECT_1);
            const result = await handler.handle(
                ({
                    ...DEFAULT_REQUEST_CONTEXT,
                    pathParameters: { id: 'Onprem_Server' },
                    requestContext: {
                        identity: { userArn: DEFAULT_REQUESTOR },
                    },
                } as unknown) as APIGatewayProxyEvent,
                {} as Context
            );
            expect(result.statusCode).toBe(400);
            verify(ddb.updateObject(anything())).never();
        });
    });
});
