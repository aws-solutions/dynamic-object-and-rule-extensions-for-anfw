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
import {
  ConfigServiceClient,
  SelectAggregateResourceConfigCommandOutput,
} from "@aws-sdk/client-config-service";
import "reflect-metadata";
import { FlowObject } from "src/FlowDefinitions";
import { StaticLoggerFactory } from "src/logger-factory";
import { LambdaObjectResolver } from "src/resolvers/objects/LambdaObjectResolver";
import { anything, instance, mock, resetCalls, when } from "ts-mockito";
import * as _ from "lodash";
describe("Test LambdaObjectResolver", () => {
  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
  const mockedAwsConfigClient = instance(awsConfigClient);
  const VALID_LAMBDA_REFERENCE: FlowObject = {
    id: "Lambda_demo",
    value: [
      {
        value: "lambda_value",
        key: "lambda_key_tag",
      },
    ],
    type: "Lambda",
  };
  let objectUnderTest: LambdaObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new LambdaObjectResolver(
      new StaticLoggerFactory(),
      mockedAwsConfigClient,
      "aggregator"
    );
  });

  test("should resolve lambda", () => {
    expect(objectUnderTest.canResolve(VALID_LAMBDA_REFERENCE)).toEqual(true);
  });

  test("should not resolve non lambda type object", () => {
    const tagged_ec2: FlowObject = {
      id: "EC2_Arn",
      type: "Tagged",
      value: [
        {
          key: "FF_TEST",
          value: "1",
        },
      ],
    };

    expect(objectUnderTest.canResolve(tagged_ec2)).toEqual(false);
  });

  test("should throw exception when record has been tampered", async () => {
    // in case someone directly modified the database, e.g someone changed the tag to {bla:""}
    const tampered_record = {
      ...VALID_LAMBDA_REFERENCE,
      value: [
        {
          bla: "",
        },
      ],
    };

    const resolvedObject = await objectUnderTest.resolve(tampered_record);
    expect(resolvedObject.addresses).toEqual([]);
    expect(resolvedObject.failureReasons).toEqual(["Invalid tag value"]);
  });

  test("should resolve to empty addresses when lambda not exists", async () => {
    const response: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [],
    };
    when(awsConfigClient.send(anything())).thenResolve(response);
    const VALID_LAMBDA_REFERENCE: FlowObject = {
      id: "Lambda_demo",
      value: [
        {
          value: "lambda_value",
          key: "lambda_key_tag",
        },
      ],
      type: "Lambda",
    };

    const resolvedObject = await objectUnderTest.resolve(
      VALID_LAMBDA_REFERENCE
    );

    expect(resolvedObject.addresses).toEqual([]);
  });

  test("should handle config return null in Result set", async () => {
    const response: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify(null),
        JSON.stringify({
          configuration: {
            vpcConfig: {
              securityGroupIds: ["sg-0453da42b9198532e"],
              subnetIds: [
                "subnet-06d5fd225d10e1fdc",
                "subnet-060e5385bb377923e",
              ],
            },
          },
        }),
      ],
    };

    const eniQueryResponse: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify(null),
        JSON.stringify({
          configuration: {
            privateIpAddress: "10.0.0.0",
          },
        }),
      ],
    };
    when(awsConfigClient.send(anything()))
      .thenResolve(response)
      .thenResolve(eniQueryResponse);
    const VALID_LAMBDA_REFERENCE: FlowObject = {
      id: "Lambda_demo",
      value: [
        {
          value: "lambda_value",
          key: "lambda_key_tag",
        },
      ],
      type: "Lambda",
    };

    const resolvedObject = await objectUnderTest.resolve(
      VALID_LAMBDA_REFERENCE
    );
    console.log("bla", resolvedObject.addresses);
    expect(resolvedObject.addresses).toEqual(["10.0.0.0"]);
  });
  //   test("should throw exception when lambda subnet not about to be located", () => {});
  //   test("should throw exception aws api remote error", () => {});
  test("should resolve to single ip", async () => {
    const response: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify({
          configuration: {
            vpcConfig: {
              securityGroupIds: ["sg-0453da42b9198532e"],
              subnetIds: ["subnet-06d5fd225d10e1fdc"],
            },
          },
        }),
      ],
    };

    const eniQueryResponse: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify({
          configuration: {
            privateIpAddress: "10.0.0.0",
          },
        }),
      ],
    };
    when(awsConfigClient.send(anything()))
      .thenResolve(response)
      .thenResolve(eniQueryResponse);
    const VALID_LAMBDA_REFERENCE: FlowObject = {
      id: "Lambda_demo",
      value: [
        {
          value: "lambda_value",
          key: "lambda_key_tag",
        },
      ],
      type: "Lambda",
    };

    const resolvedObject = await objectUnderTest.resolve(
      VALID_LAMBDA_REFERENCE
    );
    console.log("bla", resolvedObject.addresses);
    expect(resolvedObject.addresses).toEqual(["10.0.0.0"]);
  });

  test("should resolve to multiple ips", async () => {
    const response: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify({
          configuration: {
            vpcConfig: {
              securityGroupIds: ["sg-a"],
              subnetIds: ["subnet-b"],
            },
          },
        }),
        JSON.stringify({
          configuration: {
            vpcConfig: {
              securityGroupIds: ["sg-a"],
              subnetIds: ["subnet-1"],
            },
          },
        }),
      ],
    };

    const eniQueryResponse: SelectAggregateResourceConfigCommandOutput = {
      $metadata: {},
      Results: [
        JSON.stringify({
          configuration: {
            privateIpAddress: "10.0.0.0",
          },
        }),
        JSON.stringify({
          configuration: {
            privateIpAddress: "10.1.0.0",
          },
        }),
      ],
    };
    when(awsConfigClient.send(anything()))
      .thenResolve(response)
      .thenResolve(eniQueryResponse);
    const VALID_LAMBDA_REFERENCE: FlowObject = {
      id: "Lambda_demo",
      value: [
        {
          value: "lambda_value",
          key: "lambda_key_tag",
        },
      ],
      type: "Lambda",
    };

    const resolvedObject = await objectUnderTest.resolve(
      VALID_LAMBDA_REFERENCE
    );
    console.log("bla", resolvedObject.addresses);
    expect(resolvedObject.addresses).toEqual(["10.0.0.0", "10.1.0.0"]);
  });
});
