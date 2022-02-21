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
import { Ec2ObjectResolver } from "src/resolvers/objects/Ec2ObjectResolver";
import { anything, instance, mock, resetCalls, when } from "ts-mockito";

const EC2_OBJECT: FlowObject = {
  id: "EC2_Arn",
  type: "Arn",
  value: "arn:aws:ec2:ap-southeast-2:1000:instance/i-0a5bcc01670572c78",
};

const SG_OBJECT: FlowObject = {
  id: "EC2_Arn",
  type: "Arn",
  value: "arn:aws:ec2:ap-southeast-2:1000:security-group/sg-0517a9f2bb8487190",
};

describe("Test TargetDefinitionResolver", () => {
  // const applicationConfig: AppConfiguration = mock(AppConfiguration);
  // const mockedAppConfig = instance(applicationConfig);

  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
  const mockedAwsConfigClient = instance(awsConfigClient);

  let objectUnderTest: Ec2ObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new Ec2ObjectResolver(
      new StaticLoggerFactory(),
      mockedAwsConfigClient,
      ""
    );
  });
  describe("ec2 instance", () => {
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
              privateIpAddress: "10.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(EC2_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(EC2_OBJECT)).addresses).toEqual([
        "10.0.0.0",
      ]);
    });

    test("should resolve target type arn with multi ips", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "10.0.0.0",
            },
          }),
          JSON.stringify({
            configuration: {
              privateIpAddress: "20.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(EC2_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(EC2_OBJECT)).addresses).toEqual([
        "10.0.0.0",
        "20.0.0.0",
      ]);
    });

    test("should resolve target type arn with no result", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(EC2_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(EC2_OBJECT)).addresses).toEqual([]);
    });

    test("should not catch the reject", async () => {
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
      when(awsConfigClient.send(anything()))
        .thenReject(new Error("first call failed"))
        .thenResolve(response);

      expect(objectUnderTest.canResolve(EC2_OBJECT)).toEqual(true);

      // expect.assertions(2);
      try {
        await objectUnderTest.resolve(EC2_OBJECT);
      } catch (e) {
        expect(e).toEqual(new Error("first call failed"));
      }
      // expect(objectUnderTest.resolve(EC2_OBJECT)).rejects.toEqual(new Error('first call failed') )

      expect((await objectUnderTest.resolve(EC2_OBJECT)).addresses).toEqual([
        "10.0.0.0",
      ]);
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

  describe("ec2 security-group reference", () => {
    test("should resolve target type arn", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "20.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(SG_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(SG_OBJECT)).addresses).toEqual([
        "20.0.0.0",
      ]);
    });

    test("should resolve target type arn with multi ips", async () => {
      const response: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "10.0.0.1",
            },
          }),
          JSON.stringify({
            configuration: {
              privateIpAddress: "20.0.0.1",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything())).thenResolve(response);

      expect(objectUnderTest.canResolve(SG_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(SG_OBJECT)).addresses).toEqual([
        "10.0.0.1",
        "20.0.0.1",
      ]);
    });

    test("should return false when not resolve for this resolver", async () => {
      const unresolvableOject: FlowObject = {
        id: "SecurityGroup_Arn",
        type: "Address",
        // eks not supporting for this resolver
        value: "arn:aws:eks:ap-southeast-2:2000:cluster/opa-eks-cluster",
      };

      expect(objectUnderTest.canResolve(unresolvableOject)).toEqual(false);
    });
  });
});
