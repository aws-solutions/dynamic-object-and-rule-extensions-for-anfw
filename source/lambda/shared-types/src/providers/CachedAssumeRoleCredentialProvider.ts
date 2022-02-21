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
import { memoize } from "@aws-sdk/property-provider";
import { CredentialProvider } from "@aws-sdk/types";
import { CredentialProvider as MyCredentialProvider } from "./CredentialProvider";

export const createCachedAssumeRoleProvider = (
  region: string,
  role: string
) => {
  const providerFn: CredentialProvider = () =>
    new MyCredentialProvider(region).assumeRole(role);

  return memoize(
    providerFn,
    (credentials) =>
      credentials.expiration !== undefined &&
      credentials.expiration.getTime() - Date.now() < 300000,
    (credentials) => credentials.expiration !== undefined
  );
};
