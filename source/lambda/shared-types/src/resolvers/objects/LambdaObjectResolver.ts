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

type TagValuePair = { key: string; value: string };
type SubnetAndSecurityGroupPairIdExtractor = (
  c: SubnetAndSecurityGroupPair
) => string[];
type SubnetAndSecurityGroupPair = {
  configuration: {
    vpcConfig: {
      subnetIds: Array<string>;
      securityGroupIds: Array<string>;
    };
  };
};

export type EniRelationship = {
  relationshipName: string;
  resourceId: string;
  resourceType: string;
};

export type EniResourceMapping = {
  resourceId: string; //eni resource id
  relationships: Array<EniRelationship>;
};

export class LambdaObjectResolver extends CloudResourceObjectResolver {
  logger: Logger;
  constructor(
    loggerFactory: LoggerFactory,
    configServiceClient: ConfigServiceClient,
    defaultAggregatorName?: string
  ) {
    super(configServiceClient, defaultAggregatorName);
    this.logger = loggerFactory.getLogger("LambdaObjectResolver");
  }

  canResolve(ruleObject: FlowObject): boolean {
    return ruleObject.type === "Lambda";
  }

  async resolve(
    object: FlowObject,
    ruleGroup?: FlowRuleBundle
  ): Promise<ResolvedFlowObject> {
    const tagValues = <TaggedTargetValue[]>object.value;

    this.logger.info("parsed lambda tagValues", tagValues);
    if (!this.isValidTagValue(tagValues)) {
      return {
        ...object,
        addresses: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        failureReasons: ["Invalid tag value"],
      };
    }
    const tagsQueryString = tagValues
      .map((elm) => `tags.key = '${elm.key}' AND tags.value = '${elm.value}'`)
      .join(" AND ");

    const configAdvancedQueryString = `SELECT configuration.vpcConfig.subnetIds,configuration.vpcConfig.securityGroupIds WHERE  resourceType = 'AWS::Lambda::Function' AND ${tagsQueryString}`;

    this.logger.info(`configAdvancedQueryString ${configAdvancedQueryString}`);

    const results = await this.queryAwsConfig(
      ruleGroup,
      configAdvancedQueryString
    );

    this.logger.info("resolve target result", results);

    const subnetAndSecurityGroupPairs = results
      ?.map((r) => <SubnetAndSecurityGroupPair>JSON.parse(r))
      .filter((i) => i);

    this.logger.info(
      "resolved subnet/securityGroup ids",
      subnetAndSecurityGroupPairs
    );

    if (subnetAndSecurityGroupPairs?.length === 0) {
      this.logger.warn(
        "no lambda with in VPC matching the given tags",
        tagValues
      );
      return this.parseResult(this.logger, results, object);
    }

    const uniqueSecurityGroupSubQueryString = this.extractUniqueIds(
      subnetAndSecurityGroupPairs,
      (c) => c.configuration.vpcConfig.securityGroupIds
    );

    const uniqueSubnetIdsSubQueryString = this.extractUniqueIds(
      subnetAndSecurityGroupPairs,
      (c) => c.configuration.vpcConfig.subnetIds
    );

    const subQuery = `relationships.resourceId IN ('${uniqueSecurityGroupSubQueryString}') AND relationships.resourceId IN ('${uniqueSubnetIdsSubQueryString}')`;
    const matchingEniQueryString = `SELECT configuration.privateIpAddress WHERE resourceType = 'AWS::EC2::NetworkInterface'`;

    const matchingEniQueryFull = matchingEniQueryString + " AND " + subQuery;
    this.logger.info(`querying for matching eni ${matchingEniQueryFull}`);
    const matchingEniQueryResult = await this.queryAwsConfig(
      ruleGroup,
      matchingEniQueryFull
    );

    return this.parseResult(this.logger, matchingEniQueryResult, object);
  }

  private extractUniqueIds(
    subnetAndSecurityGroupPairs: SubnetAndSecurityGroupPair[] | undefined,
    extractorFn: SubnetAndSecurityGroupPairIdExtractor
  ) {
    const allSecurityGroupIds =
      subnetAndSecurityGroupPairs?.flatMap(extractorFn);
    return [...new Set(allSecurityGroupIds)].join("','");
  }

  private isBlank(input: string): boolean {
    return !input || /^\s*$/.test(input);
  }

  isValidTagValue(value: unknown): boolean {
    if (!Array.isArray(value)) {
      return false;
    }
    const listOfTags: TagValuePair[] = value as TagValuePair[];
    return listOfTags.some(
      (t) => !this.isBlank(t.key) && !this.isBlank(t.value)
    );
  }
}
