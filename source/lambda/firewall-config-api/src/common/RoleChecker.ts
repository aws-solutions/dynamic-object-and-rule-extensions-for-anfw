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
import { build, parse } from '@aws-sdk/util-arn-parser';
import { Logger, LoggerFactory } from 'shared_types';
import { inject, injectable } from 'tsyringe';
import { AppConfiguration } from './configuration/AppConfiguration';
import RuleConfigError from './RuleConfigError';
const STS_ROLE_REGEX = /(assumed-role)\/(.*)\/(.*)/;
@injectable()
export class RoleChecker {
    logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('AppConfiguration') private appConfiguration: AppConfiguration
    ) {
        this.logger = loggerFactory.getLogger('RoleChecker');
    }

    public extractRequestorAssumedRole(
        requestorIdentity: string,
        accountId: string
    ): string {
        const result = parse(requestorIdentity);
        const match = result.resource.match(STS_ROLE_REGEX);

        const roleName = match && match[2];

        const requestorAssumedRole = build({
            accountId: accountId,
            region: '',
            service: 'iam',
            resource: `role/${roleName}`,
        });
        this.logger.info(`requestorAssumedRole ${requestorAssumedRole}`);
        return requestorAssumedRole;
    }

    public isAdmin(requestorIdentity: string, accountId: string): boolean {
        try {
            const assumedRole = this.extractRequestorAssumedRole(
                requestorIdentity,
                accountId
            );
            return this.appConfiguration.adminRole === assumedRole;
        } catch (e) {
            throw new RuleConfigError(`Encounter error ${e}`, 500, false);
        }
    }
}
