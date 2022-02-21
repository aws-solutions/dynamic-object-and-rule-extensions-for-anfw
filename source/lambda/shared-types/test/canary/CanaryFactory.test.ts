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
const enableReportingOptionsMockFn = jest.fn();
jest.mock("Synthetics", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getConfiguration: (): any => ({
    setConfig: () => {
      return 1;
    },
    enableReportingOptions: enableReportingOptionsMockFn,
  }),
}));
jest.mock("SyntheticsLogger", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (): any => 0,
}));
import { CanaryFactory } from "src/canary/CanaryFacotry";
import { DummyTestFailling } from "./DummyFailureTest";
import { DummyMultipleCasesTest } from "./DummyMultipleCasesTest";
import { DummyPassTest } from "./DummyPassTest";

describe("CanaryFactory", () => {
  beforeEach(() => {
    enableReportingOptionsMockFn.mockReset();
  });
  afterAll((done) => {
    done();
  });

  it("should raise exception for failing case", async () => {
    const objectUnderTest = new CanaryFactory({
      region: "ap-southeast-2",
      testTargetApi: "https://localhost",
      testCasesType: [DummyTestFailling],
      waitBetweenTestsInMs: 1000,
    });

    const canaryHandler = objectUnderTest.createCanaryHandler();

    await expect(canaryHandler()).rejects.toThrowError(
      "Expected ok but found not"
    );
  });

  it("should send return pass for happy case", async () => {
    const objectUnderTest = new CanaryFactory({
      region: "ap-southeast-2",
      testTargetApi: "https://localhost",
      testCasesType: [DummyPassTest],
      waitBetweenTestsInMs: 1000,
    });

    const canaryHandler = objectUnderTest.createCanaryHandler();

    expect(await canaryHandler()).toEqual("passed");
  });

  it("should raise exception if any case failed", async () => {
    const objectUnderTest = new CanaryFactory({
      region: "ap-southeast-2",
      testTargetApi: "https://localhost",
      testCasesType: [DummyPassTest, DummyTestFailling],
      waitBetweenTestsInMs: 1000,
    });

    const canaryHandler = objectUnderTest.createCanaryHandler();

    await expect(canaryHandler()).rejects.toThrowError(
      "Expected ok but found not"
    );
  });

  it("should run all test cases in a test class", async () => {
    const objectUnderTest = new CanaryFactory({
      region: "ap-southeast-2",
      testTargetApi: "https://localhost",
      testCasesType: [DummyMultipleCasesTest],
      waitBetweenTestsInMs: 1000,
    });

    const canaryHandler = objectUnderTest.createCanaryHandler();

    await expect(canaryHandler()).rejects.toThrowError(
      "Expected ok but found no-ok-muplti-last"
    );
  });

  it("should set Synthetics configure inside the context of handler", async () => {
    const objectUnderTest = new CanaryFactory({
      region: "ap-southeast-2",
      testTargetApi: "https://localhost",
      testCasesType: [DummyMultipleCasesTest],
      waitBetweenTestsInMs: 1000,
    });

    const canaryHandler = objectUnderTest.createCanaryHandler();

    // when only create handler no configure is set
    expect(enableReportingOptionsMockFn).not.toHaveBeenCalled();

    await expect(canaryHandler()).rejects.toThrowError(
      "Expected ok but found no-ok-muplti-last"
    );

    // when only create handler no configure is set
    expect(enableReportingOptionsMockFn).toHaveBeenCalled();
  });
});
