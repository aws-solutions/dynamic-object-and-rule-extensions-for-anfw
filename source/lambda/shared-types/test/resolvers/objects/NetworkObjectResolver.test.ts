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
import { NetworkObjectResolver } from "src/resolvers/objects/NetworkObjectResolver";
import { SUBNET_OBJECT, VPC_OBJECT } from "test/utils/TestObjectData";
import { anything, instance, mock, resetCalls, when } from "ts-mockito";

describe("Test NetworkObjectResolver", () => {
  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
  const mockedAwsConfigClient = instance(awsConfigClient);

  let objectUnderTest: NetworkObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new NetworkObjectResolver(
      new StaticLoggerFactory(),
      mockedAwsConfigClient,
      ""
    );
  });
  describe("vpc instance", () => {
    test("should return false if not resolvable", async () => {
      expect(
        objectUnderTest.canResolve({ type: "Tagged" } as FlowObject)
      ).toEqual(false);
    });

    test("should resolve target type arn", async () => {
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

      expect(objectUnderTest.canResolve(VPC_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(VPC_OBJECT)).addresses).toEqual([
        "10.0.0.0/16",
      ]);
    });

    test("should set failureReasons when unresovable error happens", async () => {
      when(awsConfigClient.send(anything())).thenReject(
        new Error("network issue")
      );

      const resolvedObject = await objectUnderTest.resolve(VPC_OBJECT);
      expect(resolvedObject.addresses).toEqual([]);
      expect(resolvedObject.failureReasons).toEqual([
        "AwsConfigClient failed network issue",
      ]);
    });

    test("should resolve object type arn with no result", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(VPC_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(VPC_OBJECT)).addresses).toEqual([]);
    });

    test("should return false when not resolve for this resolver", async () => {
      const unresolvableOject: FlowObject = {
        id: "SecurityGroup_Arn",
        type: "Arn",
        // eks not supporting for this resolver
        value: "arn:aws:eks:ap-southeast-2:2000:cluster/opa-eks-cluster",
      };

      expect(objectUnderTest.canResolve(unresolvableOject)).toEqual(false);
    });
  });

  describe("ec2 subnet reference", () => {
    test("should resolve object type arn", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              cidrBlock: "20.0.0.0/24",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(SUBNET_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(SUBNET_OBJECT)).addresses).toEqual([
        "20.0.0.0/24",
      ]);
    });
  });
});
