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
import { PublishCommand, PublishCommandInput, SNSClient } from '@aws-sdk/client-sns';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { inject, injectable } from 'tsyringe';
import { FlowRule, Logger, LoggerFactory } from 'shared_types';
export interface RuleStatusMeta {
    ruleId: string;
    ruleBundleId?: string;
    status: string;
    reasonPhrease?: string[];
    // when creation validation failed the attemped rule needed to be logdged
    referenceRule?: FlowRule;
}

@injectable()
export class RuleStatusNotifier {
    ruleNotificationTopicArn: string;
    logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('SNSClient') private snsClient: SNSClient,
        @inject('AppConfiguration') appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('RuleStatusNotifier');

        this.ruleNotificationTopicArn = appConfiguration.ruleNotificationTopicArn;
    }

    public async notify(ruleSattus: RuleStatusMeta): Promise<void> {
        const now = new Date().toISOString();

        const messageContent = `At ${now} the rule ${ruleSattus.ruleId} failed in rule bundle ${ruleSattus.ruleBundleId} as ${ruleSattus.reasonPhrease}`;
        await this.sendNotification(messageContent);
    }

    public async sendNotification(messageContent: string): Promise<void> {
        const input: PublishCommandInput = {
            Message: messageContent,
            TopicArn: this.ruleNotificationTopicArn,
        };
        const command = new PublishCommand(input);
        try {
            this.logger.info(
                `Sending status update notification to ${this.ruleNotificationTopicArn} `
            );
            await this.snsClient.send(command);
        } catch (e) {
            this.logger.error('Error unable to send notification', e);
        }
    }
}
