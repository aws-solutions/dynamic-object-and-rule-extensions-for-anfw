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
import {
  FlowObject,
  FlowRuleBundle,
  ResolvedFlowObject,
  TaggedTargetValue,
} from "../../FlowDefinitions";
import { LoggerFactory } from "../../logger-factory";
import { Logger } from "../../logger-type";
import { CloudResourceObjectResolver } from "./CloudResourceObjectResolver";
export class TaggedObjectResolver extends CloudResourceObjectResolver {
  SUPPORTED_RESOURCE_TYPES = [
    "AWS::EC2::Instance",
    "AWS::EC2::Subnet",
    "AWS::EC2::VPC",
  ];
  SUPPORTED_EC2_RESOURCE_REGX = /(security-group|instance)\/(.+)/;
  logger: Logger;

  supportedResourceTypeQuery: string;
  constructor(
    loggerFactory: LoggerFactory,

    configServiceClient: ConfigServiceClient,
    defaultAggregatorName?: string
  ) {
    super(configServiceClient, defaultAggregatorName);
    this.logger = loggerFactory.getLogger("TaggedObjectResolver");
    this.supportedResourceTypeQuery =
      "resourceType  in " +
      "('" +
      this.SUPPORTED_RESOURCE_TYPES.join("','") +
      "')";
  }

  canResolve(target: FlowObject): boolean {
    return target.type === "Tagged";
  }

  async resolve(
    object: FlowObject,
    ruleGroup?: FlowRuleBundle
  ): Promise<ResolvedFlowObject> {
    const tagValues = <TaggedTargetValue[]>object.value;
    const tagsQueryString = tagValues
      .map((elm) => `tags.key = '${elm.key}' AND tags.value = '${elm.value}'`)
      .join(" AND ");

    const configAdvancedQueryString = `SELECT configuration.privateIpAddress, configuration.cidrBlock WHERE ${this.supportedResourceTypeQuery} AND ${tagsQueryString}`;

    this.logger.info(`configAdvancedQueryString ${configAdvancedQueryString}`);

    const data = await this.queryAwsConfig(
      ruleGroup,
      configAdvancedQueryString
    );

    this.logger.info("resolve target result", data);

    return this.parseRule(
      this.logger,
      ruleGroup,
      configAdvancedQueryString,
      object
    );
  }
}
