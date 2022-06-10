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
    ConfigServiceClient,
    DescribeConfigurationAggregatorsCommandOutput,
} from '@aws-sdk/client-config-service';
import { APIGatewayProxyEvent } from 'aws-lambda';
import 'reflect-metadata';
import { ObjectDefinitionResolver, StaticLoggerFactory } from 'shared_types';
import { FlowObjectInput } from 'src/types/FlowTarget';
import { CreateObjectInputValidator } from 'src/validators/CreateObjectInputValidator';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';

const createGWEvent = (body: Record<string, unknown>) =>
    ({ body: JSON.stringify(body) } as APIGatewayProxyEvent);
const TEST_OBJECT_INPUT: FlowObjectInput = {
    id: 'Onprem_Server',
    type: 'Arn',
    value: 'invalidValue',
};

const TEST_OBJECT_EC2_ARN_INPUT: FlowObjectInput = {
    id: 'Ec2_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:1000:instance/i-0edaf8fbe9d9fe5db',
};

const TEST_OBJECT_TAGGED_INPUT: FlowObjectInput = {
    id: 'Ec2_Arn',
    type: 'Tagged',
    value: '',
};
describe('Test CreateTargetInputValidator', () => {
    const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
    const objectDefinitionResolver = mock(ObjectDefinitionResolver);

    let objectUnderTest: CreateObjectInputValidator;

    beforeEach(() => {
        reset(awsConfigClient);
        reset(objectDefinitionResolver);
        when(awsConfigClient.send(anything())).thenResolve({
            $metadata: { httpStatusCode: 200 },
        } as DescribeConfigurationAggregatorsCommandOutput);
        when(objectDefinitionResolver.resolveTarget(anything())).thenResolve({
            ...TEST_OBJECT_EC2_ARN_INPUT,
            addresses: ['10.0.0.0/32'],
        });
        const logFactory = new StaticLoggerFactory();

        objectUnderTest = new CreateObjectInputValidator(
            logFactory,
            instance(objectDefinitionResolver)
        );
    });

    const tests = [
        // ec2
        [TEST_OBJECT_EC2_ARN_INPUT],
        // // sg
        [
            {
                ...TEST_OBJECT_INPUT,
                value:
                    'arn:aws:ec2:ap-southeast-2:1000:security-group/sg-04990f6f47563a65f',
            },
        ],
        // asg
        [
            {
                ...TEST_OBJECT_INPUT,
                value:
                    'arn:aws:autoscaling:ap-southeast-2:2000:autoScalingGroup:418f69ae-24d0-449c-8fbb-64f34c34e06b:autoScalingGroupName/asg-tmp-test',
            },
        ],
        // subnet
        [
            {
                ...TEST_OBJECT_INPUT,
                value: 'arn:aws:ec2:ap-southeast-2:2000:subnet/subnet-0290eedfd4a706c55',
            },
        ],
        // vpc
        [
            {
                ...TEST_OBJECT_INPUT,
                value: 'arn:aws:ec2:ap-southeast-2:2000:vpc/vpc-0c315768612ee4eb1',
            },
        ],
        // tags
        [
            {
                ...TEST_OBJECT_INPUT,
                type: 'Tagged',
                value: [
                    {
                        value: '1',
                        key: 'FF_TEST',
                    },
                ],
            } as FlowObjectInput,
        ],
        // lambda
        [
            {
                ...TEST_OBJECT_INPUT,
                type: 'Lambda',
                value: [
                    {
                        value: '1',
                        key: 'FF_TEST',
                    },
                ],
            } as FlowObjectInput,
        ],
    ];

    test.each(tests)('Should pass with input %j', async (inputObject) => {
        const inputEvent = createGWEvent(inputObject);
        const result: FlowObjectInput = await objectUnderTest.parseAndValidate(
            inputEvent
        );
        expect(result).toEqual(inputObject);
    });

    // https://sim.amazon.com/issues/SBAPJ-131
    test('allow reference to target even tag not exists', async () => {
        when(objectDefinitionResolver.resolveTarget(anything())).thenResolve({
            ...TEST_OBJECT_EC2_ARN_INPUT,
            addresses: ['10.0.0.0/32'],
        });
        const inputEvent = createGWEvent({
            ...TEST_OBJECT_TAGGED_INPUT,
            ...{
                value: [
                    {
                        value: '1',
                        key: 'FF_TEST',
                    },
                ],
            },
        });

        const result: FlowObjectInput = await objectUnderTest.parseAndValidate(
            inputEvent
        );

        verify(objectDefinitionResolver.resolveTarget(anything())).never();
        expect(result).toBeDefined();
    });

    test('throw error if empty body', async () => {
        await expect(
            objectUnderTest.parseAndValidate({} as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        expect(objectUnderTest.errors).toEqual(['Request body cannot be null or empty.']);
    });

    test('throw error if invalid json input', async () => {
        await expect(
            objectUnderTest.parseAndValidate({ body: 'notjson' } as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        // expect(objectUnderTest.errors.length).toBe(2);
        expect(objectUnderTest.errors).toEqual(['Request body contains invalid JSON.']);
    });

    test('should raise error if number of tags are too large', async () => {
        type TagValuePair = { key: string; value: string };
        const eleven_tags_pair: TagValuePair[] = new Array(11).fill({
            value: '1',
            key: 'FF_TEST',
        });

        const tooManyTags = {
            ...TEST_OBJECT_INPUT,
            type: 'Lambda',
            value: eleven_tags_pair,
        } as FlowObjectInput;
        await expect(
            objectUnderTest.parseAndValidate({
                body: JSON.stringify(tooManyTags),
            } as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        expect(objectUnderTest.errors).toEqual([
            'Tag value exceeded max allowed number, max pair 10',
        ]);
    });

    test('should raise error if not support id too long', async () => {
        const idwith101Chars = 'a'.repeat(101);

        const invalidArn = { ...TEST_OBJECT_EC2_ARN_INPUT, ...{ id: idwith101Chars } };
        await expect(
            objectUnderTest.parseAndValidate({
                body: JSON.stringify(invalidArn),
            } as APIGatewayProxyEvent)
        ).rejects.toBeDefined();
        expect(objectUnderTest.errors).toEqual([
            'id cannot be null or empty and should be matching /^[:0-9a-zA-Z_-]{1,100}$/',
        ]);
    });

    describe('arn based types ', () => {
        test('arn, should raise error if not valid arn', async () => {
            const invalidArn = { ...TEST_OBJECT_EC2_ARN_INPUT, value: 'not_arn' };
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidArn),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors).toEqual([
                'Invalid target : not_arn is not a valid arn.',
            ]);
        });

        test('should raise error if not support arn type [EC2,AGS, SG, VPC,SUBNET]', async () => {
            //ELB
            const invalidArn = {
                ...TEST_OBJECT_EC2_ARN_INPUT,
                value:
                    'arn:aws:elasticloadbalancing:ap-southeast-2:2000:loadbalancer/app/ingress/4ec2f3adfbc1dc57',
            };
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidArn),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors).toEqual([
                'Invalid target : elasticloadbalancing is not a supported arn type.',
            ]);
        });
    });

    describe('tag based types ', () => {
        test('tag, should raise error if not valid tag value', async () => {
            const invalidArn = { ...TEST_OBJECT_TAGGED_INPUT, value: 'not map' };
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidArn),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors).toEqual([
                'Invalid target : not map is not a list',
            ]);
            verify(objectDefinitionResolver.resolveTarget(anything())).never();
        });

        test('tag, should raise error if contains empty value in tag pair', async () => {
            const invalidTagPair = {
                ...TEST_OBJECT_TAGGED_INPUT,
                value: [{ key: '', value: 'val' }],
            };
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidTagPair),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors).toEqual([
                'Invalid target : contains empty string',
            ]);
            verify(objectDefinitionResolver.resolveTarget(anything())).never();
        });
    });

    describe('common resolver ', () => {
        test('should pass through the resolver exception', async () => {
            const invalidArn = { ...TEST_OBJECT_EC2_ARN_INPUT };
            when(objectDefinitionResolver.resolveTarget(anything())).thenReject(
                new Error('resolver error')
            );
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidArn),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors).toEqual(
                expect.arrayContaining([new Error('resolver error')])
            );
        });

        test('should return error if no IP addresses can be resolved', async () => {
            const invalidArn = { ...TEST_OBJECT_EC2_ARN_INPUT };
            when(objectDefinitionResolver.resolveTarget(anything())).thenResolve({
                ...TEST_OBJECT_EC2_ARN_INPUT,
                addresses: [],
            });
            await expect(
                objectUnderTest.parseAndValidate({
                    body: JSON.stringify(invalidArn),
                } as APIGatewayProxyEvent)
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors).toEqual(
                expect.arrayContaining(['can not resolve target to IP addresses'])
            );
        });
    });
});
