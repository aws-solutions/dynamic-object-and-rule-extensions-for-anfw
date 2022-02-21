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

import { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { NetworkFirewallClient } from '@aws-sdk/client-network-firewall';
import { StandardRetryStrategy } from '@aws-sdk/middleware-retry';
import AWSXRay from 'aws-xray-sdk';
import https from 'https';
import {
    ApjsbAwsHttpClient,
    createCustomerAgent,
    CredentialProvider,
    exponentialBackOffDelayDecider,
    getDefaultRetryQuota,
    LoggerFactory,
    ObjectDefinitionResolver,
    ObjectResolverFactory,
    StaticLoggerFactory,
} from 'shared_types';
import { container } from 'tsyringe';
import { AppConfiguration } from './common/configuration/AppConfiguration';
import { RoleChecker } from './common/RoleChecker';
import { GetRuleConfigHandler } from './handlers/rulebundles/GetRuleBundleHandler';
import { AuditsDataSourceService } from './service/AuditsDataSourceService';
import { ObjectsDataSourceService } from './service/ObjectsDataSourceService';
import { OpaPolicyService } from './service/OpaPolicyService';
import { RuleBundleDataSourceService } from './service/RuleBundleDataSourceService';
import { RulesDataSourceService } from './service/RulesDataSourceService';
import { CreateObjectInputValidator } from './validators/CreateObjectInputValidator';
import { CreateRuleBundleInputValidator } from './validators/CreateRuleBundleInputValidator';
import { CreateRuleInputValidator } from './validators/CreateRuletInputValidator';
import { GeneralRuleBundleInputValidator } from './validators/GeneralRuleBundleInputValidator';
import { RuleGroupAuthenticationValidator } from './validators/RuleGroupAuthenticationValidator';
import { UpdateRuleBundleInputValidator } from './validators/UpdateRuleBundleInputValidator';

export function setupContainer(): void {
    // configuration
    const appConfiguration = new AppConfiguration('AutoConfig');
    const region = appConfiguration.region;
    const crossAccountAnfwRole =
        appConfiguration.crossAccountNetworkFirewallReadWriteRoleArn;

    container.register<AppConfiguration>('AppConfiguration', {
        useValue: appConfiguration,
    });
    // Capture all outgoing https requests
    AWSXRay.captureHTTPsGlobal(https, true);

    // Set XRay Logger
    AWSXRay.setLogger(new StaticLoggerFactory().getLogger('awsXray', 'debug'));

    container.register<LoggerFactory>('LoggerFactory', {
        useValue: new StaticLoggerFactory(),
    });
    // handlers
    container.register<GetRuleConfigHandler>('GetRuleConfigHandler', {
        useClass: GetRuleConfigHandler,
    });

    container.register<RuleBundleDataSourceService>('RuleBundleDataSourceService', {
        useClass: RuleBundleDataSourceService,
    });
    const userAgent = createCustomerAgent(
        appConfiguration.solutionId,
        appConfiguration.version
    );

    container.register<ConfigServiceClient>('ConfigServiceClient', {
        useValue: new ConfigServiceClient({
            region: appConfiguration.region,
            customUserAgent: userAgent,
            retryStrategy: new StandardRetryStrategy(() => Promise.resolve(10), {
                delayDecider: exponentialBackOffDelayDecider,
                retryQuota: getDefaultRetryQuota(1000, {
                    retryCost: 1,
                    timeoutRetryCost: 5,
                }),
            }),
        }),
    });

    container.register<NetworkFirewallClient>('NetworkFirewallClient', {
        useValue: AWSXRay.captureAWSv3Client(
            new NetworkFirewallClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                ...(crossAccountAnfwRole && {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    credentialDefaultProvider: (_: any) => () =>
                        new CredentialProvider(region).assumeRole(crossAccountAnfwRole),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }),
            }) as any
        ),
    });

    container.register<DynamoDBClient>('DynamoDBClient', {
        useValue: AWSXRay.captureAWSv3Client(
            new DynamoDBClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any
        ),
    });

    container.register<GeneralRuleBundleInputValidator>(
        'GeneralRuleBundleInputValidator',
        {
            useClass: GeneralRuleBundleInputValidator,
        }
    );

    container.register<CreateRuleBundleInputValidator>('CreateRuleBundleInputValidator', {
        useClass: CreateRuleBundleInputValidator,
    });

    container.register<UpdateRuleBundleInputValidator>('UpdateRuleBundleInputValidator', {
        useClass: UpdateRuleBundleInputValidator,
    });

    container.register<ObjectsDataSourceService>('ObjectsDataSourceService', {
        useClass: ObjectsDataSourceService,
    });

    container.register<RulesDataSourceService>('RulesDataSourceService', {
        useClass: RulesDataSourceService,
    });

    container.register<CreateRuleInputValidator>('CreateRuleInputValidator', {
        useClass: CreateRuleInputValidator,
    });

    container.register<AuditsDataSourceService>('AuditsDataSourceService', {
        useClass: AuditsDataSourceService,
    });

    container.register<CreateObjectInputValidator>('CreateObjectInputValidator', {
        useClass: CreateObjectInputValidator,
    });

    container.register<RuleGroupAuthenticationValidator>(
        'RuleGroupAuthenticationValidator',
        {
            useClass: RuleGroupAuthenticationValidator,
        }
    );

    container.register<RoleChecker>('RoleChecker', {
        useClass: RoleChecker,
    });

    const agent = new https.Agent({
        rejectUnauthorized: false,
    });
    const credentialProvider = new CredentialProvider(appConfiguration.region);
    const httpClient = new ApjsbAwsHttpClient(
        credentialProvider,
        appConfiguration.region,
        agent
    );
    container.register<ApjsbAwsHttpClient>('ApjsbAwsHttpClient', {
        useValue: httpClient,
    });

    container.register<OpaPolicyService>('OpaPolicyService', {
        useClass: OpaPolicyService,
    });

    const loggerFactory = container.resolve<LoggerFactory>('LoggerFactory');
    const defaultAggregatorName = appConfiguration.defaultAggregatorName;

    const factory = new ObjectResolverFactory(
        loggerFactory,
        appConfiguration.region,
        defaultAggregatorName,
        appConfiguration.crossAccountConfigRoleArn
    );

    container.register<ObjectDefinitionResolver>('ObjectDefinitionResolver', {
        useValue: factory.createObjectDefinitionResolver(),
    });
}
