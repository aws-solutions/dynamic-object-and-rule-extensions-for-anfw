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
import { ConfigServiceClient } from "@aws-sdk/client-config-service";
import { StandardRetryStrategy } from "@aws-sdk/middleware-retry";
import AWSXRay from "aws-xray-sdk";
import { createCachedAssumeRoleProvider } from "../providers/CachedAssumeRoleCredentialProvider";
import { LoggerFactory } from "../logger-factory";
import {
  exponentialBackOffDelayDecider,
  getDefaultRetryQuota,
} from "../RetryStrategyConfiguration";
import { ObjectDefinitionResolver } from "./ObjectDefinitionResolver";
import { AsgObjectResolver } from "./objects/AsgObjectResolver";
import { Ec2ObjectResolver } from "./objects/Ec2ObjectResolver";
import { NetworkObjectResolver } from "./objects/NetworkObjectResolver";
import { SimpleObjectResolver } from "./objects/SimpleObjectResolver";
import { TaggedObjectResolver } from "./objects/TaggedObjectResolver";
import { LambdaObjectResolver } from "./objects/LambdaObjectResolver";

export class ObjectResolverFactory {
  private ec2ObjectResolver: Ec2ObjectResolver;
  private networkObjectResolver: NetworkObjectResolver;
  private asgObjectResolver: AsgObjectResolver;
  private taggedObjectResolver: TaggedObjectResolver;
  private configServiceClient: ConfigServiceClient;
  private simpleObjectResolver: SimpleObjectResolver;
  private lambdaObjectResolver: LambdaObjectResolver;
  constructor(
    private loggerFactory: LoggerFactory,
    region: string,
    defaultAggregator: string,
    crossAccountConfigRole?: string
  ) {
    const retryStrategy = new StandardRetryStrategy(() => Promise.resolve(10), {
      delayDecider: exponentialBackOffDelayDecider,
      retryQuota: getDefaultRetryQuota(1000, {
        retryCost: 1,
        timeoutRetryCost: 5,
      }),
    });
    if (crossAccountConfigRole) {
      const assumeRoleCredentialProvider = createCachedAssumeRoleProvider(
        region,
        crossAccountConfigRole
      );
      this.configServiceClient = AWSXRay.captureAWSv3Client(
        new ConfigServiceClient({
          region: region,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          credentialDefaultProvider: (_: any) => assumeRoleCredentialProvider,
          retryStrategy: retryStrategy,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any
      );
    } else {
      this.configServiceClient = AWSXRay.captureAWSv3Client(
        new ConfigServiceClient({
          region: region,
          retryStrategy: retryStrategy,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any
      );
    }

    this.ec2ObjectResolver = new Ec2ObjectResolver(
      loggerFactory,
      this.configServiceClient,
      defaultAggregator
    );
    this.networkObjectResolver = new NetworkObjectResolver(
      loggerFactory,
      this.configServiceClient,
      defaultAggregator
    );
    this.asgObjectResolver = new AsgObjectResolver(
      loggerFactory,
      this.configServiceClient,
      defaultAggregator
    );
    this.taggedObjectResolver = new TaggedObjectResolver(
      loggerFactory,
      this.configServiceClient,
      defaultAggregator
    );
    this.lambdaObjectResolver = new LambdaObjectResolver(
      loggerFactory,
      this.configServiceClient,
      defaultAggregator
    );
    this.simpleObjectResolver = new SimpleObjectResolver(loggerFactory);
  }

  createObjectDefinitionResolver(): ObjectDefinitionResolver {
    return new ObjectDefinitionResolver(
      this.loggerFactory,
      this.ec2ObjectResolver,
      this.networkObjectResolver,
      this.asgObjectResolver,
      this.taggedObjectResolver,
      this.simpleObjectResolver,
      this.lambdaObjectResolver
    );
  }
}
