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
import { ARN, parse } from "@aws-sdk/util-arn-parser";
import {
  FlowObject,
  FlowRuleBundle,
  ResolvedFlowObject,
} from "../../FlowDefinitions";
import { LoggerFactory } from "../../logger-factory";
import { Logger } from "../../logger-type";
import { CloudResourceObjectResolver } from "./CloudResourceObjectResolver";
import { ASGInstances, PrivateAddress } from "./Types";

export class AsgObjectResolver extends CloudResourceObjectResolver {
  logger: Logger;
  constructor(
    loggerFactory: LoggerFactory,
    configServiceClient: ConfigServiceClient,
    defaultAggregatorName?: string
  ) {
    super(configServiceClient, defaultAggregatorName);
    this.logger = loggerFactory.getLogger("AsgObjectResolver");
  }

  canResolve(object: FlowObject): boolean {
    if (object.type === "Arn") {
      const arn = parse(object.value);
      const canResolve = arn.service === "autoscaling";
      this.logger.info(`arn  is resolvable => ${canResolve}`, arn);
      return canResolve;
    } else {
      return false;
    }
  }

  async resolve(
    object: FlowObject,
    ruleGroup?: FlowRuleBundle
  ): Promise<ResolvedFlowObject> {
    const arn = parse(object.value);
    const results = await this.queryForASGInfo(object, ruleGroup);

    const allInstanceIds = results
      ?.flatMap((r) => r.configuration.instances)
      .map((i) => i.instanceId);
    const allInstancePriviteIps = await this.getAllInstanceIps(
      allInstanceIds,
      arn,
      ruleGroup
    );
    return {
      ...object,
      addresses:
        allInstancePriviteIps?.map((r) => r.configuration.privateIpAddress) ??
        [],
    };
  }

  private async queryForASGInfo(
    ruleObject: FlowObject,
    ruleGroup: FlowRuleBundle | undefined
  ) {
    const configAdvancedQueryString = `SELECT configuration.instances WHERE resourceType='AWS::AutoScaling::AutoScalingGroup' AND resourceId = '${ruleObject.value}'`;

    this.logger.info(`query for ASG ${configAdvancedQueryString}`);

    const data = await this.queryAwsConfig(
      ruleGroup,
      configAdvancedQueryString
    );
    // public or private
    const results = data?.map((r) => <ASGInstances>JSON.parse(r));

    this.logger.info("resolveObject results", results);
    return results;
  }

  private async getAllInstanceIps(
    allInstanceIds: string[] | undefined,
    arn: ARN,
    ruleGroup: FlowRuleBundle | undefined
  ) {
    const subQuery = "('" + allInstanceIds?.join("','") + "')";
    this.logger.info(`subQuery for instance ${subQuery}`);
    const queryForInstanceIps = `SELECT configuration.privateIpAddress WHERE resourceType = 'AWS::EC2::Instance' AND configuration.instanceId IN ${subQuery} AND accountId = ${arn.accountId} `;
    this.logger.info(`query for instance ${queryForInstanceIps}`);
    const associatedInstanceIpsData = await this.queryAwsConfig(
      ruleGroup,
      queryForInstanceIps
    );
    this.logger.info("query for instance response ", associatedInstanceIpsData);
    return associatedInstanceIpsData?.map((r) => <PrivateAddress>JSON.parse(r));
  }
}
