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
import { Sha256 } from "@aws-crypto/sha256-js";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import { HttpRequest, HttpResponse } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Credentials, HeaderBag, QueryParameterBag } from "@aws-sdk/types";
import * as https from "https";
import "source-map-support/register";
import * as nodeUrl from "url";
import { DefaultCredentialProvider } from "./DefaultCredentialProvider";
import { parseBody } from "./deserilizer/Deserilizer";

/**
 * Creates an instance of an ApjsbAwsHttpClient
 * @param region The AWS region
 * @param compatiblityMode If set true, the basic NodeJS's https handler is used to submit the request and process the response. If set to false, the aws-sdk v3 NodeHttpHandler i sued to submit the request and process the response. @default false
 * @param credentialProvider The credential provider. @default aws.EnvironmentCredentials
 * @param httpsAgent The NodeJS's HttpsAgent @default: undefined
 */
export function createHttpClient(
  region: string,
  credentialProvider: CredentialProvider = new DefaultCredentialProvider(),
  httpsAgent?: https.Agent
): ApjsbAwsHttpClient {
  return new ApjsbAwsHttpClient(credentialProvider, region, httpsAgent);
}

export interface CredentialProvider {
  getCredential(): Promise<Credentials>;
}

const NO_PAYLOAD_METHODS = [
  "GET",
  "HEAD",
  "PATCH",
  "CONNECT",
  "OPTIONS",
  "TRACE",
];
const noPayloadRequestMethod = [...NO_PAYLOAD_METHODS] as const;
type NoPayloadRequestMethod = typeof noPayloadRequestMethod[number];
const withPayloadRequestMethod = ["POST", "PUT", "DELETE"] as const;
type WithPayloadRequestMethod = typeof withPayloadRequestMethod[number];
export type HttpMethod = NoPayloadRequestMethod | WithPayloadRequestMethod;

/**
 * A Http Handler that supports AWS V4 signature
 */

export class ApjsbAwsHttpClient {
  private httpClient: NodeHttpHandler;

  /**
   * Initialises a new AWS NodeHttpHandler
   * @param credentialProvider the AWS credentials provider
   * @param region the AWS region
   * @param httpsAgent Optional - the httpsAgent to be used
   */
  constructor(
    private credentialProvider: CredentialProvider,
    private region: string,
    private httpsAgent?: https.Agent,
    private customHandler?: (
      request: HttpRequest,
      agent?: https.Agent
    ) => Promise<HttpResponse>
  ) {
    this.httpClient = new NodeHttpHandler({ httpsAgent });
  }

  /**
   * Send get request to remote
   * @param uri The request's uri
   * @param service The underline service this request sends to, e.g ec2 | elb
   * @param queryParameters The query parameter in the form of key value pair,
   * @param headers the request's header collection
   */
  async get(
    uri: string,
    service: string,
    headers?: HeaderBag
  ): Promise<HttpResponse> {
    return this.request("GET", uri, service, undefined, headers);
  }

  /**
   * Send post request to remote
   * @param uri The request's uri
   * @param service The underline service this request sends to, e.g ec2 | elb
   * @param data The request's body
   * @param headers The request's header collection
   */
  async post<T>(
    uri: string,
    service: string,
    data: T,
    headers?: HeaderBag
  ): Promise<HttpResponse> {
    return this.request("POST", uri, service, JSON.stringify(data), {
      ...headers,
      "content-type": "application/json",
    });
  }

  /**
   * Send put request to remote
   * @param uri The request's uri
   * @param service The underline service this request sends to, e.g ec2 | elb
   * @param data The request's body
   * @param headers The request's header collection
   */
  async put<T>(
    uri: string,
    service: string,
    data: T,
    headers?: HeaderBag
  ): Promise<HttpResponse> {
    return this.request("PUT", uri, service, JSON.stringify(data), {
      ...headers,
      "content-type": "application/json",
    });
  }

  /**
   * Send request request to remote
   * @param request type @ApjsbAwsHttpClientRequest encapsulate all the request parameters
   */
  public async request(
    method: HttpMethod,
    uri: string,
    service: string,
    data?: string,
    headers?: HeaderBag
  ): Promise<HttpResponse> {
    const url = new nodeUrl.URL(uri);

    const hostname = url.hostname;
    const path = url.pathname;
    let queryParameters: QueryParameterBag | undefined = undefined;

    url.searchParams.forEach((value, name) => {
      if (!queryParameters) {
        queryParameters = {};
      }

      queryParameters[name] = value;
    });

    let outgoingRequest;
    console.log("method", method.toUpperCase());
    console.log("noPayloadRequestMethod", noPayloadRequestMethod);

    if (NO_PAYLOAD_METHODS.includes(method.toUpperCase())) {
      if (data) {
        throw new Error(
          `Invalid parameter, request ${method} should not contain data`
        );
      }
      outgoingRequest = await this.createHttpRequest(
        hostname,
        path,
        service,
        method,
        queryParameters,
        undefined,
        headers
      );
    } else {
      outgoingRequest = await this.createHttpRequest(
        hostname,
        path,
        service,
        method,
        queryParameters,
        data,
        headers
      );
    }
    return this.sendRequest(outgoingRequest);
  }

  private async sendRequest(request: HttpRequest): Promise<HttpResponse> {
    const response = (await this.httpClient.handle(request)).response;

    const body = await parseBody(response.body);

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: body,
    };
  }

  private async createHttpRequest(
    hostname: string,
    path: string,
    service: string,
    method: HttpMethod,
    query?: QueryParameterBag,
    data?: string,
    headers?: HeaderBag
  ): Promise<HttpRequest> {
    const credential = await this.credentialProvider.getCredential();
    const request = this.createRequest(
      hostname,
      path,
      method,
      query,
      data,
      headers
    );
    return this.signRequest(credential, service, request);
  }

  private async signRequest(
    credential: Credentials,
    service: string,
    request: HttpRequest
  ) {
    const signer = new SignatureV4({
      credentials: credential,
      region: this.region,
      service: service,
      sha256: Sha256,
    });

    return signer.sign(request) as Promise<HttpRequest>;
  }

  private createRequest<T>(
    hostname: string,
    path: string,
    httpMethod: string,
    query?: QueryParameterBag,
    data?: T,
    headers?: HeaderBag
  ): HttpRequest {
    const request = new HttpRequest({
      method: httpMethod,
      protocol: "https:",
      hostname,
      headers: { ...headers, host: hostname },
      query: query,
      path,
    });
    request.method = httpMethod;
    if (data) {
      request.body = data;
    }
    return request;
  }
}
