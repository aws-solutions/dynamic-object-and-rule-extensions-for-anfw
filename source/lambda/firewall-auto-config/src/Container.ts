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

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { NetworkFirewallClient } from '@aws-sdk/client-network-firewall';
import { SNSClient } from '@aws-sdk/client-sns';
import AWSXRay from 'aws-xray-sdk';
import https from 'https';
import {
    createCustomerAgent,
    CredentialProvider,
    LoggerFactory,
    ObjectDefinitionResolver,
    ObjectResolverFactory,
    StaticLoggerFactory,
} from 'shared_types';
import { container } from 'tsyringe';
import { AppConfiguration } from './common/configuration/AppConfiguration';
import { RuleConfigHandler } from './handlers/RuleConfigHandler';
import { RuleDefinitionResolver } from './resolvers/RuleDefinitionResolver';
import { DDBdataSourceService } from './service/DDBdataSourceService';
import { RuleStatusNotifier } from './service/RuleStatusNotifier';
import { RuleUpdater } from './service/RuleUpdater';

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
    container.register<RuleConfigHandler>('RuleConfigHandler', {
        useClass: RuleConfigHandler,
    });

    container.register<DDBdataSourceService>('DDBdataSourceService', {
        useClass: DDBdataSourceService,
    });

    container.register<RuleDefinitionResolver>('DefinitionResolver', {
        useClass: RuleDefinitionResolver,
    });
    const userAgent = createCustomerAgent(
        appConfiguration.solutionId,
        appConfiguration.version
    );

    container.register<DynamoDBClient>('DynamoDBClient', {
        useValue: AWSXRay.captureAWSv3Client(
            new DynamoDBClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any
        ),
    });

    container.register<SNSClient>('SNSClient', {
        useValue: AWSXRay.captureAWSv3Client(
            new SNSClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any
        ),
    });

    container.register<NetworkFirewallClient>('NetworkFirewallClient', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useValue: AWSXRay.captureAWSv3Client(
            new NetworkFirewallClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                ...(crossAccountAnfwRole && {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    credentialDefaultProvider: (_: any) => () =>
                        new CredentialProvider(region).assumeRole(crossAccountAnfwRole),
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any
        ),
    });

    container.register<RuleUpdater>('RuleUpdater', {
        useClass: RuleUpdater,
    });

    container.register<RuleStatusNotifier>('RuleStatusNotifier', {
        useClass: RuleStatusNotifier,
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
