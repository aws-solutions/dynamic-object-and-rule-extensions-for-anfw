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
import { ConfigServiceClient } from "@aws-sdk/client-config-service";
import "reflect-metadata";
import { FlowObject } from "src/FlowDefinitions";
import { StaticLoggerFactory } from "src/logger-factory";
import { SimpleObjectResolver } from "src/resolvers/objects/SimpleObjectResolver";
import { mock, resetCalls } from "ts-mockito";

describe("Test SimpleTargetResolver", () => {
  const awsConfigClient: ConfigServiceClient = mock(ConfigServiceClient);

  let objectUnderTest: SimpleObjectResolver;

  beforeEach(() => {
    resetCalls(awsConfigClient);
    objectUnderTest = new SimpleObjectResolver(new StaticLoggerFactory());
  });
  describe("simple address", () => {
    test("should return false if not resolvable", async () => {
      expect(objectUnderTest.canResolve({ type: "Arn" } as FlowObject)).toEqual(
        false
      );
    });

    test("should return false if not resolvable invalid type string", async () => {
      expect(
        objectUnderTest.canResolve({ type: "Arn1" } as unknown as FlowObject)
      ).toEqual(false);
    });

    test("should return false if not resolvable invalid address ", async () => {
      expect(
        objectUnderTest.canResolve({
          type: "Address",
          value: "not ip",
        } as FlowObject)
      ).toEqual(false);
    });

    test("should return true if resolvable", async () => {
      expect(
        objectUnderTest.canResolve({
          type: "Address",
          value: "192.168.1.1",
        } as FlowObject)
      ).toEqual(true);
    });

    test("should return true if resolvable cider", async () => {
      expect(
        objectUnderTest.canResolve({
          type: "Address",
          value: "192.0.2.0/24",
        } as FlowObject)
      ).toEqual(true);
    });

    test("should get address", async () => {
      const resolvedObject = await objectUnderTest.resolve({
        type: "Address",
        value: "192.168.1.1",
      } as FlowObject);
      expect(resolvedObject.addresses).toEqual(["192.168.1.1"]);
    });
  });
});
