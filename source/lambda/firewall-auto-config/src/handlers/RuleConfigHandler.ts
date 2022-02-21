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

import * as lambda from 'aws-lambda';
import {
    FlowObject,
    FlowRule,
    FlowRuleBundle,
    Logger,
    LoggerFactory,
    RuleApplicationResult,
} from 'shared_types';
import UnderlyingServiceError from 'src/common/UnderlyingServiceError';
import { RuleDefinitionResolver } from 'src/resolvers/RuleDefinitionResolver';
import { RuleStatusNotifier } from 'src/service/RuleStatusNotifier';
import { RuleUpdater } from 'src/service/RuleUpdater';
import { inject, injectable } from 'tsyringe';
import { AsyncRequestHandler } from '../common/AsyncRequestHandler';
import { ServerlessResponse } from '../common/ServerlessResponse';
import { DDBdataSourceService } from '../service/DDBdataSourceService';

export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleIds: string[];
};

export const DEFAULT_RULE: FlowRule = {
    id: 'default-rule',
    action: 'drop',
    protocol: 'tcp',
    ruleBundleId: 'default',
    status: 'PENDING',
    source: 'default-src',
    destination: 'default-destination',
    suricataString: 'drop tcp any any ->  any any (msg: "default-rule"; sid: 1;)',
    sourcePort: {
        type: 'SinglePort',
        value: '123',
    },
    destinationPort: {
        type: 'Any',
    },
    version: 0,
};

@injectable()
export class RuleConfigHandler
    implements
        AsyncRequestHandler<ConfigurationEvaluationTriggerEvent, ServerlessResponse> {
    private readonly logger: Logger;
    private DEFAULT_CHUNK_SIZE = 50;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DDBdataSourceService') private dataSourceService: DDBdataSourceService,
        @inject('DefinitionResolver') private definitionResolver: RuleDefinitionResolver,
        @inject('RuleUpdater') private ruleUpdater: RuleUpdater,
        @inject('RuleStatusNotifier') private notifier: RuleStatusNotifier
    ) {
        this.logger = loggerFactory.getLogger('RuleConfigHandler');
    }

    async handle(
        event: ConfigurationEvaluationTriggerEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: lambda.Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);
        let resultBody: RuleApplicationResult;
        if (!event || !event.ruleBundleIds) {
            this.logger.error('invalid event', event);
            resultBody = { message: `rule bundle ids not provided` };
            return ServerlessResponse.ofObject(400, resultBody);
        }
        const ruleBundleIds = event.ruleBundleIds;
        const ruleBundles = await this.dataSourceService.getRuleBundleByIds(
            ruleBundleIds
        );

        if (!ruleBundles || ruleBundles.length === 0) {
            this.logger.error(`rule bundle not found ${ruleBundleIds}`);
            resultBody = {
                message: `rule bundle not found ${ruleBundleIds}`,
                ruleBundleIds: ruleBundleIds,
            };

            return ServerlessResponse.ofObject(404, resultBody);
        }
        const toTheSameTarget = ruleBundles.every(
            (v) => v.ruleGroupArn === ruleBundles[0].ruleGroupArn
        );

        if (!toTheSameTarget) {
            resultBody = {
                message: `rule bundles ${ruleBundleIds} are targeting at different firewall rules`,
                ruleBundleIds: ruleBundleIds,
            };
            return ServerlessResponse.ofObject(400, resultBody);
        }
        try {
            const allResolvedRules: FlowRule[] = await this.getAllResolvedRules(
                ruleBundles
            );

            await this.updateRuleStatus(ruleBundles, allResolvedRules, ruleBundleIds);
        } catch (e) {
            this.logger.error('Error', e);
            resultBody = this.createErrorResponseBody(e, ruleBundleIds);
            await this.notifier.sendNotification(resultBody.message);
            return ServerlessResponse.ofObject(503, resultBody);
        }

        resultBody = {
            message: `successfully processed rules for rule bundle ${ruleBundleIds}`,
            ruleBundleIds: ruleBundleIds,
        };

        return ServerlessResponse.ofObject(200, resultBody);
    }

    private createErrorResponseBody(e: unknown, ruleBundleIds: string[]) {
        let resultBody: RuleApplicationResult;
        if (e instanceof UnderlyingServiceError) {
            resultBody = {
                message: `Unable to update ${ruleBundleIds} due to underlying service error`,
                ruleBundleIds: ruleBundleIds,
            };
        } else {
            resultBody = {
                message: `Unable to update ${ruleBundleIds} due to unexpected internal error`,
                ruleBundleIds: ruleBundleIds,
            };
        }
        return resultBody;
    }

    private async updateRuleStatus(
        ruleBundles: FlowRuleBundle[],
        allResolvedRules: FlowRule[],
        ruleBundleIds: string[]
    ) {
        const targetArn = ruleBundles[0].ruleGroupArn;
        if (allResolvedRules.length === 0) {
            this.logger.warn(
                `no rules found in group ${ruleBundleIds}, applying default rule`
            );

            await this.ruleUpdater.updateRules(targetArn, [DEFAULT_RULE], false);
        } else {
            this.logger.info(`applying rules in group ${ruleBundleIds}`);
            await this.ruleUpdater.updateRules(targetArn, allResolvedRules);
        }
    }

    private async getAllResolvedRules(ruleBundles: FlowRuleBundle[]) {
        const allResolvedRules: FlowRule[] = new Array<FlowRule>();
        let overallIndex = 0;
        for (const bundle of ruleBundles) {
            this.logger.info('handle got ruleGroup', bundle);
            const rules = await this.dataSourceService.getRulesBy(bundle.id);

            this.logger.debug('handle got rules', rules);

            const objects = await this.getAllReferencedObjects(rules);
            this.logger.debug('handler get all referenced objects', objects);

            const resolvedRules: FlowRule[] = await this.resolveRules(
                rules,
                bundle,
                objects,
                overallIndex
            );
            allResolvedRules.push(...resolvedRules);
            overallIndex = overallIndex + rules.length;
        }
        return allResolvedRules;
    }

    private async resolveRules(
        rules: FlowRule[],
        ruleBundle: FlowRuleBundle,
        objects: FlowObject[],
        globalOverallIndex: number
    ) {
        let allResolvedRules: FlowRule[] = [];
        const chunked = new Array<FlowRule[]>();
        const size = this.DEFAULT_CHUNK_SIZE;
        Array.from({ length: Math.ceil(rules.length / size) }, (_, i) => {
            chunked.push(rules.slice(i * size, i * size + size));
        });
        for (const rules of chunked) {
            this.logger.info('processing rules batch', rules);
            const overallIndex = chunked.indexOf(rules) * size + globalOverallIndex;
            this.logger.info(`processing rules batch index ${chunked.indexOf(rules)}`);
            const resolvedRules = await this.definitionResolver.resolveRules(
                ruleBundle,
                rules,
                objects,
                overallIndex
            );
            this.logger.info('resolved rules', resolvedRules);
            allResolvedRules = allResolvedRules.concat(resolvedRules);
        }
        return allResolvedRules;
    }

    private async getAllReferencedObjects(rules: FlowRule[]): Promise<FlowObject[]> {
        const allReferencedObject = rules.flatMap((rule) => [
            rule.source,
            rule.destination,
        ]);
        const allReferencedObjectUniqueSet = [...new Set(allReferencedObject)];

        return this.dataSourceService.getObjects(allReferencedObjectUniqueSet);
    }
}
