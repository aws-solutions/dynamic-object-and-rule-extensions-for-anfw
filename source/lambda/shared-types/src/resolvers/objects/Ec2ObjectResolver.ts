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
export class Ec2ObjectResolver extends CloudResourceObjectResolver {
  SUPPORTED_EC2_RESOURCE_REGX = /(security-group|instance)\/(.+)/;
  logger: Logger;
  constructor(
    loggerFactory: LoggerFactory,
    configServiceClient: ConfigServiceClient,
    defaultAggregatorName?: string
  ) {
    super(configServiceClient, defaultAggregatorName);
    this.logger = loggerFactory.getLogger("Ec2ObjectResolver");
  }

  canResolve(ruleObject: FlowObject): boolean {
    if (ruleObject.type === "Arn") {
      const arn = parse(ruleObject.value);
      const match = arn.resource.match(this.SUPPORTED_EC2_RESOURCE_REGX);
      const canResolve =
        arn.service === "ec2" && match != null && match[1] != null;
      this.logger.info(`arn is resolvable => ${canResolve}`, arn);
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
    this.logger.info("parsed arn", arn);

    const match = arn.resource.match(this.SUPPORTED_EC2_RESOURCE_REGX);
    // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
    const configAdvancedQueryString = this.createQueryString(match!, arn);
    this.logger.info(`configAdvancedQueryString ${configAdvancedQueryString}`);
    const data = await this.queryAwsConfig(
      ruleGroup,
      configAdvancedQueryString
    );
    this.logger.info("parsed data", data);
    return this.parseResult(this.logger, data, object);
  }

  private createQueryString(match: RegExpMatchArray, arn: ARN) {
    let configAdvancedQueryString;
    const resourceId = match[2];
    this.logger.info(`query for type ${match[1]}`);
    switch (match[1]) {
      case "instance":
        configAdvancedQueryString = `SELECT configuration.privateIpAddress WHERE resourceType='AWS::EC2::Instance' AND configuration.instanceId = '${resourceId}' and accountId=${arn.accountId}`;
        break;
      case "security-group":
        configAdvancedQueryString = `SELECT configuration.privateIpAddress WHERE resourceType='AWS::EC2::Instance' AND  relationships.resourceId = '${resourceId}' and accountId=${arn.accountId}`;
        break;
    }

    this.logger.info(`configAdvancedQueryString ${configAdvancedQueryString}`);
    return configAdvancedQueryString;
  }
}
