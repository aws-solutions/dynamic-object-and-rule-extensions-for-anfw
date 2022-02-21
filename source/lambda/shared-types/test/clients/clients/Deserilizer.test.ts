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
import { parseBody } from "src/clients/deserilizer/Deserilizer";
describe("apjsb-aws-httpclient", () => {
  it("should deserilize stream body", async () => {
    const mockResponseBody = strToBuffer("mock response body");

    const result = await parseBody(mockResponseBody);

    expect(result).toBe("mock response body");
  });

  it("should handle empty stream body", async () => {
    const mockResponseBody = strToBuffer("");
    const result = await parseBody(mockResponseBody);
    expect(result.length).toBe(0);
  });
});

function strToBuffer(source: string) {
  const arrayBuffer = new ArrayBuffer(source.length * 1);
  const newUint = new Uint8Array(arrayBuffer);
  newUint.forEach((_, i) => {
    newUint[i] = source.charCodeAt(i);
  });
  return newUint;
}
