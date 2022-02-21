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
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from "@aws-cdk/aws-logs";
import { Construct, CustomResource, Duration } from "@aws-cdk/core";
import * as cr from "@aws-cdk/custom-resources";
import * as path from "path";

export interface SolutionMetricsCollectorConstructProps {
  solutionDisplayName: string;
  solutionId: string;
  version: string;
  sendAnonymousMetric: "Yes" | "No";
  functionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metricsData: { [key: string]: any };
}

export class SolutionMetricsCollectorConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: SolutionMetricsCollectorConstructProps
  ) {
    super(scope, id);

    const customResourceLambda = new lambda.Function(
      this,
      "CustomResourceFunction",
      {
        description: `${props.solutionDisplayName} (${props.version}): Custom resource`,
        runtime: lambda.Runtime.NODEJS_14_X,
        code: lambda.Code.fromAsset(
          path.resolve(
            __dirname,
            `../../lambda/operational-metrics-collector/.aws-sam/build/${props.functionName}`
          )
        ),
        handler: "app.lambdaHandler",
        timeout: Duration.minutes(1),
        memorySize: 128,
        environment: {
          SOLUTION_ID: props.solutionId,
          SOLUTION_VERSION: props.version,
        },
      }
    );
    const metricsCollectorCrProvider = new cr.Provider(
      this,
      "metricsCollectorCrProvider",
      {
        onEventHandler: customResourceLambda
      }
    );

    new CustomResource(this, id, {
      serviceToken: metricsCollectorCrProvider.serviceToken,
      properties: {
        sendAnonymousMetric: props.sendAnonymousMetric,
        ...props.metricsData,
      },
    });
  }
}
