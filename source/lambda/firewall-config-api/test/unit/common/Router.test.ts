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
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import 'reflect-metadata';
import { BasicHttpResponse } from 'shared_types';
import { AsyncHandlerObj } from 'shared_types/src/middleware-chain';
import { LoggingContext } from 'src/common/context-logging-middleware';
import { Router } from 'src/common/Router';
import { instance, mock } from 'ts-mockito';
import { container, DependencyContainer } from 'tsyringe';

class MockedHandler implements AsyncHandlerObj<APIGatewayProxyEvent, BasicHttpResponse> {
    handle(): Promise<BasicHttpResponse> {
        return new Promise((resolve) => resolve(BasicHttpResponse.ofString(200, '123')));
    }
}

describe('Router tests', () => {
    const router = new Router<BasicHttpResponse>();
    router.addRoute((e) => e.httpMethod === 'GET', MockedHandler);
    container.register<MockedHandler>('MockedHandler', { useClass: MockedHandler });

    test('can find and execute matching handler', async () => {
        // arrange
        const event = {
            httpMethod: 'GET',
        };

        // act
        const response = await router.handle(
            event as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(response).not.toBeUndefined();
        expect(response.statusCode).toBe(200);
    });

    test('returns 404 when no matching handler is found', async () => {
        // act
        const response = await router.handle(
            { httpMethod: 'POST' } as APIGatewayProxyEvent,
            {} as Context
        );

        // assert
        expect(response.statusCode).toBe(404);
    });

    test('use loggingContextContainer if provided in the lambda context', async () => {
        // arrange
        const mockedContainer = mock<DependencyContainer>();
        const spy = jest.spyOn(instance(mockedContainer), 'resolve');

        const context: LoggingContext = {
            loggingContextContainer: instance(mockedContainer),
        } as LoggingContext;

        // act
        const task = () =>
            router.handle({ httpMethod: 'GET' } as APIGatewayProxyEvent, context);

        // assert
        expect(task).toThrow();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
