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
export class Status {
    static COMPLIANT = 'COMPLIANT';
    static NON_COMPLIANT = 'NON_COMPLIANT';
    static UNKNOWN = 'UNKNOWN';
}

// Raw evaluation status for OPA policy
export enum OpaPolicyEvaluationStatus {
    // This is tied to opa policy implementation
    PASS = 'pass',
    FAIL = 'fail',
    UNKNOWN = 'unknown',
}

export interface ReasonPhrase {
    bundleName?: string;
    policyId: string;
    status: string;
    reason: string;
}

export interface PolicyDecisionResponse {
    status: string;
    timestamp: number;
    reasonPhrases?: Array<ReasonPhrase>;
}
