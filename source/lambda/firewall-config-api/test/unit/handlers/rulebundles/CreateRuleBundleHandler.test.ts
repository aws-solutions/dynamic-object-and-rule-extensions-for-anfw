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
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { CreateRuleBundleHandler } from 'src/handlers/rulebundles/CreateRuleBundleHandler';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { CreateRuleBundleInputValidator } from 'src/validators/CreateRuleBundleInputValidator';
import {
    anything,
    capture,
    deepEqual,
    instance,
    mock,
    reset,
    verify,
    when,
} from 'ts-mockito';

describe('CreateRuleConfigHandler handler tests', () => {
    const ddb = mock(RuleBundleDataSourceService);
    const validator = mock(CreateRuleBundleInputValidator);
    const config = { defaultAggregatorName: 'default-aggregator' } as AppConfiguration;
    const handler = new CreateRuleBundleHandler(
        new StaticLoggerFactory(),
        instance(ddb),
        instance(validator),
        config
    );

    beforeEach(() => {
        reset(ddb);
    });
    test('should create rule bundle', async () => {
        const DEFAULT_RULEGROUP = {
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.createRuleBundle(deepEqual(DEFAULT_RULEGROUP))).thenResolve('newId');
        const result = await handler.handle(
            ({} as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(201);
    });

    test('should return 409 when group already exists', async () => {
        const DEFAULT_RULEGROUP: FlowRuleBundle = {
            id: '1',
            version: 0,
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.getRuleBundleBy(deepEqual('1'))).thenResolve(DEFAULT_RULEGROUP);

        const result = await handler.handle(
            ({} as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        verify(ddb.createRuleBundle(anything())).never();
        expect(result.statusCode).toBe(409);
        expect(JSON.parse(result.body).error).toBe(
            'Error while creating rule bundle, 1 already exists'
        );
    });

    test('should create rule bundle with default aggregator', async () => {
        const DEFAULT_RULEGROUP = {
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.createRuleBundle(anything())).thenResolve('newId');

        const result = await handler.handle(
            ({} as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(ddb.createRuleBundle);

        const [savedGroup] = captured.last();
        expect(savedGroup.aggregatorName).toBe('default-aggregator');
        expect(result.statusCode).toBe(201);
    });

    test('should return error when db access failed', async () => {
        const DEFAULT_RULEGROUP = {
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);
        when(ddb.createRuleBundle(deepEqual(DEFAULT_RULEGROUP))).thenReject(
            new Error('transaction failed')
        );
        const result = await handler.handle(
            ({} as unknown) as APIGatewayProxyEvent,
            {} as Context
        );
        expect(result.statusCode).toBe(503);
    });

    test('should not save extra field', async () => {
        const DEFAULT_RULEGROUP = {
            extraField: 'bla',
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        };
        when(validator.parseAndValidate(anything())).thenResolve(DEFAULT_RULEGROUP);

        const result = await handler.handle(
            ({} as unknown) as APIGatewayProxyEvent,
            {} as Context
        );

        const captured = capture(ddb.createRuleBundle);

        const [savedGroup] = captured.last();
        expect(savedGroup).toEqual({
            aggregatorName: 'aggregator',
            description: 'default rule',
            ownerGroup: ['admin', 'user'],
            ruleGroupArn: 'arn',
        });
        expect(result.statusCode).toBe(201);
    });
});
