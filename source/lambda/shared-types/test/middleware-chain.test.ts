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

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { MiddlewareChain, AsyncHandlerObj } from "src/middleware-chain";
import middy from "@middy/core";

describe("Middleware Chain tests", () => {
  test("requset send through, response received and middleware called", async () => {
    const response = { statusCode: 200, body: "Succeeded" };

    const handlerObj: AsyncHandlerObj<
      APIGatewayProxyEvent,
      APIGatewayProxyResult
    > = {
      handle: jest.fn().mockResolvedValueOnce(response),
    };

    const middleware = {
      before: jest.fn((_: middy.HandlerLambda, next: middy.NextFunction) =>
        next()
      ),
      after: jest.fn((_: middy.HandlerLambda, next: middy.NextFunction) =>
        next()
      ),
    };

    const middlewareChain = new MiddlewareChain(handlerObj, [middleware]);

    const event = {
      httpMethod: "GET",
      resource: "/test",
      body: "Test Text",
    } as APIGatewayProxyEvent;

    const result = await middlewareChain.lambdaHandler(
      event,
      {} as Context,
      jest.fn()
    );

    // check handler
    expect(handlerObj.handle).toBeCalledTimes(1);
    expect(result).toEqual(response);

    // check middleware
    expect(middleware.before).toBeCalledTimes(1);
    expect(middleware.before.mock.calls[0]![0].event).toEqual(event);
    expect(middleware.after).toBeCalledTimes(1);
    expect(middleware.after.mock.calls[0]![0].event).toEqual(event);
    expect(middleware.after.mock.calls[0]![0].response).toEqual(response);
  });
});
