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
  SelectAggregateResourceConfigCommandInput,
  SelectAggregateResourceConfigCommandOutput,
} from "@aws-sdk/client-config-service";
import "reflect-metadata";
import { FlowObject } from "src/FlowDefinitions";
import { StaticLoggerFactory } from "src/logger-factory";
import { TaggedObjectResolver } from "src/resolvers/objects/TaggedObjectResolver";
import {
  anything,
  capture,
  instance,
  mock,
  resetCalls,
  when,
} from "ts-mockito";

const TAGGED_OBJECT_1: FlowObject = {
  id: "EC2_Arn",
  type: "Tagged",
  value: [
    {
      key: "FF_TEST",
      value: "1",
    },
  ],
};

const TAGGED_OBJECT_2: FlowObject = {
  id: "EC2_Arn",
  type: "Tagged",
  value: [
    {
      key: "FF_TEST",
      value: "1",
    },
    {
      key: "FF_TEST_1",
      value: "a",
    },
  ],
};

describe("Test TaggedTargetResolver", () => {
  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
  const mockedAwsConfigClient = instance(awsConfigClient);

  let objectUnderTest: TaggedObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new TaggedObjectResolver(
      new StaticLoggerFactory(),
      mockedAwsConfigClient,
      ""
    );
  });
  describe("tagged instance", () => {
    test("should return false if not resolvable", async () => {
      expect(objectUnderTest.canResolve({ type: "Arn" } as FlowObject)).toEqual(
        false
      );
    });

    test("should return true if resolvable", async () => {
      expect(
        objectUnderTest.canResolve({ type: "Tagged" } as FlowObject)
      ).toEqual(true);
    });

    test("should resolve object type tagged", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "10.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      const result = await objectUnderTest.resolve(TAGGED_OBJECT_1);

      const captured = capture(awsConfigClient.send);
      const [sentCmd] = captured.last();
      expect(
        (<SelectAggregateResourceConfigCommandInput>sentCmd.input).Expression
      ).toEqual(
        "SELECT configuration.privateIpAddress, configuration.cidrBlock WHERE resourceType  in ('AWS::EC2::Instance','AWS::EC2::Subnet','AWS::EC2::VPC') AND tags.key = 'FF_TEST' AND tags.value = '1'"
      );

      expect(result.addresses).toEqual(["10.0.0.0"]);
    });

    test("should resolve object type tagged from VPC or subnet", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              cidrBlock: "10.0.0.0/16",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      const result = await objectUnderTest.resolve(TAGGED_OBJECT_1);

      const captured = capture(awsConfigClient.send);
      const [sentCmd] = captured.last();
      expect(
        (<SelectAggregateResourceConfigCommandInput>sentCmd.input).Expression
      ).toEqual(
        "SELECT configuration.privateIpAddress, configuration.cidrBlock WHERE resourceType  in ('AWS::EC2::Instance','AWS::EC2::Subnet','AWS::EC2::VPC') AND tags.key = 'FF_TEST' AND tags.value = '1'"
      );

      expect(result.addresses).toEqual(["10.0.0.0/16"]);
    });

    test("should resolve target type tagged with multiple tags", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "10.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      const result = await objectUnderTest.resolve(TAGGED_OBJECT_2);

      const captured = capture(awsConfigClient.send);
      const [sentCmd] = captured.last();
      expect(
        (<SelectAggregateResourceConfigCommandInput>sentCmd.input).Expression
      ).toEqual(
        "SELECT configuration.privateIpAddress, configuration.cidrBlock WHERE resourceType  in ('AWS::EC2::Instance','AWS::EC2::Subnet','AWS::EC2::VPC') AND tags.key = 'FF_TEST' AND tags.value = '1' AND tags.key = 'FF_TEST_1' AND tags.value = 'a'"
      );

      expect(result.addresses).toEqual(["10.0.0.0"]);
    });
  });
});
