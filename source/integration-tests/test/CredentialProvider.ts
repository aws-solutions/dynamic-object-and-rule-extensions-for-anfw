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
import AWS from "aws-sdk";

export class SwitchRoleRoleProvider {
  REG_IAM_ARN = /.*\S.[role]\/(.*)/;
  credentialsProvider: AWS.CredentialProviderChain;
  sts: AWS.STS;

  constructor(region: string) {
    this.credentialsProvider = new AWS.CredentialProviderChain();

    this.credentialsProvider.providers.push(
      new AWS.FileSystemCredentials("~/.aws/credentials")
    );
    this.credentialsProvider.providers.push(
      new AWS.EnvironmentCredentials("AWS")
    );
    this.sts = new AWS.STS({
      region: region,
      endpoint: `sts.${region}.amazonaws.com`,
    });
  }

  async assumeRole(roleNameArn: string): Promise<AWS.Credentials> {
    const match = roleNameArn.match(this.REG_IAM_ARN);
    if (!match || !match[1]) {
      throw new Error(`Invalid role arn ${roleNameArn}`);
    }
    const data = await this.sts
      .assumeRole({
        RoleArn: roleNameArn,
        RoleSessionName: match[1],
      })
      .promise();

    return new AWS.Credentials({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      accessKeyId: data.Credentials!.AccessKeyId,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secretAccessKey: data.Credentials!.SecretAccessKey,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sessionToken: data.Credentials!.SessionToken,
    });
  }

  async getCredential(): Promise<AWS.Credentials> {
    return await this.credentialsProvider.resolvePromise();
  }
}
