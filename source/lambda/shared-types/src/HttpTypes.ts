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

// APIGatewayProxyResult has all the fields that is needed for a BasicHTTPResponse type.
// re-export as a generic type
import { APIGatewayProxyResult } from "aws-lambda";

const jsonContentTypeHeader = {
  "Content-Type": "application/json",
};
const textContentTypeHeader = {
  "Content-Type": "text/plain",
};

export class BasicHttpResponse implements APIGatewayProxyResult {
  constructor(
    public statusCode: number,
    public body: string = "",
    public headers?: Record<string, boolean | number | string>
  ) {}

  addHeaders(
    headers: Record<string, boolean | number | string>
  ): BasicHttpResponse {
    this.headers = Object.assign(this.headers || {}, headers);
    return this;
  }

  static ofError(error: BasicHttpError): BasicHttpResponse {
    return new BasicHttpResponse(
      error.statusCode,
      JSON.stringify({
        error: error.message,
        retryable: error.retryable,
      }),
      jsonContentTypeHeader
    );
  }

  static ofRecord(
    statusCode: number,
    data: Record<string, unknown>
  ): BasicHttpResponse {
    return new BasicHttpResponse(
      statusCode,
      JSON.stringify(data),
      jsonContentTypeHeader
    );
  }

  static ofString(statusCode: number, message: string): BasicHttpResponse {
    return new BasicHttpResponse(statusCode, message, textContentTypeHeader);
  }

  static ofObject<T>(statusCode: number, value: T): BasicHttpResponse {
    return new BasicHttpResponse(
      statusCode,
      JSON.stringify(value),
      jsonContentTypeHeader
    );
  }
}

export interface PaginatedResults<T> {
  results: T[];
  nextToken?: string;
}

// Basic runtime error
export class BasicHttpError implements Error {
  public name = "BasicHttpError";
  constructor(
    public statusCode: number,
    public message: string = "",
    public retryable: boolean = false
  ) {}

  static internalServerError(message: string): BasicHttpError {
    return new BasicHttpError(500, message, false);
  }
}

// Paginated results for API
export interface PaginatedResults<T> {
  results: T[];
  nextToken?: string;
}
