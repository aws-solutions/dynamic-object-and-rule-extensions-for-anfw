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
import * as awsmock from "aws-sdk-mock";
import "reflect-metadata";
import { CredentialProvider } from "src/providers/CredentialProvider";

const AWS = require("aws-sdk");
const DEFAULT_ROLE = "arn:aws:iam::100000:role/AgsCiArtifactReadOnlyRole";

describe("Test CredentialProvider", () => {
  const ORIGINAL_ENV = process.env;
  awsmock.setSDKInstance(AWS);
  awsmock.mock("STS", "assumeRole", {
    Credentials: {
      SessionToken: "token",
      SecretAccessKey: "key",
      AccessKeyId: "keyID",
    },
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

    process.env.AWS_SECRET_ACCESS_KEY =
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    process.env.AWS_SESSION_TOKEN = "faketoken";
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });
  const objectUnderTest = new CredentialProvider("ap-southeast-2");

  test("should assume role", async () => {
    const credential = await objectUnderTest.assumeRole(DEFAULT_ROLE);

    expect(credential.sessionToken).toEqual("token");
  });

  test("should get credential", async () => {
    await objectUnderTest.getCredential();
  });
});
