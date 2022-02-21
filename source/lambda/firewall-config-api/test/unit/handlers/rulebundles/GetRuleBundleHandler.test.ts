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
import { FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import { GetRuleConfigHandler } from 'src/handlers/rulebundles/GetRuleBundleHandler';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { instance, mock, when } from 'ts-mockito';

const DEFAULT_RULE_GROUP: FlowRuleBundle = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
    version: 1,
    description: 'test',
    ownerGroup: ['admin'],
};

describe('GetRuleGroupHandler handler tests', () => {
    const ddb = mock(RuleBundleDataSourceService);
    const handler = new GetRuleConfigHandler(new StaticLoggerFactory(), instance(ddb));

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
        when(ddb.getRuleBundleBy('1234')).thenResolve(DEFAULT_RULE_GROUP);

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
        when(ddb.getRuleBundleBy('1234')).thenResolve(undefined);

        // act
        const result = await handler.handle(
            ({ pathParameters: { id: '1234' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(result.statusCode).toBe(404);
    });
});
