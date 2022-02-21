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
//WARN, do not change this import due to how webpack imports modules
// as canary code will end up in cfn template, it would exceed the 1mb limit if import share_types as module
import { canaryTest, areEqual, TestCase } from "../../shared-types/src/canary";
export class FirewallConfigApiTest extends TestCase {
  @canaryTest()
  async getAuditLog(): Promise<void> {
    const response = await this.httpClient.get(
      `${this.apiUrl}audits/`,
      "execute-api"
    );

    areEqual(response.statusCode, 200);
  }

  @canaryTest()
  async getRuleBundles(): Promise<void> {
    const response = await this.httpClient.get(
      `${this.apiUrl}rulebundles/`,
      "execute-api"
    );

    areEqual(response.statusCode, 200);
  }

  @canaryTest()
  async getObjects(): Promise<void> {
    const response = await this.httpClient.get(
      `${this.apiUrl}objects/`,
      "execute-api"
    );

    areEqual(response.statusCode, 200);
  }
}
