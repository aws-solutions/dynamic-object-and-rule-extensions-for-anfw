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
import { StaticLoggerFactory } from 'shared_types';
import { UpdateRuleBundleHandler } from 'src/handlers/rulebundles/UpdateRuleBundleHandler';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { UpdateRuleBundleInputValidator } from 'src/validators/UpdateRuleBundleInputValidator';
import { anything, deepEqual, instance, mock, when } from 'ts-mockito';

describe('CreateRuleConfigHandler handler tests', () => {
    const ddb = mock(RuleBundleDataSourceService);
    const validator = mock(UpdateRuleBundleInputValidator);
    const handler = new UpdateRuleBundleHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(validator)
    );

    test('should update rule group', async () => {
        const DEFAULT_RULEGROUP = {
            id: 'id',
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.updateRuleBundle(deepEqual(DEFAULT_RULEGROUP))).thenReturn();
        const result = await handler.handle(
            ({ pathParameters: { id: 'id' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(200);
    });

    test('should return error when id not match', async () => {
        const DEFAULT_RULEGROUP = {
            id: 'id',
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.updateRuleBundle(deepEqual(DEFAULT_RULEGROUP))).thenReturn();
        const result = await handler.handle(
            ({ pathParameters: { id: 'id1' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
    });

    test('should return error when id not present in path', async () => {
        const result = await handler.handle(
            ({ pathParameters: {} } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(400);
    });

    test('should return error when db access failed', async () => {
        const DEFAULT_RULEGROUP = {
            id: 'id',
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.updateRuleBundle(deepEqual(DEFAULT_RULEGROUP))).thenReject(
            new Error('transaction failed')
        );
        const result = await handler.handle(
            ({ pathParameters: { id: 'id' } } as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(503);
    });
});
