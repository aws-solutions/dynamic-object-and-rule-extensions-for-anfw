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
import 'reflect-metadata';
import { FlowRulePort, FLOW_TARGET_TYPES_STR, Logger, LoggerFactory } from 'shared_types';
import { ObjectsDataSourceService } from 'src/service/ObjectsDataSourceService';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { FlowRuleInput } from 'src/types/FlowRule';
import { inject, injectable } from 'tsyringe';
import { InputValidator } from './InputValidator';
import * as _ from 'lodash';

const SUPPORTED_PROTOCOLS = ['tcp', 'udp', 'icmp'];
const SUPPORTED_ACTIONS = ['pass', 'drop', 'alert'];
const RESERVED_OPTIONS = ['msg', 'sid'];
const MAX_PORT_NUMBER = 65535;
// key in known unsupported list https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-limitations-caveats.html
const KNOWN_UNSUPPORTED_OPTIONS = [
    'iprep',
    'lua',
    'geoip',
    'filestore',
    'fileext',
    'filemagic',
    'threshold',
    'enip_command',
    'cip_service',
    'datarep',
    'dataset',
];
@injectable()
export class CreateRuleInputValidator extends InputValidator<FlowRuleInput> {
    PORT_RANGE_REGX = /\[(\d+):(\d.+)\]/;

    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleGroupDataSourceService: RuleBundleDataSourceService,
        @inject('ObjectsDataSourceService')
        private targetsDataSourceService: ObjectsDataSourceService
    ) {
        super();
        this.logger = loggerFactory.getLogger('CreateRuleInputValidator');
    }

    protected async validate(input: FlowRuleInput): Promise<void> {
        if (!SUPPORTED_PROTOCOLS.includes(input.protocol)) {
            this.logger.info(`rule : protocol ${input.protocol} is not supported.`);
            this.errors.push(`rule : protocol ${input.protocol} is not supported.`);
        }

        if (!SUPPORTED_ACTIONS.includes(input.action)) {
            this.logger.info(`rule : action ${input.action} is not supported.`);
            this.errors.push(`rule : action ${input.action} is not supported.`);
        }

        this.validOptionFields(input);
        if (!input.ruleBundleId) {
            this.logger.info(`rule : rulebundle is missing`);
            this.errors.push(`rule : rulebundle is missing`);
        } else {
            const ruleBundle = await this.ruleGroupDataSourceService.getRuleBundleBy(
                input.ruleBundleId
            );
            if (!ruleBundle) {
                this.logger.info(
                    `rule : rule bundle ${input.ruleBundleId} does not exists.`
                );
                this.errors.push(
                    `rule : rule bundle ${input.ruleBundleId} does not exists.`
                );
            }
        }

        await this.validSrcAndDst(input);

        this.validRulePorts(input.sourcePort, 'sourcePort');
        this.validRulePorts(input.destinationPort, 'destinationPort');
    }

    private validRulePorts(port: FlowRulePort, portName: string) {
        if (!port) {
            this.logger.error(`Invalid ${portName} : port is missing in the request.`);
            this.errors.push(`Invalid ${portName} : port is missing in the request.`);
            return;
        }

        if (!port.type) {
            this.logger.error(
                `Invalid ${portName} : port type is missing in the request.`
            );
            this.errors.push(
                `Invalid ${portName} : port type is missing in the request.`
            );
            return;
        }

        if (!FLOW_TARGET_TYPES_STR.includes(port.type)) {
            this.logger.error(
                `Invalid ${portName} : port type [${port.type}] is not supported.`
            );
            this.errors.push(
                `Invalid ${portName} : port type [${port.type}] is not supported.`
            );
        } else {
            const portType = port.type;
            const portValue = port.value;
            if (portType === 'Any') {
                if (portValue) {
                    this.logger.error(
                        `Invalid ${portName} : port type [${port.type}] should not associated any value but port value provided [${portValue}].`
                    );
                    this.errors.push(
                        `Invalid ${portName} : port type [${port.type}] should not associated any value but port value provided [${portValue}].`
                    );
                }
            }

            if (portType === 'SinglePort') {
                this.validSinglePort(portValue, portName);
            } else if (portType === 'PortRange') {
                this.validPortRange(portValue, portName);
            }
        }
    }

    private validSinglePort(portValue: string | undefined, portName: string) {
        if (!portValue) {
            this.logger.error(`Invalid ${portName} : port value is empty`);
            this.errors.push(`Invalid ${portName} : port value is empty`);
        } else {
            this.validPort(portValue, portName);
        }
    }
    private validPort(rawPortValue: string, portName: string): number {
        const port = parseInt(rawPortValue);
        if (isNaN(port)) {
            this.logger.error(
                `Invalid ${portName} : port value [${rawPortValue}] is not a valid port value.`
            );
            this.errors.push(
                `Invalid ${portName} : port value [${rawPortValue}] is not a valid port value.`
            );
        } else if (port < 0 || port > MAX_PORT_NUMBER) {
            this.logger.error(
                `Invalid ${portName} : port value [${rawPortValue}] is not in range [0, ${MAX_PORT_NUMBER}].`
            );
            this.errors.push(
                `Invalid ${portName} : port value [${rawPortValue}] is not in range [0, ${MAX_PORT_NUMBER}].`
            );
        }
        return port;
    }
    private validPortRange(portValue: string | undefined, portName: string) {
        if (!portValue) {
            this.logger.error(`Invalid ${portName} : port value is empty`);
            this.errors.push(`Invalid ${portName} : port value is empty`);
        } else {
            const match = portValue.match(this.PORT_RANGE_REGX);
            if (match) {
                const from = this.validPort(match[1], portName);
                const to = this.validPort(match[2], portName);
                if (from > to) {
                    this.logger.error(
                        `Invalid ${portName} : port value ${portValue} contain from port greater than to port value.`
                    );
                    this.errors.push(
                        `Invalid ${portName} : port value ${portValue} contain from port greater than to port value.`
                    );
                }
            } else {
                this.logger.error(
                    `Invalid ${portName} : port value ${portValue} is not a valid port range value.`
                );
                this.errors.push(
                    `Invalid ${portName} : port value ${portValue} is not a valid port range value.`
                );
            }
        }
    }

    private async validSrcAndDst(input: FlowRuleInput) {
        if (!(input.source && input.destination)) {
            this.logger.info(`rule : source and/or destination is missing`);
            this.errors.push(`rule : source and/or destination is missing`);
        } else {
            const sourceObj = await this.targetsDataSourceService.getObjectBy(
                input.source
            );
            if (!sourceObj) {
                this.logger.info(`rule : source target ${input.source} does not exists.`);
                this.errors.push(`rule : source target ${input.source} does not exists.`);
            }

            const destinationObj = await this.targetsDataSourceService.getObjectBy(
                input.destination
            );
            if (!destinationObj) {
                this.logger.info(
                    `rule : destination target ${input.destination} does not exists.`
                );
                this.errors.push(
                    `rule : destination target ${input.destination} does not exists.`
                );
            }
        }
    }

    private validOptionFields(input: FlowRuleInput) {
        if (input.optionFields) {
            // check is valid pairs
            if (!_.isArray(input.optionFields)) {
                this.logger.info('rule : option is not a valid key value pair.');
                this.errors.push('rule : option is not a valid key value pair.');
            } else {
                // check is allowed field
                input.optionFields.forEach((kp) => {
                    if (!kp.key) {
                        this.logger.info(`rule : option key is missing in ${kp}.`);
                        this.errors.push(`rule : option key is missing in ${kp}.`);
                    }
                    // key is
                    if (KNOWN_UNSUPPORTED_OPTIONS.includes(kp.key)) {
                        this.logger.info(`rule : option key ${kp.key} is not supported.`);
                        this.errors.push(`rule : option key ${kp.key} is not supported.`);
                    }

                    if (RESERVED_OPTIONS.includes(kp.key)) {
                        this.logger.info(
                            `rule : option key ${kp.key} is reserved, can not be assigned.`
                        );
                        this.errors.push(
                            `rule : option key ${kp.key} is reserved, can not be assigned.`
                        );
                    }
                });
            }
        }
    }
}
