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
import { SdkError } from "@aws-sdk/smithy-client";
import { RetryQuota } from "@aws-sdk/middleware-retry";
export const RETRY_COST = 5;

/**
 * The total amount of retry tokens to be decremented from retry token balance
 * when a throttling error is encountered.
 */
export const TIMEOUT_RETRY_COST = 10;

/**
 * The total amount of retry token to be incremented from retry token balance
 * if an SDK operation invocation succeeds without requiring a retry request.
 */
export const NO_RETRY_INCREMENT = 1;

export interface DefaultRetryQuotaOptions {
  noRetryIncrement?: number;
  retryCost?: number;
  timeoutRetryCost?: number;
}

export const getDefaultRetryQuota = (
  initialRetryTokens: number,
  options?: DefaultRetryQuotaOptions
): RetryQuota => {
  const MAX_CAPACITY = initialRetryTokens;
  const noRetryIncrement = options?.noRetryIncrement ?? NO_RETRY_INCREMENT;
  const retryCost = options?.retryCost ?? RETRY_COST;
  const timeoutRetryCost = options?.timeoutRetryCost ?? TIMEOUT_RETRY_COST;

  let availableCapacity = initialRetryTokens;

  const getCapacityAmount = (error: SdkError) =>
    error.name === "TimeoutError" ? timeoutRetryCost : retryCost;

  const hasRetryTokens = (error: SdkError) =>
    getCapacityAmount(error) <= availableCapacity;

  const retrieveRetryTokens = (error: SdkError) => {
    console.log("availableCapacity", availableCapacity);
    if (!hasRetryTokens(error)) {
      // retryStrategy should stop retrying, and return last error
      throw new Error("No retry token available");
    }
    const capacityAmount = getCapacityAmount(error);
    availableCapacity -= capacityAmount;
    return capacityAmount;
  };

  const releaseRetryTokens = (capacityReleaseAmount?: number) => {
    availableCapacity += capacityReleaseAmount ?? noRetryIncrement;
    availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
  };

  return Object.freeze({
    hasRetryTokens,
    retrieveRetryTokens,
    releaseRetryTokens,
  });
};

const DEFAULT_WAIT_TIME = 1000;
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const exponentialBackOffDelayDecider = (_: number, attempts: number) => {
  console.log("wait attempts", attempts);

  let power = attempts;
  const jitter = Math.random() * 2 ** attempts * 100;
  if (attempts > 5) {
    power = 5;
  }
  const waitTime = Math.floor(
    Math.min(45 * 1000, Math.random() * 2 ** power * DEFAULT_WAIT_TIME) + jitter
  );
  console.log("wait time", waitTime);
  return waitTime;
};
