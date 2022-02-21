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
    APIGatewayProxyEvent,
    APIGatewayProxyEventPathParameters,
    Context,
} from 'aws-lambda';
import 'reflect-metadata';
import { FlowAudit, FlowObject, StaticLoggerFactory } from 'shared_types';
import { ListAuditsHandler } from 'src/handlers/audits/ListAuditsHandler';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { anything, capture, instance, mock, when } from 'ts-mockito';

const SAMPLE_REQUEST = {
    queryStringParameters: {
        limit: '2',
        nextToken: 'bla-123',
    } as APIGatewayProxyEventPathParameters,
} as APIGatewayProxyEvent;

const SAMPLE_REQUEST_EMPTY_PARAMETERS = {
    queryStringParameters: {} as APIGatewayProxyEventPathParameters,
} as APIGatewayProxyEvent;
const TEST_OBJECT_1: FlowObject = {
    id: 'Onprem_Server',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const TEST_OBJECT_2: FlowObject = {
    id: 'Onprem_Server_2',
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    type: 'Address',
    value: '172.16.1.20',
};
const TEST_AUDIT_1: FlowAudit = {
    id: 'audit-1',
    requestedBy: 'bla',
    requestedTimestamp: new Date().toISOString(),
    requestedChange: {
        type: 'CREATE',
        changeContent: {
            requestedObject: TEST_OBJECT_1,
        },
        changeResult: 'SUCCESS',

        reasonPhrase: [],
    },
};
const TEST_AUDIT_2: FlowAudit = {
    id: 'audit-2',
    requestedBy: 'bla',
    requestedTimestamp: new Date().toISOString(),
    requestedChange: {
        type: 'CREATE',
        changeContent: {
            requestedObject: TEST_OBJECT_2,
        },
        changeResult: 'SUCCESS',

        reasonPhrase: [],
    },
};

describe('ListAuditsHandler handler tests', () => {
    const mockdb = mock(AuditsDataSourceService);
    const handler = new ListAuditsHandler(new StaticLoggerFactory(), instance(mockdb));

    test('no parameter', async () => {
        const expected = { results: [TEST_AUDIT_1, TEST_AUDIT_2], nextToken: '' };
        when(mockdb.getAudits(anything(), anything())).thenResolve(expected);

        const response = await handler.handle(
            SAMPLE_REQUEST_EMPTY_PARAMETERS,
            {} as Context
        );

        const captured = capture(mockdb.getAudits);

        const [limit, token] = captured.last();
        // DEFAULT limit applies
        expect(limit).toEqual(100);
        expect(token).toBeUndefined();

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });

    test('with limit and token', async () => {
        const expected = { results: [TEST_AUDIT_1, TEST_AUDIT_2], nextToken: 'bla' };
        when(mockdb.getAudits(anything(), anything())).thenResolve(expected);

        const response = await handler.handle(SAMPLE_REQUEST, {} as Context);
        const captured = capture(mockdb.getAudits);

        const [limit, token] = captured.last();
        expect(limit).toEqual(2);
        expect(token).toEqual('bla-123');

        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });

    test('with limit not a number', async () => {
        const expected = { results: [TEST_AUDIT_1, TEST_AUDIT_2], nextToken: 'bla' };
        when(mockdb.getAudits(anything(), anything())).thenResolve(expected);
        const INVALID_REQUEST = {
            queryStringParameters: {
                limit: 'bla',
                nextToken: 'bla-123',
            } as APIGatewayProxyEventPathParameters,
        } as APIGatewayProxyEvent;
        const response = await handler.handle(INVALID_REQUEST, {} as Context);
        const captured = capture(mockdb.getAudits);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [limit, _] = captured.last();
        expect(limit).toEqual(100);
        expect(response.statusCode).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(expected);
    });
});
