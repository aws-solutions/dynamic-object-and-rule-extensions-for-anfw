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
import "reflect-metadata";
import { FlowObject, FlowRuleBundle } from "src/FlowDefinitions";
import { StaticLoggerFactory } from "src/logger-factory";
import { ObjectDefinitionResolver } from "src/resolvers/ObjectDefinitionResolver";
import { AsgObjectResolver } from "src/resolvers/objects/AsgObjectResolver";
import { Ec2ObjectResolver } from "src/resolvers/objects/Ec2ObjectResolver";
import { NetworkObjectResolver } from "src/resolvers/objects/NetworkObjectResolver";
import { TaggedObjectResolver } from "src/resolvers/objects/TaggedObjectResolver";
import { anything, instance, mock, when } from "ts-mockito";

const TEST_OBJECT_1: FlowObject = {
  id: "SecurityGroup_Arn",
  type: "Arn",
  value: "arn:aws:ec2:ap-southeast-2:1000:security-group/sg-04990f6f47563a65f",
};

const TEST_OBJECT_2: FlowObject = {
  id: "Onprem_Server",
  type: "Address",
  value: "172.16.1.20",
};

const DEFAULT_RULEGROUP: FlowRuleBundle = {
  id: "rulegroup-1",
  ruleGroupArn: "arn",
  aggregatorName: "aggregator",
  version: 0,
  description: "test rule group",
  ownerGroup: ["admin", "app_owner_1"],
};

describe("Test TargetDefinitionResolver", () => {
  const ec2ObjectResolver: Ec2ObjectResolver = mock(Ec2ObjectResolver);
  const mockedEc2ObjectResolver = instance(ec2ObjectResolver);

  const networkObjectResolver: NetworkObjectResolver = mock(
    NetworkObjectResolver
  );
  const mockedNetworkObjectResolver = instance(networkObjectResolver);

  const asgObjectResolver: AsgObjectResolver = mock(AsgObjectResolver);
  const mockedAsgObjectResolver = instance(asgObjectResolver);

  const taggedObjectResolver: TaggedObjectResolver = mock(TaggedObjectResolver);
  const mockedTaggedObjectResolver = instance(taggedObjectResolver);

  const objectUnderTest = new ObjectDefinitionResolver(
    new StaticLoggerFactory(),
    mockedEc2ObjectResolver,
    mockedNetworkObjectResolver,
    mockedAsgObjectResolver,
    mockedTaggedObjectResolver
  );

  test("should use suitable resolver to resolve the target ojbect", async () => {
    when(ec2ObjectResolver.canResolve(anything())).thenReturn(true);
    when(ec2ObjectResolver.resolve(anything(), anything())).thenResolve({
      ...TEST_OBJECT_1,
      addresses: ["10.0.0.0"],
    });

    const result = await objectUnderTest.resolveTarget(
      TEST_OBJECT_1,
      DEFAULT_RULEGROUP
    );

    expect(result.id).toEqual("SecurityGroup_Arn");
    expect(result.addresses).toEqual(["10.0.0.0"]);
  });

  test("should return throw exception if no resolver found", async () => {
    when(ec2ObjectResolver.canResolve(anything())).thenReturn(false);

    await expect(
      objectUnderTest.resolveTarget(TEST_OBJECT_2, DEFAULT_RULEGROUP)
    ).rejects.toBeDefined();
  });
});
