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
import { APIGatewayProxyEvent } from 'aws-lambda';
import 'reflect-metadata';
import { FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import RuleConfigError from 'src/common/RuleConfigError';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { FlowRuleInput } from 'src/types/FlowRule';
import { FlowObjectInput } from 'src/types/FlowTarget';
import { CreateRuleInputValidator } from 'src/validators/CreateRuletInputValidator';
import { anyString, deepEqual, instance, mock, reset, when } from 'ts-mockito';
const TEST_OBJECT_TAGGED_INPUT: FlowObjectInput = {
    id: 'Ec2_Arn',
    type: 'Tagged',
    value: '',
};
const VALID_INPUT: FlowRuleInput = {
    action: 'pass',
    version: 0,
    destination: 'Onprem_Server',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    id: 'auto-gen014aad9e-77b5-4587-92ad-7281a5bbe103',
    protocol: 'tcp',
    ruleBundleId: 'rule-group-003',
    source: 'Ec2_Arn',
    status: 'ACTIVE',
};

const DEFAULT_RULE_GROUP: FlowRuleBundle = {
    id: 'rule-group-02',
    ruleGroupArn: 'arn',
    ownerGroup: [],
    version: 0,
    description: 'test group',
};
const createGWEvent = (body: Record<string, unknown>) =>
    ({ body: JSON.stringify(body) } as APIGatewayProxyEvent);
describe('Test CreateRuleInputValidator', () => {
    const objectsDataSourceService = mock(ObjectsDataSourceService);
    const ruleGroupDataSourceService = mock(RuleBundleDataSourceService);
    let objectUnderTest: CreateRuleInputValidator;

    beforeEach(() => {
        reset(objectsDataSourceService);
        reset(ruleGroupDataSourceService);

        const logFactory = new StaticLoggerFactory();
        when(ruleGroupDataSourceService.getRuleBundleBy(anyString())).thenResolve(
            DEFAULT_RULE_GROUP
        );
        when(objectsDataSourceService.getObjectBy(anyString())).thenResolve(
            TEST_OBJECT_TAGGED_INPUT
        );

        objectUnderTest = new CreateRuleInputValidator(
            logFactory,
            instance(ruleGroupDataSourceService),
            instance(objectsDataSourceService)
        );
    });

    test('should pass', async () => {
        const outcome = await objectUnderTest.parseAndValidate(
            createGWEvent(VALID_INPUT)
        );
        expect(outcome).toEqual(VALID_INPUT);
    });

    test('should pass icmp', async () => {
        const targetInput = { ...VALID_INPUT };
        targetInput.protocol = 'icmp';
        const outcome = await objectUnderTest.parseAndValidate(
            createGWEvent(targetInput)
        );
        expect(outcome).toEqual(targetInput);
    });

    test('should reject when protocol is invalid', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, protocol: 'bla' });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('rule : protocol bla is not supported.', 400, false)
        );
    });

    test('should reject when action is invalid', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, action: 'bla-action' });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('rule : action bla-action is not supported.', 400, false)
        );
    });

    test('should reject when rule group not exits', async () => {
        when(
            ruleGroupDataSourceService.getRuleBundleBy(deepEqual('not-exists'))
        ).thenResolve(undefined);
        const inputEvent = createGWEvent({ ...VALID_INPUT, ruleBundleId: 'not-exists' });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'rule : rule bundle not-exists does not exists.',
                400,
                false
            )
        );
    });

    test('should reject when rule group not present', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, ruleBundleId: undefined });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('rule : rulebundle is missing', 400, false)
        );
    });

    test('should reject when rule src not present', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, source: undefined });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('rule : source and/or destination is missing', 400, false)
        );
    });

    test('should reject when rule destination not present', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, destination: undefined });
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError('rule : source and/or destination is missing', 400, false)
        );
    });

    test('should reject when rule src not exits', async () => {
        const inputEvent = createGWEvent({ ...VALID_INPUT, source: 'not-exists-src' });
        when(
            objectsDataSourceService.getObjectBy(deepEqual('not-exists-src'))
        ).thenResolve(undefined);
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'rule : source target not-exists-src does not exists.',
                400,
                false
            )
        );
    });
    test('should reject when rule destination not exits', async () => {
        const inputEvent = createGWEvent({
            ...VALID_INPUT,
            destination: 'not-exists-src',
        });
        when(
            objectsDataSourceService.getObjectBy(deepEqual('not-exists-src'))
        ).thenResolve(undefined);
        await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
            new RuleConfigError(
                'rule : destination target not-exists-src does not exists.',
                400,
                false
            )
        );
    });

    type TestTuple = [APIGatewayProxyEvent, string];
    describe('option fields', () => {
        const invalidOptions: TestTuple[] = [
            createOneTuple('iprep'),
            createOneTuple('lua'),
            createOneTuple('geoip'),
            createOneTuple('filestore'),
            createOneTuple('fileext'),
            createOneTuple('filemagic'),
            createOneTuple('threshold'),
            createOneTuple('enip_command'),
            createOneTuple('cip_service'),
            createOneTuple('datarep'),
            createOneTuple('dataset'),
            createOneTuple(
                'msg',
                'rule : option key msg is reserved, can not be assigned.'
            ),
            createOneTuple(
                'sid',
                'rule : option key sid is reserved, can not be assigned.'
            ),
        ];
        test.each<TestTuple>(invalidOptions)(
            'verify option has %p ',
            async (inputEvent, msg) => {
                await expect(
                    objectUnderTest.parseAndValidate(inputEvent)
                ).rejects.toEqual(new RuleConfigError(msg, 400, false));
            }
        );

        test('should pass allowed options with only key', async () => {
            const testRawInput = { ...VALID_INPUT, optionFields: [{ key: 'http_uri' }] };
            const outcome = await objectUnderTest.parseAndValidate(
                createGWEvent(testRawInput)
            );
            expect(outcome).toEqual(testRawInput);
        });

        test('should not pass when options fields are not valid list ', async () => {
            const testRawInput = { ...VALID_INPUT, optionFields: 'not a list' };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(testRawInput))
            ).rejects.toEqual(
                new RuleConfigError(
                    'rule : option is not a valid key value pair.',
                    400,
                    false
                )
            );
        });

        test('should not pass when options key is missing in the field ', async () => {
            const testRawInput = {
                ...VALID_INPUT,
                optionFields: [{ value: 'http_uri' }],
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(testRawInput))
            ).rejects.toEqual(
                new RuleConfigError(
                    `rule : option key is missing in ${{ value: 'http_uri' }}.`,
                    400,
                    false
                )
            );
        });

        test('should pass allowed options with only key value', async () => {
            const testRawInput = {
                ...VALID_INPUT,
                optionFields: [{ key: 'content', value: '403 Forbidden' }],
            };
            const testInput = createGWEvent(testRawInput);
            // https://suricata.readthedocs.io/en/suricata-6.0.0/rules/intro.html
            const outcome = await objectUnderTest.parseAndValidate(testInput);
            expect(outcome).toEqual(testRawInput);
        });

        test('should pass allowed options with wrong key, this would be validated on ANFW side', async () => {
            const testRawInput = {
                ...VALID_INPUT,
                optionFields: [{ key: 'definitely_wrong_key', value: '403 Forbidden' }],
            };
            const testInput = createGWEvent(testRawInput);
            // https://suricata.readthedocs.io/en/suricata-6.0.0/rules/intro.html
            const outcome = await objectUnderTest.parseAndValidate(testInput);
            expect(outcome).toEqual(testRawInput);
        });
    });

    describe('source port in Rules ', () => {
        test('should reject when rule src port not exits', async () => {
            const inputEvent = createGWEvent({ ...VALID_INPUT, sourcePort: undefined });
            await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
                new RuleConfigError(
                    'Invalid sourcePort : port is missing in the request.',
                    400,
                    false
                )
            );
        });

        test('should reject when rule destination port not exits', async () => {
            const inputEvent = createGWEvent({
                ...VALID_INPUT,
                destinationPort: undefined,
            });
            await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
                new RuleConfigError(
                    'Invalid destinationPort : port is missing in the request.',
                    400,
                    false
                )
            );
        });

        test('should reject when rule src port type not present', async () => {
            const inputEvent = createGWEvent({
                ...VALID_INPUT,
                sourcePort: { noTypeKey: '' },
            });

            await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
                new RuleConfigError(
                    'Invalid sourcePort : port type is missing in the request.',
                    400,
                    false
                )
            );
        });

        test('should reject when rule destination port type not present', async () => {
            const inputEvent = createGWEvent({
                ...VALID_INPUT,
                destinationPort: { noTypeKey: '' },
            });

            await expect(objectUnderTest.parseAndValidate(inputEvent)).rejects.toEqual(
                new RuleConfigError(
                    'Invalid destinationPort : port type is missing in the request.',
                    400,
                    false
                )
            );
        });

        test('throw error if port type not supported', async () => {
            const invalidArn = {
                ...VALID_INPUT,
                sourcePort: { type: 'not_supported', value: '10.0.0.0' },
            };

            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(invalidArn))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port type [not_supported] is not supported.',
            ]);
        });

        test('pass for single port with valid value', async () => {
            const result: FlowRuleInput = await objectUnderTest.parseAndValidate(
                createGWEvent({
                    ...VALID_INPUT,
                    sourcePort: { type: 'SinglePort', value: '123' },
                })
            );

            expect(result).toBeDefined();
        });

        test('throw error for single port with port too large', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                sourcePort: { type: 'SinglePort', value: '65536' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [65536] is not in range [0, 65535].',
            ]);
        });

        test('throw error for any type with value', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                sourcePort: { type: 'Any', value: 'bla' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port type [Any] should not associated any value but port value provided [bla].',
            ]);
        });

        test('throw error for single port without value', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                sourcePort: { type: 'SinglePort', value: undefined },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value is empty',
            ]);
        });

        test('throw error for single port with port negative', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                sourcePort: { type: 'SinglePort', value: '-1' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [-1] is not in range [0, 65535].',
            ]);
        });

        test('throw error for single port with NAN', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'SinglePort', value: 'NotANumber' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [NotANumber] is not a valid port value.',
            ]);
        });

        test('throw error for port range with invalid value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'SinglePort', value: 'NotANumber' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [NotANumber] is not a valid port value.',
            ]);
        });

        //PORT RANGE
        test('pass port range', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'PortRange', value: '[1:1000]' },
            };
            const result = await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            );
            expect(result).toBeDefined();
        });

        test('raise error for port range without value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'PortRange', value: undefined },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value is empty',
            ]);
        });

        test('raise error for port range from value exceeds', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'PortRange', value: '[1:65537]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [65537] is not in range [0, 65535].',
            ]);
        });

        test('raise error for port range from NAN value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'PortRange', value: '[bla:65537]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [bla:65537] is not a valid port range value.',
            ]);
        });

        test('raise error for port range from value greater than to value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                sourcePort: { type: 'PortRange', value: '[1001:1000]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid sourcePort : port value [1001:1000] contain from port greater than to port value.',
            ]);
        });

        // throw error if port value is not valid range
        // throw error if port value is present but type is any
    });

    describe('destination port in Rules ', () => {
        test('throw error if port type not supported', async () => {
            const invalidArn = {
                ...VALID_INPUT,
                destinationPort: { type: 'not_supported', value: '10.0.0.0' },
            };

            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(invalidArn))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port type [not_supported] is not supported.',
            ]);
        });

        test('pass for single port with valid value', async () => {
            const result: FlowRuleInput = await objectUnderTest.parseAndValidate(
                createGWEvent({
                    ...VALID_INPUT,
                    destinationPort: { type: 'SinglePort', value: '123' },
                })
            );

            expect(result).toBeDefined();
        });

        test('throw error for single port with port too large', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                destinationPort: { type: 'SinglePort', value: '65536' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [65536] is not in range [0, 65535].',
            ]);
        });

        test('throw error for any type with value', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                destinationPort: { type: 'Any', value: 'bla' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port type [Any] should not associated any value but port value provided [bla].',
            ]);
        });

        test('throw error for single port without value', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                destinationPort: { type: 'SinglePort', value: undefined },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value is empty',
            ]);
        });

        test('throw error for single port with port negative', async () => {
            const portValueExceededMax = {
                ...VALID_INPUT,
                destinationPort: { type: 'SinglePort', value: '-1' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(portValueExceededMax))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [-1] is not in range [0, 65535].',
            ]);
        });

        test('throw error for single port with NAN', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'SinglePort', value: 'NotANumber' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [NotANumber] is not a valid port value.',
            ]);
        });

        test('throw error for port range with invalid value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'SinglePort', value: 'NotANumber' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();

            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [NotANumber] is not a valid port value.',
            ]);
        });

        //PORT RANGE
        test('pass port range', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'PortRange', value: '[1:1000]' },
            };
            const result = await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            );
            expect(result).toBeDefined();
        });

        test('raise error for port range without value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'PortRange', value: undefined },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value is empty',
            ]);
        });

        test('raise error for port range from value exceeds', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'PortRange', value: '[1:65537]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [65537] is not in range [0, 65535].',
            ]);
        });

        test('raise error for port range from NAN value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'PortRange', value: '[bla:65537]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [bla:65537] is not a valid port range value.',
            ]);
        });

        test('raise error for port range from value greater than to value', async () => {
            const notNumberPort = {
                ...VALID_INPUT,
                destinationPort: { type: 'PortRange', value: '[1001:1000]' },
            };
            await expect(
                objectUnderTest.parseAndValidate(createGWEvent(notNumberPort))
            ).rejects.toBeDefined();
            expect(objectUnderTest.errors.length).toBe(1);
            expect(objectUnderTest.errors).toEqual([
                'Invalid destinationPort : port value [1001:1000] contain from port greater than to port value.',
            ]);
        });

        // throw error if port value is not valid range
        // throw error if port value is present but type is any
    });
});

function createOneTuple(
    key: string,
    expectedMsg?: string
): [APIGatewayProxyEvent, string] {
    return [
        createGWEvent({
            ...VALID_INPUT,
            optionFields: [{ key: key, value: 'dst,CnC,>,30' }],
        }),
        expectedMsg ?? `rule : option key ${key} is not supported.`,
    ];
}
