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
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { inject, injectable } from 'tsyringe';
const STS_ROLE_REGEX = /(assumed-role)\/(.*)\/(.*)/;

export type RuleGroupActionType = 'LIST' | 'UPDATE' | 'DELETE' | 'CREATE' | 'GET';

@injectable()
export class RuleGroupAuthenticationValidator {
    private readonly logger: Logger;
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RuleBundleDataSourceService')
        private ruleGroupDataSourceService: RuleBundleDataSourceService
    ) {
        this.logger = loggerFactory.getLogger('RuleGroupAuthenticationValidator');
    }

    public async checkRuleGroupAccess(
        requestorArn: string,
        ruleBundleId: string,
        requestingAccount: string,
        actionType: RuleGroupActionType
    ): Promise<ServerlessResponse | null> {
        const ruleGroup = await this.ruleGroupDataSourceService.getRuleBundleBy(
            ruleBundleId
        );
        if (!ruleGroup) {
            return ServerlessResponse.ofObject(404, {
                message: 'rule bundle not exists',
            });
        }
        const requestorIdentity = requestorArn;
        this.logger.debug(`${actionType} ruleGroups for ${requestorIdentity}`);
        const requestorAssumedRole = this.extractRequestorAssumedRole(
            requestorIdentity,
            requestingAccount
        );
        if (!ruleGroup.ownerGroup.includes(requestorAssumedRole)) {
            return ServerlessResponse.ofObject(403, {
                message: `User ${requestorIdentity} is not authorized to ${actionType} rules in group `,
            });
        }

        return null;
    }

    private extractRequestorAssumedRole(requestorIdentity: string, accountId: string) {
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
}
