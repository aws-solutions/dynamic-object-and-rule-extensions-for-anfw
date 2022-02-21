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

import middy from '@middy/core';
import inputOutputLogger from '@middy/input-output-logger';
import { Context } from 'aws-lambda';
import 'reflect-metadata';
import { BasicHttpResponse } from 'shared_types';
import { LambdaHandler, MiddlewareChain } from 'shared_types/src/middleware-chain';
import { container, InjectionToken, singleton } from 'tsyringe';
import { AsyncRequestHandler } from './AsyncRequestHandler';
import { ServerlessResponse } from './ServerlessResponse';

@singleton()
export class RequestHandlerFactory {
    public create<T extends AsyncRequestHandler<TEvent, ServerlessResponse>, TEvent>(
        requestHandler: InjectionToken<T>,
        middlewares: middy.MiddlewareObject<TEvent, ServerlessResponse>[] = [
            inputOutputLogger(),
        ]
    ): LambdaHandler<TEvent, ServerlessResponse> {
        const requestHandlerInstance = container.resolve<T>(requestHandler);

        // BACKWARD-COMPATIBLE WORKAROUND:
        // this wrapper is only necessary for making the testing technique like below to work:
        //     KinesisStreamHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        // It is because that if middy is initialised with the function 'handle', changing what's in
        // the prototype will not change what middy calls any more, so this wrapper layer is needed
        // to allow test code to change the handle function in prototype for mocking.
        // A cleaner way is to setup a proper test container and register a mock class in the test container
        // so that when the lookup happens, it can resolve into the mock class instead the handler in original
        // class. Once it is in place, this wrapper layer should be removed
        const asyncHandlerObject = {
            handle: (event: TEvent, context: Context): Promise<ServerlessResponse> =>
                requestHandlerInstance.handle(event, context),
        } as T;

        return this.createWithInstance(asyncHandlerObject, middlewares);
    }

    // take an AsyncHandlerObject instance
    public createWithInstance<
        T extends AsyncRequestHandler<TEvent, ServerlessResponse>,
        TEvent
    >(
        requestHandlerInstance: T,
        middlewares: middy.MiddlewareObject<TEvent, ServerlessResponse>[]
    ): LambdaHandler<TEvent, ServerlessResponse> {
        // setup lambda handler
        return new MiddlewareChain<TEvent, BasicHttpResponse>(
            requestHandlerInstance,
            middlewares
        ).lambdaHandler;
    }
}
