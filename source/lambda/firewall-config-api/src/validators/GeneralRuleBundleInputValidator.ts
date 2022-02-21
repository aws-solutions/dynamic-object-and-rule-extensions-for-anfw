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
    DescribeConfigurationAggregatorsCommand,
} from '@aws-sdk/client-config-service';
import {
    DescribeRuleGroupCommand,
    DescribeRuleGroupCommandInput,
    NetworkFirewallClient,
} from '@aws-sdk/client-network-firewall';
import { parse } from '@aws-sdk/util-arn-parser';
import { Logger, LoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { inject, injectable } from 'tsyringe';

@injectable()
export class GeneralRuleBundleInputValidator {
    logger: Logger;
    validRoleArns: string[];
    validAdminArns: string[];
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration,
        @inject('ConfigServiceClient') private configServiceClient: ConfigServiceClient,
        @inject('NetworkFirewallClient')
        private networkFirewallClient: NetworkFirewallClient
    ) {
        this.logger = loggerFactory.getLogger('GeneralRuleBundleInputValidator');
        this.validRoleArns = [
            this.appConfiguration.adminRole,
            ...this.appConfiguration.applicationOwnerRoles,
        ];
        this.validAdminArns = [this.appConfiguration.adminRole];
    }
    public async isValidRuleGroup(ruleGroupArn: string): Promise<boolean> {
        try {
            const input: DescribeRuleGroupCommandInput = { RuleGroupArn: ruleGroupArn };

            const command = new DescribeRuleGroupCommand(input);
            const response = await this.networkFirewallClient.send(command);
            this.logger.info('query for ValidRuleGroup', response);
            return response.$metadata.httpStatusCode === 200;
        } catch (e) {
            this.logger.error('error while ValidRuleGroup', e);
            if (e.name === 'ResourceNotFoundException') {
                this.logger.error(`invalid ruleGroupArn  ${ruleGroupArn}`);
            }
            return false;
        }
    }

    public isValidOwnerGroup(ownerGroup: string[]): boolean {
        return ownerGroup.every((og) => this.validRoleArns.includes(og));
    }

    public containsValidAdminGroup(ownerGroup: string[]): boolean {
        return ownerGroup.includes(this.appConfiguration.adminRole);
    }

    public isValidateArn(ruleGroupArn: string): boolean {
        let isValid = false;

        try {
            parse(ruleGroupArn);
            isValid = true;
        } catch (e) {
            isValid = false;
        }
        return isValid;
    }

    public async isValidAggregator(aggregatorName?: string): Promise<boolean> {
        const aggregatorNameToBeChecked =
            aggregatorName ?? this.appConfiguration.defaultAggregatorName;
        try {
            const describeAggregatorInput = {
                ConfigurationAggregatorNames: [aggregatorNameToBeChecked],
            };
            const command = new DescribeConfigurationAggregatorsCommand(
                describeAggregatorInput
            );
            const response = await this.configServiceClient.send(command);
            this.logger.info('query isValidateAggregator', response);
            return response.$metadata.httpStatusCode === 200;
        } catch (e) {
            this.logger.error('request config description exception', e);
            if (e.name === 'NoSuchConfigurationAggregatorException') {
                this.logger.error('invalid aggregator name ', aggregatorName);
            }
            return false;
        }
    }
}
