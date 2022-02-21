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

import { BasicHttpResponse, LoggerFactory } from 'shared_types';

import cors from '@middy/http-cors';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import 'reflect-metadata';
import {
    ContextLoggingMiddleware,
    LoggingContext,
} from 'src/common/context-logging-middleware';
import { LambdaHandler, MiddlewareChain } from 'shared_types/src/middleware-chain';
import ResponseFormatter from 'src/common/response-formatter';
import { container } from 'tsyringe';
import { AppConfiguration } from './configuration/AppConfiguration';
import { Router } from './Router';
import middy from '@middy/core';

export class MainHandler {
    readonly lambdaHandler: LambdaHandler<
        APIGatewayProxyEvent,
        BasicHttpResponse,
        Context
    >;
    constructor(router: Router<BasicHttpResponse>) {
        const appConfig = container.resolve<AppConfiguration>('AppConfiguration');
        // setup middlewares
        const middlewares = [
            ContextLoggingMiddleware<APIGatewayProxyEvent, BasicHttpResponse>(
                appConfig.applicationName,
                container,
                false
            ),
            ResponseFormatter<APIGatewayProxyEvent, BasicHttpResponse>(),
            errorLogger<APIGatewayProxyEvent, BasicHttpResponse>(),
            cors(),
        ];

        // main lambda handler
        this.lambdaHandler = new MiddlewareChain<APIGatewayProxyEvent, BasicHttpResponse>(
            router,
            middlewares
        ).lambdaHandler;
    }
}

function errorLogger<TEvent, TResponse>(): middy.MiddlewareObject<TEvent, TResponse> {
    return {
        onError: (handler: middy.HandlerLambda, next: middy.NextFunction): void => {
            const iocContainer =
                (handler.context as LoggingContext)?.loggingContextContainer ?? container;

            const logger = iocContainer
                .resolve<LoggerFactory>('LoggerFactory')
                .getLogger('ErrorLoggingMiddleware');

            logger.error('Error received - ', handler.error);

            return next();
        },
    };
}
