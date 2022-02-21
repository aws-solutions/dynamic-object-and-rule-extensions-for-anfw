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
import { HttpResponse } from "@aws-sdk/types";
import { readFileSync } from "fs";
import {
  createServer as createHttpServer,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from "http";
import { createServer as createHttp2Server, Http2Server } from "http2";
import {
  createServer as createHttpsServer,
  Server as HttpsServer,
} from "https";
import { join } from "path";
import { Readable } from "stream";

export const CERTS_DIR = join(__dirname, "certs");

export function createResponseFunction(
  httpResp: HttpResponse
): (incomingMessage: IncomingMessage, response: ServerResponse) => void {
  return function (_: IncomingMessage, response: ServerResponse): void {
    response.statusCode = httpResp.statusCode;
    for (const name of Object.keys(httpResp.headers)) {
      const values = httpResp.headers[name];
      response.setHeader(name, values);
    }
    if (httpResp.body instanceof Readable) {
      httpResp.body.pipe(response);
    } else {
      response.end(httpResp.body);
    }
  };
}

export function createContinueResponseFunction(httpResp: HttpResponse) {
  return function (request: IncomingMessage, response: ServerResponse): void {
    response.writeContinue();
    setTimeout(() => {
      createResponseFunction(httpResp)(request, response);
    }, 100);
  };
}

export function createMockHttpsServer(): HttpsServer {
  const server = createHttpsServer({
    key: readFileSync(join(CERTS_DIR, "test-server-key.pem")),
    cert: readFileSync(join(CERTS_DIR, "test-server-cert.pem")),
  });
  return server;
}

export function createMockHttpServer(): HttpServer {
  const server = createHttpServer();
  return server;
}

export function createMockHttp2Server(): Http2Server {
  const server = createHttp2Server();
  return server;
}
