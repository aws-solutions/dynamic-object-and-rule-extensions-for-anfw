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
import { FlowObject, FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import { GetObjectHandler } from 'src/handlers/objects/GetObjectHandler';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { instance, mock, when } from 'ts-mockito';

const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
describe('GetObjectHandler handler tests', () => {
    const ddb = mock(ObjectsDataSourceService);
    const handler = new GetObjectHandler(new StaticLoggerFactory(), instance(ddb));

    test('returns 400 if path parameter is undefined', async () => {
        // act
        const result = await handler.handle({} as APIGatewayProxyEvent, {} as Context);

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('returns 400 if no id parameter provided', async () => {
        // act
        const result = await handler.handle(
            ({ pathParameters: { random: 123 } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
    });

    test('return 200 with rulegroup', async () => {
        // arrange
        when(ddb.getObjectBy('1234')).thenResolve(TEST_OBJECT_1);

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(200);
        const attestation = <FlowRuleBundle>JSON.parse(result.body);
        expect(attestation).not.toBeUndefined();
    });

    test('return 404 if rulegroup not found', async () => {
        // arrange
        when(ddb.getObjectBy('1234')).thenResolve(undefined);

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(404);
    });
});
