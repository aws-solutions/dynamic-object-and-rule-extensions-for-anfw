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
import * as net from "net";
import {
  FlowObject,
  FlowRuleBundle,
  ResolvedFlowObject,
} from "../../FlowDefinitions";
import { LoggerFactory } from "../../logger-factory";
import { Logger } from "../../logger-type";
import { ObjectResolver } from "./ObjectResolver";

export class SimpleObjectResolver implements ObjectResolver {
  logger: Logger;
  IP_V4_CIDR_REGEX =
    /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
  IP_V6_CIDR_REGEX =
    /^s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:)))(%.+)?s*(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/;
  constructor(loggerFactory: LoggerFactory) {
    this.logger = loggerFactory.getLogger("SimpleObjectResolver");
  }

  canResolve(object: FlowObject): boolean {
    if (object.type === "Address") {
      if (this.isCidr(object.value)) {
        return true;
      }
      //https://nodejs.org/api/net.html#net_net_isip_input , where 0 invalid, 4 ipv4, 6 ipv6
      else if (net.isIP(object.value) === 0) {
        this.logger.error("Invalid ip address", object);
        return false;
      } else {
        return true;
      }
    } else {
      return false;
    }
  }

  async resolve(
    object: FlowObject,
    _ruleGroup?: FlowRuleBundle
  ): Promise<ResolvedFlowObject> {
    return { ...object, addresses: [object.value] };
  }

  isCidr(inputCidr: string) {
    if (!inputCidr) {
      return false;
    }
    if (
      inputCidr.match(this.IP_V4_CIDR_REGEX) ||
      inputCidr.match(this.IP_V6_CIDR_REGEX)
    ) {
      return true;
    } else {
      this.logger.info("Invalid cidr", inputCidr);
      return false;
    }
  }
}
