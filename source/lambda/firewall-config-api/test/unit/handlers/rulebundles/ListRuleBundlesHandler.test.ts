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
import {
    APIGatewayEventIdentity,
    APIGatewayProxyEvent,
    APIGatewayProxyEventPathParameters,
    Context,
} from 'aws-lambda';
import 'reflect-metadata';
import { FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import { ListRuleBundlesHandler } from 'src/handlers/rulebundles/ListRuleBundlesHandler';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { anything, capture, instance, mock, when } from 'ts-mockito';

const DEFAULT_RULE_GROUP: FlowRuleBundle = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
    version: 1,
    description: 'test',
    ownerGroup: ['admin'],
};

const DEFAULT_REQUESTOR =
    'arn:aws:sts::2000:assumed-role/PreDefined_FF_ROLE/session-name';

const DEFAULT_RULE_GROUP_2: FlowRuleBundle = {
    id: 'rule-group-02',
    ruleGroupArn: 'arn',
    version: 1,
    description: 'test',
    ownerGroup: ['admin'],
};
const SAMPLE_REQUEST = {
    queryStringParameters: {
        limit: '2',
        nextToken: 'bla-123',
    } as APIGatewayProxyEventPathParameters,
    requestContext: {
        identity: { userArn: DEFAULT_REQUESTOR },
        accountId: '1000',
    },
} as APIGatewayProxyEvent;

const SAMPLE_REQUEST_EMPTY_PARAMETERS = {
    queryStringParameters: {} as APIGatewayProxyEventPathParameters,
    requestContext: {
        identity: { userArn: DEFAULT_REQUESTOR },
        accountId: '1000',
    },
} as APIGatewayProxyEvent;

describe('ListRuleGroupsHandler handler tests', () => {
    const mockdb = mock(RuleBundleDataSourceService);
    const handler = new ListRuleBundlesHandler(
        new StaticLoggerFactory(),
        instance(mockdb)
    );

    test('no parameter', async () => {
        const expected = {
            results: [DEFAULT_RULE_GROUP, DEFAULT_RULE_GROUP_2],
            nextToken: '',
        };
        when(mockdb.getRuleBundles(anything(), anything(), anything())).thenResolve(
            expected
        );

        const response = await handler.handle(
            SAMPLE_REQUEST_EMPTY_PARAMETERS,
            {} as Context
        );

        const captured = capture(mockdb.getRuleBundles);

        const [limit, token] = captured.last();
        // DEFAULT limit applies
        expect(limit).toEqual(100);
        expect(token).toBeUndefined();

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });

    test('with limit and token', async () => {
        const expected = {
            results: [DEFAULT_RULE_GROUP, DEFAULT_RULE_GROUP_2],
            nextToken: 'bla',
        };
        when(mockdb.getRuleBundles(anything(), anything(), anything())).thenResolve(
            expected
        );

        const response = await handler.handle(SAMPLE_REQUEST, {} as Context);
        const captured = capture(mockdb.getRuleBundles);

        const [limit, token] = captured.last();
        expect(limit).toEqual(2);
        expect(token).toEqual('bla-123');

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });

    test('passing correct assumed role', async () => {
        const expected = {
            results: [DEFAULT_RULE_GROUP, DEFAULT_RULE_GROUP_2],
            nextToken: 'bla',
        };
        when(mockdb.getRuleBundles(anything(), anything(), anything())).thenResolve(
            expected
        );

        const response = await handler.handle(
            {
                ...SAMPLE_REQUEST,
                requestContext: {
                    identity: {
                        userArn:
                            'arn:aws:sts::2000:assumed-role/PreDefined_FF_ROLE/session-name',
                    } as APIGatewayEventIdentity,
                    accountId: '10000',
                },
            } as APIGatewayProxyEvent,
            {} as Context
        );
        const captured = capture(mockdb.getRuleBundles);

        const [limit, token, role] = captured.last();
        expect(limit).toEqual(2);
        expect(token).toEqual('bla-123');
        expect(role).toEqual('arn:aws:iam::10000:role/PreDefined_FF_ROLE');

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });
});
