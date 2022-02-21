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
import { StaticLoggerFactory } from "index";
import "reflect-metadata";
import { AsgObjectResolver } from "src/resolvers/objects/AsgObjectResolver";
import {
  ASG_OBJECT,
  EC2_OBJECT,
  TAGGED_OBJECT,
} from "test/utils/TestObjectData";
import { anything, instance, mock, resetCalls, when } from "ts-mockito";

describe("Test AsgObjectResolver", () => {
  // const applicationConfig: AppConfiguration = mock(AppConfiguration);
  // const mockedAppConfig = instance(applicationConfig);

  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);
  const mockedAwsConfigClient = instance(awsConfigClient);

  let objectUnderTest: AsgObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new AsgObjectResolver(
      new StaticLoggerFactory(),
      mockedAwsConfigClient,
      ""
    );
  });
  describe("ags instance", () => {
    test("should return false if not resovlable", async () => {
      expect(objectUnderTest.canResolve(EC2_OBJECT)).toEqual(false);
    });

    test("should return false if not resovlable type", async () => {
      expect(objectUnderTest.canResolve(TAGGED_OBJECT)).toEqual(false);
    });

    test("should return true if sovlable", async () => {
      expect(objectUnderTest.canResolve(ASG_OBJECT)).toEqual(true);
    });

    test("should resolve ec2 instance ip from the asg", async () => {
      const asgInfoRsp: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              instances: [
                {
                  lifecycleState: "InService",
                  instanceId: "i-0ee90e8363c868372",
                  healthStatus: "Healthy",
                  instanceType: "t1.micro",
                  launchTemplate: {
                    launchTemplateId: "lt-0f6d48f7789a1a3b0",
                    version: "1",
                    launchTemplateName: "test-ags-template",
                  },
                  protectedFromScaleIn: false,
                  availabilityZone: "ap-southeast-2b",
                },
              ],
            },
          }),
        ],
      };
      const instanceIpRsp: SelectAggregateResourceConfigCommandOutput = {
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
        .thenResolve(asgInfoRsp)
        .thenResolve(instanceIpRsp);

      expect(objectUnderTest.canResolve(ASG_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(ASG_OBJECT)).addresses).toEqual([
        "10.0.0.0",
      ]);
    });
    test("should resolve ec2 instance ips from the asg", async () => {
      const asgInfoRsp: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              instances: [
                {
                  lifecycleState: "InService",
                  instanceId: "i-0ee90e8363c868372",
                  healthStatus: "Healthy",
                  instanceType: "t1.micro",
                  launchTemplate: {
                    launchTemplateId: "lt-0f6d48f7789a1a3b0",
                    version: "1",
                    launchTemplateName: "test-ags-template",
                  },
                  protectedFromScaleIn: false,
                  availabilityZone: "ap-southeast-2b",
                },
                {
                  lifecycleState: "InService",
                  instanceId: "i-0ee90e8363c868373",
                  healthStatus: "Healthy",
                  instanceType: "t1.micro",
                  launchTemplate: {
                    launchTemplateId: "lt-0f6d48f7789a1a3b0",
                    version: "1",
                    launchTemplateName: "test-ags-template",
                  },
                  protectedFromScaleIn: false,
                  availabilityZone: "ap-southeast-2b",
                },
              ],
            },
          }),
        ],
      };
      const instanceIpRsp: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              privateIpAddress: "10.0.0.0",
            },
          }),
          JSON.stringify({
            configuration: {
              privateIpAddress: "11.0.0.0",
            },
          }),
        ],
      };
      when(awsConfigClient.send(anything()))
        .thenResolve(asgInfoRsp)
        .thenResolve(instanceIpRsp);

      expect(objectUnderTest.canResolve(ASG_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(ASG_OBJECT)).addresses).toEqual([
        "10.0.0.0",
        "11.0.0.0",
      ]);
    });

    test("should resolve to empty address when no instance found", async () => {
      const asgInfoRsp: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [
          JSON.stringify({
            configuration: {
              instances: [
                {
                  lifecycleState: "InService",
                  instanceId: "i-0ee90e8363c868372",
                  healthStatus: "Healthy",
                  instanceType: "t1.micro",
                  launchTemplate: {
                    launchTemplateId: "lt-0f6d48f7789a1a3b0",
                    version: "1",
                    launchTemplateName: "test-ags-template",
                  },
                  protectedFromScaleIn: false,
                  availabilityZone: "ap-southeast-2b",
                },
                {
                  lifecycleState: "InService",
                  instanceId: "i-0ee90e8363c868373",
                  healthStatus: "Healthy",
                  instanceType: "t1.micro",
                  launchTemplate: {
                    launchTemplateId: "lt-0f6d48f7789a1a3b0",
                    version: "1",
                    launchTemplateName: "test-ags-template",
                  },
                  protectedFromScaleIn: false,
                  availabilityZone: "ap-southeast-2b",
                },
              ],
            },
          }),
        ],
      };
      const instanceIpRsp: SelectAggregateResourceConfigCommandOutput = {
        $metadata: {},
        Results: [],
      };
      when(awsConfigClient.send(anything()))
        .thenResolve(asgInfoRsp)
        .thenResolve(instanceIpRsp);

      expect(objectUnderTest.canResolve(ASG_OBJECT)).toEqual(true);

      expect((await objectUnderTest.resolve(ASG_OBJECT)).addresses).toEqual([]);
    });
  });
});
