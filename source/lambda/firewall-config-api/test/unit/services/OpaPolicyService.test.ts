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
import { HttpResponse } from '@aws-sdk/types';
import 'reflect-metadata';
import { ApjsbAwsHttpClient, FlowObject, StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { RoleChecker } from 'src/common/RoleChecker';
import RuleConfigError from 'src/common/RuleConfigError';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
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

const EXAMPLE_OPA_NON_COMPLIANT = {
    decision_id: '8344fb08-dffa-4f4e-9295-0556e32ce4a6',
    provenance: {
        version: '0.26.0',
        build_commit: '62d3900',
        build_timestamp: '2021-01-20T18:55:07Z',
        build_hostname: 'a5a1a13c38c4',
        bundles: {
            policy: {
                revision: '',
            },
        },
    },
    result: {
        missingResults: [],
        packages: [
            {
                packageId: 'objects',
                version: '0.0.1',
            },
        ],
        policies: ['objects/forbidden_cross_object_reference'],
        responses: [
            {
                decisionContext: {},
                level: 'mandatory',
                msg:
                    'forbidden_cross_object_reference check failed, requester from account 111122223333 is attempting to reference object in: [1000]',
                packageId: 'objects',
                parameters: {},
                policyId: 'forbidden_cross_object_reference',
                status: 'fail',
            },
        ],
        status: 'fail',
    },
};
const TEST_OBJECT_1: FlowObject = {
    createdBy: 'bla',
    lastUpdated: new Date().toISOString(),
    id: 'Onprem_Server',
    type: 'Address',
    value: '172.16.1.20',
};
const EXAMPLE_OPA_COMPLIANT = {
    decision_id: '51cada46-951d-4b69-8545-f9616ce5ce12',
    provenance: {
        version: '0.26.0',
        build_commit: '62d3900',
        build_timestamp: '2021-01-20T18:55:07Z',
        build_hostname: 'a5a1a13c38c4',
        bundles: {
            policy: {
                revision: '',
            },
        },
    },
    result: {
        missingResults: [],
        packages: [
            {
                packageId: 'objects',
                version: '0.0.1',
            },
        ],
        policies: ['objects/forbidden_cross_object_reference'],
        responses: [
            {
                decisionContext: {},
                level: 'mandatory',
                msg: '',
                packageId: 'objects',
                parameters: {},
                policyId: 'forbidden_cross_object_reference',
                status: 'pass',
            },
        ],
        status: 'pass',
    },
};

const EXAMPLE_OPA_COMPLIANT_WITH_UNKNOWN_REASON = {
    decision_id: '51cada46-951d-4b69-8545-f9616ce5ce12',
    provenance: {
        version: '0.26.0',
        build_commit: '62d3900',
        build_timestamp: '2021-01-20T18:55:07Z',
        build_hostname: 'a5a1a13c38c4',
        bundles: {
            policy: {
                revision: '',
            },
        },
    },
    result: {
        missingResults: [],
        packages: [
            {
                packageId: 'objects',
                version: '0.0.1',
            },
        ],
        policies: ['objects/forbidden_cross_object_reference'],
        responses: [
            {
                decisionContext: {},
                level: 'mandatory',
                msg: '',
                packageId: 'objects',
                parameters: {},
                policyId: 'forbidden_cross_object_reference',
                status: 'unknown',
            },
        ],
        status: 'pass',
    },
};
const DEFAULT_ARN = 'arn:xxx';
const DEFAULT_ACCOUNT = '123';
describe('Test OpaPolicyService', () => {
    const client: ApjsbAwsHttpClient = mock(ApjsbAwsHttpClient);
    const checker: RoleChecker = mock(RoleChecker);
    const opaUrl = 'http://localhost';

    let objectUnderTest: OpaPolicyService;
    beforeEach(() => {
        reset(client);
        reset(checker);
        when(client.post(anything(), anything(), anything())).thenReturn(
            Promise.resolve({ statusCode: 200, body: '' } as HttpResponse)
        );

        objectUnderTest = new OpaPolicyService(
            new StaticLoggerFactory(),
            { opaURL: opaUrl } as AppConfiguration,
            instance(client),
            instance(checker)
        );
    });
    test('should return decision compliant when opa configure to false', async () => {
        objectUnderTest = new OpaPolicyService(
            new StaticLoggerFactory(),
            { opaURL: undefined } as AppConfiguration,
            instance(client),
            instance(checker)
        );

        const result = await objectUnderTest.requestDecision(
            {
                requester: {
                    accountId: DEFAULT_ACCOUNT,
                    arn: DEFAULT_ARN,
                    role: 'admin',
                },
            },
            { object: TEST_OBJECT_1 },
            'CREATE'
        );

        verify(client.post(anyString(), anyString(), anything())).never();
        expect(result.status).toBe('COMPLIANT');
    });

    test('should return decision non compliant', async () => {
        when(checker.isAdmin(deepEqual(DEFAULT_ARN), deepEqual(DEFAULT_ACCOUNT)));

        const httpResponse: HttpResponse = {
            headers: {},
            statusCode: 200,
            body: JSON.stringify(EXAMPLE_OPA_NON_COMPLIANT),
        };
        when(client.post(anyString(), anyString(), anything())).thenResolve(httpResponse);
        const result = await objectUnderTest.requestDecision(
            {
                requester: {
                    accountId: DEFAULT_ACCOUNT,
                    arn: DEFAULT_ARN,
                    role: 'admin',
                },
            },
            { object: TEST_OBJECT_1 },
            'CREATE'
        );
        expect(result.status).toBe('NON_COMPLIANT');
    });

    test('should return decision compliant', async () => {
        when(checker.isAdmin(deepEqual(DEFAULT_ARN), deepEqual(DEFAULT_ACCOUNT)));

        const httpResponse: HttpResponse = {
            headers: {},
            statusCode: 200,
            body: JSON.stringify(EXAMPLE_OPA_COMPLIANT),
        };
        when(client.post(anyString(), anyString(), anything())).thenResolve(httpResponse);
        const result = await objectUnderTest.requestDecision(
            {
                requester: {
                    accountId: DEFAULT_ACCOUNT,
                    arn: DEFAULT_ARN,
                    role: 'admin',
                },
            },
            { object: TEST_OBJECT_1 },
            'CREATE'
        );
        expect(result.status).toBe('COMPLIANT');
    });

    test('should return parse reason phrase unknown', async () => {
        when(checker.isAdmin(deepEqual(DEFAULT_ARN), deepEqual(DEFAULT_ACCOUNT)));

        const httpResponse: HttpResponse = {
            headers: {},
            statusCode: 200,
            body: JSON.stringify(EXAMPLE_OPA_COMPLIANT_WITH_UNKNOWN_REASON),
        };
        when(client.post(anyString(), anyString(), anything())).thenResolve(httpResponse);
        const result = await objectUnderTest.requestDecision(
            {
                requester: {
                    accountId: DEFAULT_ACCOUNT,
                    arn: DEFAULT_ARN,
                    role: 'admin',
                },
            },
            { object: TEST_OBJECT_1 },
            'CREATE'
        );
        expect(result.status).toBe('COMPLIANT');
    });

    test('should throw exception when remote response not a json', async () => {
        when(checker.isAdmin(deepEqual(DEFAULT_ARN), deepEqual(DEFAULT_ACCOUNT)));

        const httpResponse: HttpResponse = {
            headers: {},
            statusCode: 200,
            body: 'not json',
        };
        when(client.post(anyString(), anyString(), anything())).thenResolve(httpResponse);
        await expect(
            objectUnderTest.requestDecision(
                {
                    requester: {
                        accountId: DEFAULT_ACCOUNT,
                        arn: DEFAULT_ARN,
                        role: 'admin',
                    },
                },
                { object: TEST_OBJECT_1 },
                'CREATE'
            )
        ).rejects.toEqual(
            new RuleConfigError(
                `Invalid input - request/response is not a valid json not json`,
                503
            )
        );
    });

    test('should raise exception when opa remote error response', async () => {
        when(checker.isAdmin(deepEqual(DEFAULT_ARN), deepEqual(DEFAULT_ACCOUNT)));

        const httpResponse: HttpResponse = {
            headers: {},
            statusCode: 503,
            body: JSON.stringify({}),
        };
        when(client.post(anyString(), anyString(), anything())).thenResolve(httpResponse);
        await expect(
            objectUnderTest.requestDecision(
                {
                    requester: {
                        accountId: DEFAULT_ACCOUNT,
                        arn: DEFAULT_ARN,
                        role: 'admin',
                    },
                },
                { object: TEST_OBJECT_1 },
                'CREATE'
            )
        ).rejects.toEqual(
            new RuleConfigError('Encounter error calling OPA cluster', 503, false)
        );
    });
});
