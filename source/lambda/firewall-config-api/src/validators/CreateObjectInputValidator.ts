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
    TAG_MAX_NUMBER = 10;

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
        this.validId(input);

        this.validateArn(input);

        this.validTagValue(input);

        if (this.errors.length > 0) {
            return;
        }

        await this.validateObjectReference(input);
    }

    private validId(input: FlowObjectInput) {
        if (!this.isValidId(input.id)) {
            this.errors.push(
                `id cannot be null or empty and should be matching ${REGEX_ID}`
            );
        }
    }

    private validateArn(input: FlowObjectInput) {
        if (input.type === 'Arn') {
            const arnValidationResult = this.isValidateArn(input.value);
            if (!arnValidationResult.isValid) {
                this.errors.push(`Invalid target : ${arnValidationResult.message}.`);
            }
        }
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
            this.errors.push('can not resolve target', e as string);
        }
    }

    validTagValue(input: FlowObjectInput): void {
        if (!['Tagged', 'Lambda'].includes(input.type)) {
            return;
        }

        if (!Array.isArray(input.value)) {
            this.errors.push(`Invalid target : ${input.value} is not a list`);
        }
        const listOfTags: TagValuePair[] = input.value as TagValuePair[];
        const tagLengthExceeded = listOfTags.length >= this.TAG_MAX_NUMBER;
        if (tagLengthExceeded) {
            this.errors.push(
                `Tag value exceeded max allowed number, max pair ${this.TAG_MAX_NUMBER}`
            );
        }
        if (listOfTags.some((t) => this.isBlank(t.key) || this.isBlank(t.value))) {
            this.errors.push(`Invalid target : contains empty string`);
        }
    }

    private isValidateArn(inputArn: string): ValidationResult {
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
