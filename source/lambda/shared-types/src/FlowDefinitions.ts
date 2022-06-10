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
export const FLOW_TARGET_TYPES_STR = [
  "SinglePort",
  "Any",
  "PortRange",
] as const;

export type FlowPortType = typeof FLOW_TARGET_TYPES_STR[number];

export type FlowObjectType = "Address" | "Cidr" | "Arn" | "Tagged" | "Lambda";

export type FlowRuleProtocol = "tcp" | "udp" | "icmp";

export type FlowRuleStatus = "ACTIVE" | "PENDING" | "FAILED";

export type RuleOptionPair = { key: string; value?: string | number };

export interface FlowRule {
  id: string;
  version: number;
  lastUpdated?: string;
  protocol: FlowRuleProtocol;
  action: string;
  source: string;
  sourcePort: FlowRulePort;
  destination: string;
  destinationPort: FlowRulePort;
  ruleBundleId: string;
  suricataString?: string;
  status: FlowRuleStatus;
  failureReasons?: string[];
  optionFields?: RuleOptionPair[];
}

export interface FlowRuleBundle {
  id: string;
  version: number;
  ruleGroupArn: string;
  description: string;
  ownerGroup: string[];
  aggregatorName?: string;
}

export interface FlowRulePort {
  type: FlowPortType;
  value?: string;
}

export interface TaggedTargetValue {
  key: string;
  value: string;
}

export interface FlowObject {
  id: string;
  type: FlowObjectType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  createdBy?: string;
  lastUpdated?: string;
}

export interface ResolvedFlowRule {
  id: string;
  action: string;
  source: FlowObject;
  destination: FlowObject;
  suricataString?: string;
}

export interface ResolvedFlowObject extends FlowObject {
  addresses: string[];
  failureReasons?: string[];
}

export interface RuleApplicationResult {
  message: string;
  ruleBundleIds?: string[];
}

export type AuditChangeResult = "SUCCESS" | "REJECTED";

export type AuditChangeType = "CREATE" | "UPDATE" | "DELETE";

export interface FlowAudit {
  id: string;
  requestedBy: string;
  requestedTimestamp: string; //ISO time
  flowRuleGroupId?: string;
  flowRuleId?: string;
  flowTargetId?: string;
  requestedChange: {
    type: AuditChangeType;
    changeContent: {
      originalObject?: FlowRule | FlowObject;
      requestedObject: FlowRule | FlowObject;
    };
    changeResult: AuditChangeResult;
    reasonPhrase: string[];
  };
}
