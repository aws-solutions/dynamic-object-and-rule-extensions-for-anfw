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
import { streamCollector } from "@aws-sdk/node-http-handler";
import { toUtf8 } from "@aws-sdk/util-utf8-node";
/* eslint-disable @typescript-eslint/no-unused-vars */
// Collect low-level response body stream to Uint8Array.
const collectBody = (
  streamBody: unknown = new Uint8Array()
): Promise<Uint8Array> => {
  if (streamBody instanceof Uint8Array) {
    return Promise.resolve(streamBody);
  }
  return streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};

// Encode Uint8Array data into string with utf-8.
export const parseBody = (streamBody: unknown): Promise<string> =>
  collectBody(streamBody).then((body) => toUtf8(body));
