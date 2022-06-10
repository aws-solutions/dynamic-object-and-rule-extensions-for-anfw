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
export type DefinitionSourceName = 'RULE' | 'OBJECT' | 'RULEBUNDLE' | 'AUDIT';

export interface DefinitionSource {
    name: DefinitionSourceName;
    tableName: string;
}

export class AppConfiguration {
    readonly applicationName: string;
    readonly defaultAggregatorName: string;
    readonly logLevel: string;
    readonly region: string;
    readonly definitionSources: DefinitionSource[];
    readonly adminRole: string;
    readonly applicationOwnerRoles: string[];
    readonly opaURL?: string;
    readonly defaultPolicySet: string[];
    readonly crossAccountConfigRoleArn?: string;
    readonly crossAccountNetworkFirewallReadWriteRoleArn?: string;
    readonly solutionId: string;
    readonly version: string;

    constructor(applicationName: string) {
        this.applicationName = applicationName;
        this.logLevel = process.env.LOG_LEVEL ?? 'debug';
        this.region = process.env.AWS_REGION ?? 'ap-southeast-2';
        this.defaultAggregatorName =
            process.env.DEFAULT_AGGREGATOR_NAME ?? 'DEFAULT_AGGREGATOR';
        this.adminRole = process.env.ADMINISTRATOR_ROLE ?? '';
        this.applicationOwnerRoles = process.env.APPLICATION_OWNER_ROLES
            ? process.env.APPLICATION_OWNER_ROLES.split(',')
            : [];
        this.opaURL = process.env.OPA_URL;
        this.defaultPolicySet = process.env.OPA_POLICY_LIST
            ? process.env.OPA_POLICY_LIST.split(',').map((p) => p && p.trim())
            : [];
        this.crossAccountConfigRoleArn =
            process.env.CROSS_ACCOUNT_CONFIG_ROLE ?? undefined;
        this.crossAccountNetworkFirewallReadWriteRoleArn =
            process.env.CROSS_ACCOUNT_ANFW_ROLE ?? undefined;
        this.solutionId = process.env.SOLUTION_ID ?? 'SO0196';
        this.version = process.env.VERSION ?? 'v1.1.0';
        this.definitionSources = [
            {
                name: 'RULE',
                tableName: process.env.RULES_TABLE_NAME ?? '',
            },
            {
                name: 'OBJECT',
                tableName: process.env.OBJECTS_TABLE_NAME ?? '',
            },
            {
                name: 'RULEBUNDLE',
                tableName: process.env.RULEBUNDLES_TABLE_NAME ?? '',
            },
            {
                name: 'AUDIT',
                tableName: process.env.AUDITS_TABLE_NAME ?? '',
            },
        ];
    }

    public getDefinitionSourceFor(
        name: DefinitionSourceName
    ): DefinitionSource | undefined {
        return this.definitionSources.find((d) => d.name === name);
    }
}
