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
    InvocationType,
    InvokeCommand,
    InvokeCommandInput,
    LambdaClient,
} from '@aws-sdk/client-lambda';
import * as lambda from 'aws-lambda';
import {
    BasicHttpResponse as ServerlessResponse,
    FlowRuleBundle,
    Logger,
    LoggerFactory,
} from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { inject, injectable } from 'tsyringe';
import { TextDecoder, TextEncoder } from 'util';
import { AsyncRequestHandler } from '../common/AsyncRequestHandler';
import { DDBdataSourceService } from '../service/DDBdataSourceService';
export type ConfigurationEvaluationTriggerEvent = {
    ruleBundleId: string;
};

@injectable()
export class RuleConfigScheduler
    implements AsyncRequestHandler<lambda.ScheduledEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('DDBdataSourceService') private dataSourceService: DDBdataSourceService,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration,
        @inject('LambdaClient') private lambdaClient: LambdaClient
    ) {
        this.logger = loggerFactory.getLogger('RuleConfigHandler');
    }

    async handle(
        event: lambda.ScheduledEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: lambda.Context
    ): Promise<ServerlessResponse> {
        this.logger.info('lambda event', event);

        const ruleGroups = await this.dataSourceService.getRuleBundles();
        const triggerEvents = this.generateTriggerEvents(ruleGroups);

        const result = {} as ScheduleResult;
        type ScheduleResult = {
            succeeded: string[];
            failed: string[];
        };
        this.logger.info('triggerEvents', triggerEvents);
        const responses = await Promise.all(
            triggerEvents.map(async (triggerEvent) => {
                const input: InvokeCommandInput = {
                    FunctionName: this.appConfiguration.autoConfigFunctionName,
                    InvocationType: InvocationType.RequestResponse,
                    Payload: new TextEncoder().encode(JSON.stringify(triggerEvent)),
                };
                this.logger.info('request evaluating', triggerEvent);
                const invokeCmd = new InvokeCommand(input);
                return this.lambdaClient.send(invokeCmd);
            })
        );
        const allResponses = responses.map((r) => {
            const responseJson = JSON.parse(new TextDecoder().decode(r.Payload));
            this.logger.info('got response from remote  ', responseJson);
            return responseJson;
        });

        const allSuccessfulInvocations = allResponses
            .filter((rp) => rp.statusCode === 200)
            .map((rp) => {
                const jsonbody = JSON.parse(rp.body);
                return jsonbody.ruleBundleIds;
            })
            .flatMap((i) => i);
        this.logger.debug('successed invocation info', allSuccessfulInvocations);
        result.succeeded = allSuccessfulInvocations;

        const failed = allResponses
            .filter((rp) => rp.statusCode != 200)
            .map((rp) => JSON.parse(rp.body).ruleBundleIds)
            .flatMap((i) => i);
        result.failed = failed;
        this.logger.debug('processedResult info', result);
        const successfulInvocations = ruleGroups.filter((rg) =>
            result.succeeded.includes(rg.id)
        );
        this.logger.debug('recording info successedInvocations ', successfulInvocations);
        this.dataSourceService.updateRuleGroupTimeStamps(successfulInvocations);

        if (result.failed && result.failed.length > 0) {
            throw new Error(
                `Encounter error while evaluated rule bundles ${result.failed}`
            );
        }

        this.logger.info('invocation result', result);
        return ServerlessResponse.ofObject(200, result);
    }

    private generateTriggerEvents(ruleGroups: FlowRuleBundle[]) {
        const map = new Map<string, FlowRuleBundle[]>();
        ruleGroups.forEach((i) => {
            const ids = map.get(i.ruleGroupArn);
            if (!ids) {
                map.set(i.ruleGroupArn, [i]);
            } else {
                ids.push(i);
            }
        });
        this.logger.info('ruleGroups', ruleGroups);

        const allGroupIds = Array.from(map.values());
        return allGroupIds.map((rg) => ({
            ruleBundleIds: rg.map((x) => x.id),
        }));
    }
}
