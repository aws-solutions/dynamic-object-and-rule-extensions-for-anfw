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
import { DeleteRuleConfigHandler } from 'src/handlers/rulebundles/DeleteRuleBundleHandler';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { instance, mock, when } from 'ts-mockito';

describe('DeleteRuleConfigHandler handler tests', () => {
    const ddb = mock(RuleBundleDataSourceService);
    const handler = new DeleteRuleConfigHandler(new StaticLoggerFactory(), instance(ddb));

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

    test('can only delete if no rules reference to it', async () => {
        // arrange
        when(ddb.getRulesBy('1234')).thenResolve([]);

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(200);
    });

    test('can not delete if rules reference to it', async () => {
        // arrange
        when(ddb.getRulesBy('1234')).thenResolve([{ id: 'rule-id' } as FlowRule]);

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({
            message: '1234 was not able to be deleted as it referenced by active rules',
            rulesId: ['rule-id'],
        });
    });

    test('return error if ddb access error', async () => {
        // arrange
        when(ddb.getRulesBy('1234')).thenResolve([]);
        when(ddb.deleteRuleBundle('1234')).thenReject(new Error('transaction error'));

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({
            message: '1234 was not able to be deleted',
        });
    });
});
