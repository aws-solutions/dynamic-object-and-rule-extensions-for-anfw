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
import nock from "nock";
import {
  createHttpClient,
  CredentialProvider,
} from "src/clients/ApjsbAwsHttpclient";
const SAMPLE_DATA = JSON.stringify({ input: "{}" });

describe("apjsb-aws-httpclient", () => {
  jest.setTimeout(30000);
  let nockServer: nock.Scope;
  let service: CredentialProvider;
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    service = setupMockCredentialProvider();
    nockServer = nock("https://localhost");
    process.env = { ...ORIGINAL_ENV };
    process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

    process.env.AWS_SECRET_ACCESS_KEY =
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    process.env.AWS_SESSION_TOKEN = "faketoken";
  });

  afterAll((done) => {
    done();
    process.env = ORIGINAL_ENV;
  });

  test("should send post request", async () => {
    nockServer.post("/postEndpoint").reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.post(
      "https://localhost/postEndpoint",
      "elb",
      SAMPLE_DATA
    );
    expect(response.statusCode).toBe(200);
  });

  test("should send get request", async () => {
    nockServer.get("/getEndpoint").reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.get(
      "https://localhost/getEndpoint",
      "elb"
    );
    expect(response.statusCode).toBe(200);
  });

  test("should send get request with query parameters", async () => {
    nockServer
      .get("/getEndpoint")
      .query({
        foo: "Bar",
      })
      .reply(203, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.get(
      "https://localhost/getEndpoint?foo=Bar",
      "elb"
    );
    expect(response.statusCode).toBe(203);
  });

  test("should send request specified by caller", async () => {
    nockServer.head("/headEndpoint").reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.request(
      "HEAD",
      "https://localhost/headEndpoint",
      "elb"
    );

    expect(response.statusCode).toBe(200);
  });

  test("should send request with data specified by caller", async () => {
    nockServer.put("/putEndpoint").reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.request(
      "PUT",
      "https://localhost/putEndpoint",
      "elb",
      SAMPLE_DATA
    );
    expect(response.statusCode).toBe(200);
  });

  test("should send request with query strings specified by caller", async () => {
    nockServer
      .get("/getEndpoint?foo=bar&bar=foo")
      .reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);

    const response = await objectUnderTest.get(
      "https://localhost/getEndpoint?foo=bar&bar=foo",
      "elb"
    );

    expect(response.statusCode).toBe(200);
  });

  test("should raise exception when request head but provided body ", async () => {
    nockServer.head("/headEndpoint").reply(200, createSampleResponseBody());

    const objectUnderTest = createHttpClient("ap-southeast-2", service);
    expect.assertions(2);
    try {
      await objectUnderTest.request(
        "HEAD",
        "https://localhost/headEndpoint",
        "elb",
        SAMPLE_DATA
      );
    } catch (error) {
      expect(error).toBeDefined();
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       expect((error as any).message).toEqual(
        "Invalid parameter, request HEAD should not contain data"
      );
    }
  });

  test("should include headers in requests", async () => {
    nock("http://www.example.com", {
      reqheaders: { "X-API-Key": (value: string) => value === "bla" },
    })
      .get("/")
      .reply(200, createSampleResponseBody());

    const client = createHttpClient("ap-southeast-2");

    const response = await client.get("http://www.example.com", "execute-api", {
      "X-API-Key": "bla",
    });

    expect(response.statusCode).toBe(200);
  });

  test("should send put requests", async () => {
    nockServer.put("/putEndpoint").reply(200, createSampleResponseBody());

    const client = createHttpClient("ap-southeast-2");

    const response = await client.put(
      "http://localhost/putEndpoint",
      "execute-api",
      {
        data: "value",
      }
    );

    expect(response.statusCode).toBe(200);
  });
});
function setupMockCredentialProvider() {
  const jestFn = jest.fn();
  const service: CredentialProvider = { getCredential: jestFn };
  jestFn.mockReturnValue({
    accessKeyId: "fake-accessKeyId",
    secretAccessKey: "fake-secretAccessKey",
  });
  return service;
}

function createSampleResponseBody(): Record<string, unknown> {
  return {
    statusCode: 200,
    body: { status: "OK" },
  };
}
