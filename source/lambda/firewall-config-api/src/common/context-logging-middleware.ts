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
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { DependencyContainer } from 'tsyringe';
import { LambdaLoggerFactory, LoggerFactory } from 'shared_types';

export function ContextLoggingMiddleware<TEvent, TResponse>(
    applicationName: string,
    rootContainer: DependencyContainer,
    runningLocally?: boolean,
    logLevel?: 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly',
    additionalMetadata?: {
        [key: string]: (event: APIGatewayProxyEvent, context: Context) => string;
    }
): middy.MiddlewareObject<TEvent, TResponse> {
    return {
        before: (handler: middy.HandlerLambda, next: middy.NextFunction): void => {
            /* istanbul ignore next */
            const logMetadata: {
                [key: string]: (event: APIGatewayProxyEvent, context: Context) => string;
            } = {
                ...additionalMetadata,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                applicationName: (_e, _c) => applicationName,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                resource: (e, _c) => e.resource,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                httpMethod: (e, _c) => e.httpMethod,
                awsRequestId: (_e, c) => c.awsRequestId,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                lambdaRequestId: (e, _c) => e.requestContext?.requestId,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'X-Amzn-Trace-Id': (event, _) =>
                    event.headers?.['X-Amzn-Trace-Id'] ?? 'n/a',
            };

            const loggerFactory = new LambdaLoggerFactory(
                handler.event,
                handler.context,
                runningLocally,
                logMetadata,
                logLevel
            );

            const loggingContextContainer = rootContainer.createChildContainer();
            loggingContextContainer.registerInstance<LoggerFactory>(
                'LoggerFactory',
                loggerFactory
            );
            const loggingContext: LoggingContext = {
                ...handler.context,
                loggingContextContainer,
            };

            handler.context = loggingContext;

            return next();
        },
        after: (handler: middy.HandlerLambda, next: middy.NextFunction): void => {
            (handler.context as LoggingContext).loggingContextContainer.clearInstances();
            return next();
        },
        onError: (handler: middy.HandlerLambda, next: middy.NextFunction): void => {
            (handler.context as LoggingContext).loggingContextContainer.clearInstances();
            return next();
        },
    };
}

export interface LoggingContext extends Context {
    loggingContextContainer: DependencyContainer;
}
