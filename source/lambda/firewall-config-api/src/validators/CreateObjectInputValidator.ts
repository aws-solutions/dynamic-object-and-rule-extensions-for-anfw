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
import { ARN, parse } from '@aws-sdk/util-arn-parser';
import { Logger, LoggerFactory, ObjectDefinitionResolver } from 'shared_types';
import { FlowObjectInput } from 'src/types/FlowTarget';
import { inject, injectable } from 'tsyringe';
import { InputValidator, REGEX_ID } from './InputValidator';
type TagValuePair = { key: string; value: string };
type ValidationResult = { isValid: boolean; message: string };

@injectable()
export class CreateObjectInputValidator extends InputValidator<FlowObjectInput> {
    DEFAULT_SUPPORT_TYPES = ['autoscaling', 'ec2'];

    SUPPORTED_RESOURCE_REGX = /(security-group|instance|vpc|subnet)\/(.+)/;
    PORT_RANGE_REGX = /\[(\d+):(\d.+)\]/;
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectDefinitionResolver')
        private objectDefinitionResolver: ObjectDefinitionResolver
    ) {
        super();
        this.logger = loggerFactory.getLogger('CreateObjectInputValidator');
    }
    protected async validate(input: FlowObjectInput): Promise<void> {
        if (!this.isValidId(input.id)) {
            this.errors.push(
                `id cannot be null or empty and should be matching ${REGEX_ID}`
            );
        }

        if (input.type === 'Arn') {
            const arnValidationResult = this.validateArn(input.value);
            if (!arnValidationResult.isValid) {
                this.errors.push(`Invalid target : ${arnValidationResult.message}.`);
            }
        }

        if (input.type === 'Tagged') {
            const valid = this.isValidTagValue(input.value);
            if (!valid) {
                this.errors.push(
                    `Invalid target : ${input.value} is not a valid tag value.`
                );
            }
        }

        if (this.errors.length > 0) {
            return;
        }

        await this.validateObjectReference(input);
    }

    private async validateObjectReference(input: FlowObjectInput) {
        if (input.type === 'Tagged') {
            this.logger.info('Input type is Tagged skip resolution on creation/updating');
            return;
        }
        try {
            const result = await this.objectDefinitionResolver.resolveTarget(input);
            this.logger.info('resolved outcome', result);
            if (result.addresses.length === 0) {
                this.logger.error(
                    `can not resolve target to IP addresses, ${result.failureReasons}`
                );
                this.errors.push(
                    `can not resolve target to IP addresses${result.failureReasons ?? ''}`
                );
            }
        } catch (e) {
            this.logger.error('can not resolve target', input, e);
            this.errors.push('can not resolve target', e);
        }
    }

    isValidTagValue(value: unknown): boolean {
        if (!Array.isArray(value)) {
            return false;
        }
        const listOfTags: TagValuePair[] = value as TagValuePair[];
        return listOfTags.some((t) => !this.isBlank(t.key) && !this.isBlank(t.value));
    }

    private validateArn(inputArn: string): ValidationResult {
        let isValid = false;
        let message = '';
        try {
            const arn: ARN = parse(inputArn);
            if (this.DEFAULT_SUPPORT_TYPES.includes(arn.service)) {
                const match = arn.resource.match(this.SUPPORTED_RESOURCE_REGX);
                isValid =
                    arn.service == 'autoscaling' ||
                    (arn.service === 'ec2' && match != null && match[1] != null);
            } else {
                message = `${arn.service} is not a supported arn type`;
            }
        } catch (e) {
            message = `${inputArn} is not a valid arn`;
            isValid = false;
        }
        return { isValid, message };
    }
}
