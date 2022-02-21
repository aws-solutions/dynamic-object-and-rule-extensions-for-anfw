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
import { Logger, LoggerFactory } from 'shared_types';
import { CreateRuleBundleInput } from 'src/types/RuleGroups';
import { inject, injectable } from 'tsyringe';
import { GeneralRuleBundleInputValidator } from './GeneralRuleBundleInputValidator';
import { InputValidator, REGEX_DESCRIPTION, REGEX_ID } from './InputValidator';

@injectable()
export class CreateRuleBundleInputValidator extends InputValidator<CreateRuleBundleInput> {
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('GeneralRuleBundleInputValidator')
        private generalValidator: GeneralRuleBundleInputValidator
    ) {
        super();
        this.logger = loggerFactory.getLogger('CreateRuleBundleInputValidator');
    }
    protected async validate(input: CreateRuleBundleInput): Promise<void> {
        if (this.isBlank(input.ruleGroupArn)) {
            this.errors.push('ruleGroupArn cannot be null or empty.');
        }

        if (input.id && !this.isValidId(input.id)) {
            this.errors.push(`id violated restriction, expecting ${REGEX_ID}`);
        }

        if (input.description && !this.isValidDescriptionName(input.description)) {
            this.errors.push(
                `description violated restriction, expecting ${REGEX_DESCRIPTION}`
            );
        }

        if (!this.generalValidator.isValidateArn(input.ruleGroupArn)) {
            this.errors.push(`ruleGroupArn : ${input.ruleGroupArn} is not a valid arn.`);
        }

        if (!(await this.generalValidator.isValidRuleGroup(input.ruleGroupArn))) {
            this.logger.info(`ruleGroup : ${input.ruleGroupArn} does not exists.`);
            this.errors.push(`ruleGroup : ${input.ruleGroupArn} does not exists.`);
        }

        if (!(await this.generalValidator.isValidAggregator(input.aggregatorName))) {
            this.logger.info(`aggregator : ${input.aggregatorName} does not exists.`);
            this.errors.push(`aggregator : ${input.aggregatorName} does not exists.`);
        }

        if (!this.generalValidator.containsValidAdminGroup(input.ownerGroup)) {
            this.logger.info(
                `ownerGroup : ${input.ownerGroup} does not contain admin role, valid roles are ${this.generalValidator.validAdminArns}`
            );
            this.errors.push(
                `ownerGroup : ${input.ownerGroup} does not contain admin role, valid roles are ${this.generalValidator.validAdminArns}`
            );
        }

        if (!this.generalValidator.isValidOwnerGroup(input.ownerGroup)) {
            this.logger.info(
                `ownerGroup : ${input.ownerGroup} contains invalid role arn, valid roles are ${this.generalValidator.validRoleArns}`
            );
            this.errors.push(
                `ownerGroup : ${input.ownerGroup} contains invalid role arn, valid roles are ${this.generalValidator.validRoleArns}`
            );
        }
    }
}
