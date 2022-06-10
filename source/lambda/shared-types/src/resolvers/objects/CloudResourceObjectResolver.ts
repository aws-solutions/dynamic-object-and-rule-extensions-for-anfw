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
  ConfigServiceClient,
  SelectAggregateResourceConfigCommand,
  SelectAggregateResourceConfigCommandInput,
} from "@aws-sdk/client-config-service";
import pMemoize from "p-memoize";
import {
  FlowObject,
  FlowRuleBundle,
  ResolvedFlowObject,
} from "../../FlowDefinitions";
import { Logger } from "../../logger-type";
import { ObjectResolver } from "./ObjectResolver";
import { CommonAddress } from "./Types";
export abstract class CloudResourceObjectResolver implements ObjectResolver {
  abstract canResolve(object: FlowObject): boolean;
  abstract resolve(
    object: FlowObject,
    ruleGroup?: FlowRuleBundle
  ): Promise<ResolvedFlowObject>;

  queryAwsConfig: (
    key: FlowRuleBundle | undefined,
    value: string | undefined
  ) => Promise<string[]>;

  constructor(
    protected configServiceClient: ConfigServiceClient,
    protected defaultAggregatorName?: string
  ) {
    this.queryAwsConfig = pMemoize(this.rawQueryAwsConfig, {
      maxAge: 1000 * 60,
      cacheKey: JSON.stringify,
      cachePromiseRejection: false,
    });
  }

  protected async rawQueryAwsConfig(
    ruleGroup: FlowRuleBundle | undefined,
    configAdvancedQueryString: string | undefined
  ): Promise<string[]> {
    let results: string[] = [];
    let nextToken;

    do {
      const params: SelectAggregateResourceConfigCommandInput = {
        ConfigurationAggregatorName:
          ruleGroup?.aggregatorName ?? this.defaultAggregatorName,
        Expression: configAdvancedQueryString,
      };
      const command = new SelectAggregateResourceConfigCommand(params);
      const response = await this.configServiceClient.send(command);
      nextToken = response.NextToken;
      results = results.concat(response.Results ?? []);
    } while (nextToken);
    return results;
  }

  protected parseResult(
    logger: Logger,
    data: string[],
    ruleObject: FlowObject
  ): ResolvedFlowObject {
    logger.info("resolveObject result", data);
    const results = data
      ?.map((r) => <CommonAddress>JSON.parse(r))
      .filter((i) => i);

    logger.info("resolveObject results", results);
    return {
      ...ruleObject,
      addresses:
        results?.map(
          (r) => r.configuration.privateIpAddress ?? r.configuration.cidrBlock
        ) ?? [],
    };
  }

  protected async parseRule(
    logger: Logger,
    ruleGroup: FlowRuleBundle | undefined,
    configAdvancedQueryString: string | undefined,
    ruleObject: FlowObject
  ): Promise<ResolvedFlowObject> {
    try {
      const data = await this.queryAwsConfig(
        ruleGroup,
        configAdvancedQueryString
      );
      return this.parseResult(logger, data, ruleObject);
    } catch (e) {
      logger.error("Encounter error while query for object", ruleObject, e);
      return {
        ...ruleObject,
        addresses: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        failureReasons: ["AwsConfigClient failed " + e.message],
      };
    }
  }
}
