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
    DescribeRuleGroupCommand,
    NetworkFirewallClient,
    UpdateRuleGroupCommand,
} from '@aws-sdk/client-network-firewall';
import { FlowRule, Logger, LoggerFactory } from 'shared_types';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';
import { inject, injectable } from 'tsyringe';
import { DDBdataSourceService } from '../service/DDBdataSourceService';
import { RuleStatusMeta, RuleStatusNotifier } from './RuleStatusNotifier';

@injectable()
export class RuleUpdater {
    RULE_EXCEPTION_MSG_REG = /rule:.+\(msg:(.+);\ssid.+\)/;
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DDBdataSourceService') private dataSourceService: DDBdataSourceService,
        @inject('NetworkFirewallClient')
        private networkFirewallClient: NetworkFirewallClient,
        @inject('RuleStatusNotifier') private ruleStatusNotifier: RuleStatusNotifier
    ) {
        this.logger = loggerFactory.getLogger('RuleUpdater');
    }
    public async updateRules(
        ruleGroupArn: string,
        rules: FlowRule[],
        updateStatus = true
    ): Promise<void> {
        this.logger.info('updating rules', rules);
        const input = {
            RuleGroupArn: ruleGroupArn,
        };
        const targetRules = rules.filter((r) => r.status !== 'FAILED');

        await this.applyRulesToNetworkFirewall(input, targetRules, ruleGroupArn, rules);

        if (updateStatus) {
            this.logger.info('rules to be updated', rules);
            await this.notifyFailure(rules);
            await this.dataSourceService.updateRules(rules);
        }
    }

    private async applyRulesToNetworkFirewall(
        input: { RuleGroupArn: string },
        targetRules: FlowRule[],
        ruleGroupArn: string,
        rules: FlowRule[]
    ) {
        if (targetRules.length === 0) {
            this.logger.warn(
                `all rules for target ${ruleGroupArn} are all in failed status, skip calling network firewall`
            );
            return;
        }

        try {
            const updateToken = await this.getTokenFromANFW(input);

            await this.updateFirewallRules(targetRules, updateToken, ruleGroupArn);
            // all the rules status goes to ACTIVE
            for (const r of targetRules) {
                r.status = 'ACTIVE';
            }
        } catch (e) {
            this.logger.error('got error!!!', e);
            if (e.name == 'InvalidRequestException') {
                this.updateRuleStatus(e, rules);
            } else {
                // error hanppened, but not parsable failure, raise alarm
                this.logger.error('Unprocessable rules', rules);
                this.logger.error('Unprocessable error', e);
                throw new UnderlyingServiceError(
                    'An error occurred when applying rules to ANFW',
                    503,
                    true
                );
            }
        }
    }

    private async updateFirewallRules(
        targetRules: FlowRule[],
        updateToken: string | undefined,
        ruleGroupArn: string
    ) {
        const newRulesString = targetRules.map((r) => r.suricataString).join('\n');
        this.logger.info(`update rule bundle with rules ${newRulesString}`);
        const updateRuleGroupInput = {
            UpdateToken: updateToken,
            RuleGroupArn: ruleGroupArn,
            Rules: newRulesString,
        };

        const updateRuleGroupCommand = new UpdateRuleGroupCommand(updateRuleGroupInput);
        // check update rule bundle response to determin status of each rule
        this.logger.info('update firewall rule command', updateRuleGroupCommand);
        const response = await this.networkFirewallClient.send(updateRuleGroupCommand);
        this.logger.info('updated firewall rule response', response);
    }

    private async getTokenFromANFW(input: { RuleGroupArn: string }) {
        const describeRuleGroupCommand = new DescribeRuleGroupCommand(input);
        this.logger.info(`describing rulegroup command `, describeRuleGroupCommand);
        const describeRuleGroupResult = await this.networkFirewallClient.send(
            describeRuleGroupCommand
        );
        return describeRuleGroupResult.UpdateToken;
    }

    private async notifyFailure(rules: FlowRule[]) {
        const failedRules = rules
            .filter((r) => r.status === 'FAILED')
            .map(
                (r) =>
                    ({
                        ruleId: r.id,
                        reasonPhrease: r.failureReasons,
                        ruleBundleId: r.ruleBundleId,
                        status: 'FAILED',
                    } as RuleStatusMeta)
            );
        await Promise.all(failedRules.map((fr) => this.ruleStatusNotifier.notify(fr)));
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    handleUndeterminedError(e: any, rules: FlowRule[]): void {
        // this is to handle the cases where no specific info was given, where no specific rules can be treated as failure
        rules.forEach((r) => {
            r.status = 'FAILED';
            r.failureReasons = ['Encountered unresolvable error: ' + e.message];
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private updateRuleStatus(e: any, rules: FlowRule[]) {
        const value: string = e.message ?? '';
        this.logger.info('get error msg', value.split(','));
        const reasons = value.split(',');
        const match = reasons[1].trim().match(this.RULE_EXCEPTION_MSG_REG);

        if (!match) {
            //unknown error raise general exception
            this.handleUndeterminedError(e, rules);
            return;
        }
        const invalidRuleId = match[1].trim().replace(/['"]+/g, '');
        this.logger.info('match', invalidRuleId.replace(/['"]+/g, ''));
        const invalidRule = rules.find((r) => r.id === invalidRuleId);
        if (!invalidRule) {
            this.logger.error(
                `Unprocessable error, no matching rule found for ${invalidRuleId} of exception ${e}`
            );
            this.handleUndeterminedError(e, rules);
            return;
        }
        invalidRule.status = 'FAILED';
        invalidRule.failureReasons = ['Encountered unresolvable error: ' + e.message];
        this.logger.info(`updating rule status to FAILED ${invalidRuleId}`);
    }
}
