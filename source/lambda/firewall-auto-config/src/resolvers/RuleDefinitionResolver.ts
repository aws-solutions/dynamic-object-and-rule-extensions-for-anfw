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
    FlowObject,
    FlowRule,
    FlowRuleBundle,
    Logger,
    LoggerFactory,
    ResolvedFlowObject,
} from 'shared_types';
import { ObjectDefinitionResolver } from 'shared_types/src/resolvers/ObjectDefinitionResolver';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';
import { inject, injectable } from 'tsyringe';

@injectable()
export class RuleDefinitionResolver {
    logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('ObjectDefinitionResolver')
        private objectDefinitionResolver: ObjectDefinitionResolver
    ) {
        this.logger = loggerFactory.getLogger('RuleDefinitionResolver');
    }

    async resolveRules(
        ruleBundle: FlowRuleBundle,
        rules: FlowRule[],
        objects: FlowObject[],
        overallIndex: number
    ): Promise<FlowRule[]> {
        // check if all object can be referenced
        return Promise.all(
            rules.map((rule) =>
                this.resolveRule(
                    ruleBundle,
                    rule,
                    objects,
                    overallIndex + rules.indexOf(rule)
                )
            )
        );
    }

    private async resolveRule(
        ruleBundle: FlowRuleBundle,
        rule: FlowRule,
        objects: FlowObject[],
        index: number
    ): Promise<FlowRule> {
        const destinationTarget = objects.find((tgt) => tgt.id === rule.destination);
        const sourceTarget = objects.find((tgt) => tgt.id === rule.source);
        this.logger.info('resolving ', rule);
        if (!destinationTarget || !sourceTarget) {
            this.logger.error(
                'invalid reference objects',
                destinationTarget,
                sourceTarget
            );
            rule.status = 'FAILED';
            rule.failureReasons = [
                'Unable to resolve reference object of source and/or destination',
            ];
            return rule;
        }
        const resolvedSource = await this.resolveTarget(ruleBundle, sourceTarget);
        const resolvedDestination = await this.resolveTarget(
            ruleBundle,
            destinationTarget
        );

        if (
            this.encounterUnderlyingServiceError(resolvedSource.failureReasons) ||
            this.encounterUnderlyingServiceError(resolvedDestination.failureReasons)
        ) {
            throw new UnderlyingServiceError(
                'An error occurred when saving the new object',
                503,
                true
            );
        }
        this.updateRuleStatus(resolvedSource, rule, resolvedDestination);

        const sid = index + 1;
        const result = {
            ...rule,

            suricataString: this.createSuricataRuleString(
                rule,
                resolvedSource,
                resolvedDestination,
                sid
            ),
        };
        this.logger.info('resolveRules -> resolveRule', result);
        return result;
    }

    encounterUnderlyingServiceError(failureReasons?: string[]): boolean {
        const hasReasons = failureReasons && failureReasons.length > 0;
        return hasReasons ?? false;
    }

    private updateRuleStatus(
        resolvedSource: ResolvedFlowObject,
        rule: FlowRule,
        resolvedDestination: ResolvedFlowObject
    ) {
        this.tryUpdateRuleWithAssociatedFailure(resolvedSource, rule, [
            `Can not resolve source object to address ${resolvedSource.id}`,
        ]);
        this.tryUpdateRuleWithAssociatedFailure(resolvedDestination, rule, [
            `Can not resolve destination object to address ${resolvedDestination.id}`,
        ]);
    }

    private tryUpdateRuleWithAssociatedFailure(
        resolvedSource: ResolvedFlowObject,
        rule: FlowRule,
        defaultReasons: [string]
    ) {
        const hasReasons =
            resolvedSource.failureReasons && resolvedSource.failureReasons.length > 0;
        if (resolvedSource.addresses.length === 0 || hasReasons) {
            rule.status = 'FAILED';
            rule.failureReasons = this.getFailedReasonPhrases(
                resolvedSource,
                hasReasons,
                defaultReasons
            );
        }
    }

    private getFailedReasonPhrases(
        resolvedSource: ResolvedFlowObject,
        hasReasons: boolean | undefined,
        canNotResolveToAddress: string[]
    ) {
        if (hasReasons) {
            this.logger.info(
                'Update rule with original failure reasons',
                resolvedSource.failureReasons
            );
            return resolvedSource.failureReasons;
        } else {
            return canNotResolveToAddress;
        }
    }

    private createSuricataRuleString(
        rule: FlowRule,
        resolvedSource: FlowObject,
        resolvedDestination: FlowObject,
        sid: number
    ): string {
        const options = this.createRuleOptions(rule, sid);
        const sourcePortValue =
            rule.sourcePort.type === 'Any' ? 'any' : rule.sourcePort.value;
        const destinationPortValue =
            rule.destinationPort.type === 'Any' ? 'any' : rule.destinationPort.value;

        return `${rule.action} ${rule.protocol} ${resolvedSource.value} ${sourcePortValue} ->  ${resolvedDestination.value} ${destinationPortValue} ${options} `;
    }

    private createRuleOptions(rule: FlowRule, sid: number) {
        const allAdditionalOptions = rule.optionFields
            ?.map((kp) => {
                return `${kp.key}: ${kp.value}`;
            })
            .join('; ');
        const appendedOptions = allAdditionalOptions
            ? ' ' + allAdditionalOptions + ';'
            : '';
        return `(msg: "${rule.id}"; sid: ${sid};${appendedOptions})`;
    }

    private async resolveTarget(
        ruleBundle: FlowRuleBundle,
        originalTarget: FlowObject
    ): Promise<ResolvedFlowObject> {
        try {
            const resolvedTarget = await this.objectDefinitionResolver.resolveTarget(
                originalTarget,
                ruleBundle
            );
            this.logger.info('RuleDefinitionResolver resolved object', resolvedTarget);
            return {
                id: resolvedTarget.id,
                type: resolvedTarget.type,
                value: resolvedTarget.addresses,
                addresses: resolvedTarget.addresses,
                failureReasons: resolvedTarget.failureReasons,
            };
        } catch (e) {
            this.logger.error('got exception', e);
            return { ...originalTarget, addresses: [], failureReasons: [e.message] };
        }
    }
}
