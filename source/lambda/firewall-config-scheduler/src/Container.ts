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
import { LambdaClient } from '@aws-sdk/client-lambda';
import AWSXRay from 'aws-xray-sdk';
import https from 'https';
import { createCustomerAgent, LoggerFactory, StaticLoggerFactory } from 'shared_types';
import { container } from 'tsyringe';
import { AppConfiguration } from './common/configuration/AppConfiguration';
import { RuleConfigScheduler } from './handlers/RuleConfigScheduler';
import { DDBdataSourceService } from './service/DDBdataSourceService';

export function setupContainer(): void {
    // configuration
    const appConfiguration = new AppConfiguration('AutoConfig');

    container.register<AppConfiguration>('AppConfiguration', {
        useValue: appConfiguration,
    });
    // Capture all outgoing https requests
    AWSXRay.captureHTTPsGlobal(https, true);

    // Set XRay Logger
    AWSXRay.setLogger(new StaticLoggerFactory().getLogger('awsXray'));

    container.register<LoggerFactory>('LoggerFactory', {
        useValue: new StaticLoggerFactory(),
    });
    // handlers
    container.register<RuleConfigScheduler>('RuleConfigScheduler', {
        useClass: RuleConfigScheduler,
    });

    container.register<DDBdataSourceService>('DDBdataSourceService', {
        useClass: DDBdataSourceService,
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

    container.register<LambdaClient>('LambdaClient', {
        useValue: AWSXRay.captureAWSv3Client(
            new LambdaClient({
                region: appConfiguration.region,
                customUserAgent: userAgent,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any
        ),
    });
}
