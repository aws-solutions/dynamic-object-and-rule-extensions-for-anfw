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
import { CredentialProvider } from "./ApjsbAwsHttpclient";
import * as aws from "aws-sdk";

export class DefaultCredentialProvider implements CredentialProvider {
  private readonly credentialChain: aws.CredentialProviderChain;

  constructor() {
    this.credentialChain = new aws.CredentialProviderChain();
    this.credentialChain.providers.push(
      new aws.FileSystemCredentials("~/.aws/credentials")
    );
    this.credentialChain.providers.push(new aws.EnvironmentCredentials("AWS"));
  }

  getCredential(): Promise<aws.Credentials> {
    return this.credentialChain.resolvePromise();
  }
}
