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
import {
  ApjsbAwsHttpClient,
  createHttpClient,
} from "../../../shared-types/src/clients/ApjsbAwsHttpclient";

import { getFilteredProperties } from "./CanaryTestDecorator";
import { TestCase, TestCaseConstructor } from "./TestCase";
import { sleep } from "./TestCaseAssertion";
const synthetics = require("Synthetics");
const synthetics_log = require("SyntheticsLogger");
export interface CanaryFactoryProperty {
  testTargetApi: string;
  region: string;
  testCasesType: TestCaseConstructor<TestCase>[];
  waitBetweenTestsInMs?: number;
}

declare type CanaryFunction = () => Promise<string>;
export class CanaryFactory {
  httpClient: ApjsbAwsHttpClient;
  testCases: TestCase[];
  waitBetweenTestsInMs: number;
  constructor(props: CanaryFactoryProperty) {
    this.waitBetweenTestsInMs = props.waitBetweenTestsInMs ?? 0;
    this.httpClient = createHttpClient(props.region);
    this.testCases = props.testCasesType.map(
      (caseType) => new caseType(this.httpClient, props.testTargetApi)
    );
  }
  public createCanaryHandler(): CanaryFunction {
    const synConfig = synthetics.getConfiguration();

    const targetTestCases = this.testCases;
    const waitTime = this.waitBetweenTestsInMs;
    return async function handler(): Promise<string> {
      synConfig.enableReportingOptions();
      for (const testCase of targetTestCases) {
        const testMethod = getFilteredProperties(testCase);
        const allTestMethods = Object.keys(testMethod);
        for (const testMethod of allTestMethods) {
          synthetics_log.info("preparing to executing testcase", testMethod);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (testCase as any)[testMethod]();
        }
        if (waitTime > 0) {
          await sleep(waitTime);
        }
      }
      return "passed";
    };
  }
}
