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

import {
  Runtime,
  RuntimeFamily,
  Schedule,
  Test,
} from "@aws-cdk/aws-synthetics-alpha";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { Metric, MetricOptions } from "aws-cdk-lib/aws-cloudwatch";
import { Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SnsTopic } from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns";
import * as synthetics from "aws-cdk-lib/aws-synthetics";
import { Construct } from "constructs";
import { FirewallConfigSecureBucket } from "../firewall-config-secure-bucket";

export interface APISyntheticsCanaryProps {
  /**
   * Name of the canary, must match ^[0-9a-z_\-]+$
   *
   * @required
   */
  readonly canaryName: string;

  /**
   * Specify the runtime version to use for the canary.
   *
   * @required
   */
  readonly runtime: Runtime;

  /**
   * The type of test that you want your canary to run.
   *
   * Use `Test.custom()` to specify the test to run.
   *
   * @required
   */
  readonly test: Test;

  /**
   * Specify the schedule for how often the canary runs.
   *
   * @optional
   * @default Once every 5 minutes (rate(5 minutes))
   */
  readonly schedule?: Schedule;

  /**
   * Whether or not the canary should start after creation.
   *
   * @optional
   * @default true
   */
  readonly startAfterCreation?: boolean;

  /**
   * Environment variables to be passed into canary test script
   *
   * @optional
   */
  readonly environmentVariables?: Record<string, string>;

  /**
   * Canary test timeout in seconds
   *
   * @optional
   * @default 15 seconds
   */
  readonly timeoutInSeconds?: number;

  readonly canaryRole?: iam.Role;
  /**
   * VPC configuration if canary will run inside the VPC
   *
   * If both sharedInfraClient and vpcConfig specified, vpcConfig will override the vpc setting in shared infra client.
   *
   * @optional
   * @default Canary will run without VPC
   */
  readonly vpcConfig?: synthetics.CfnCanary.VPCConfigProperty;

  /**
   * The S3 bucket prefix
   *
   * @optional - Specify this if you want a more specific path within the artifacts bucket.
   * @default No prefix
   */
  readonly s3BucketPrefix?: string;

  /**
   * Specify the ARN of the SNS Topic that the failed canary test alert to be sent to
   *
   * @optional
   * @default None - no alert to be sent to SNS topic
   */
  readonly alertSNSTopicArn?: string;

  /**
   * Specify if the artifact bucket should be removed when canary is destroyed
   *
   * Available option is in cdk.RemovalPolicy
   *
   * @optional
   * @default cdk.RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * The canary's bucket encryption key arn
   *
   * @optional - If a key arn is specified, the corresponding KMS key will be used to encrypt canary S3 bucket.
   * @default None - A new key is provisioned for the canary S3 bucket.
   */
  readonly s3BucketEncryptionKeyArn?: string;
}

const canaryNameReg = /^[0-9a-z_-]+$/;

export class AWSSyntheticsCanary extends Construct {
  public readonly canaryRole: iam.Role;
  private readonly canaryName: string;

  constructor(scope: Construct, id: string, props: APISyntheticsCanaryProps) {
    super(scope, id);

    if (props.canaryName.length > 21) {
      throw "Canary name must be less than 21 characters in length.";
    }

    if (!canaryNameReg.test(props.canaryName)) {
      throw `Invalid canary name, must match /^[0-9a-z_-]+$/`;
    }

    this.canaryName = props.canaryName;
    const removePolicy = props.removalPolicy ?? RemovalPolicy.DESTROY;

    // create canary artifacts bucket
    const artifactsBucket = new FirewallConfigSecureBucket(
      this,
      "CanaryArtifactBucket",
      {
        autoDeleteObjects: removePolicy === RemovalPolicy.DESTROY,
        removalPolicy: removePolicy,
        encryptionKeyArn: props.s3BucketEncryptionKeyArn,
      }
    );

    const prefix = props.s3BucketPrefix || "";

    if (props.canaryRole) {
      const policyDoc = this.getCanaryRolePolicyDoc(
        artifactsBucket.bucket,
        prefix
      );
      this.canaryRole = props.canaryRole;
      this.canaryRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        )
      );
      this.canaryRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        )
      );
      this.canaryRole.attachInlinePolicy(
        new iam.Policy(this, "canaryPolicy", { document: policyDoc })
      );
    } else {
      // create canary execution role
      this.canaryRole = new iam.Role(this, `CanaryExecutionRole`, {
        assumedBy: new iam.ServicePrincipal("lambda"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
          // must to have this one for lambda to run in VPC
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaVPCAccessExecutionRole"
          ),
        ],
        inlinePolicies: {
          CanaryPolicy: this.getCanaryRolePolicyDoc(
            artifactsBucket.bucket,
            prefix
          ),
        },
        description: "Execution Role for CloudWatch Synthetics Canary",
      });
    }

    const vpcConfig = props.vpcConfig;

    const scheduleExpressString =
      props.schedule?.expressionString ?? "rate(5 minutes)";

    // create synthetics canary
    new synthetics.CfnCanary(this, "Canary", {
      artifactS3Location: artifactsBucket.bucket.s3UrlForObject(prefix),
      executionRoleArn: this.canaryRole.roleArn,
      runtimeVersion: props.runtime.name,
      name: props.canaryName,
      schedule: {
        expression: scheduleExpressString,
      },
      startCanaryAfterCreation: props.startAfterCreation ?? true,
      code: this.createCode(props.test),
      runConfig: {
        activeTracing: true,
        timeoutInSeconds: props.timeoutInSeconds ?? 15,
        environmentVariables: props.environmentVariables,
      },
      vpcConfig,
    });

    // create cloudwatch event rule to send failed alert to SNS topic
    if (props.alertSNSTopicArn) {
      const alertTopic = Topic.fromTopicArn(
        this,
        "CanaryAlertSNSTopic",
        props.alertSNSTopicArn
      );

      new Rule(this, "CanaryTestEventRule", {
        description: "Event rule for monitoring Canary Test Results",
        eventPattern: {
          source: ["aws.synthetics"],
          detailType: ["Synthetics Canary TestRun Failure"],
          detail: {
            "canary-name": [props.canaryName],
            "test-run-status": ["FAILED"],
          },
        },
        targets: [
          new SnsTopic(alertTopic, {
            message: RuleTargetInput.fromText(
              `Canary test ${props.canaryName} failed on in account ${
                Stack.of(this).account
              }`
            ),
          }),
        ],
      });
    }
  }

  private createCode(test: Test): synthetics.CfnCanary.CodeProperty {
    const codeConfig = {
      handler: test.handler,
      ...test.code.bind(this, test.handler, RuntimeFamily.NODEJS),
    };
    return {
      handler: codeConfig.handler,
      script: codeConfig.inlineCode,
      s3Bucket: codeConfig.s3Location?.bucketName,
      s3Key: codeConfig.s3Location?.objectKey,
      s3ObjectVersion: codeConfig.s3Location?.objectVersion,
    };
  }

  private getCanaryRolePolicyDoc(
    artifactsBucket: s3.IBucket,
    prefix: string
  ): iam.PolicyDocument {
    const { partition } = Stack.of(this);
    const policy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ["arn:aws:s3:::*"],
          actions: ["s3:ListAllMyBuckets"],
        }),
        new iam.PolicyStatement({
          resources: [
            artifactsBucket.arnForObjects(`${prefix ? prefix + "/*" : "*"}`),
          ],
          actions: ["s3:PutObject", "s3:GetBucketLocation"],
        }),
        new iam.PolicyStatement({
          resources: [artifactsBucket.bucketArn],
          actions: ["s3:GetBucketLocation"],
        }),
        new iam.PolicyStatement({
          resources: ["*"],
          actions: ["cloudwatch:PutMetricData"],
          conditions: {
            StringEquals: { "cloudwatch:namespace": "CloudWatchSynthetics" },
          },
        }),
        new iam.PolicyStatement({
          resources: ["*"],
          actions: ["xray:PutTraceSegments"],
        }),
        new iam.PolicyStatement({
          resources: [`arn:${partition}:logs:::*`],
          actions: [
            "logs:CreateLogStream",
            "logs:CreateLogGroup",
            "logs:PutLogEvents",
          ],
        }),
      ],
    });
    return policy;
  }
  /**
   * Measure the number of failed canary runs over a given time period.
   *
   * Default: sum over 5 minutes
   *
   * @param options - configuration options for the metric
   */
  public metricFailed(options?: MetricOptions): Metric {
    return new Metric({
      namespace: "CloudWatchSynthetics",
      metricName: "Failed",
      dimensionsMap: {
        CanaryName: this.canaryName,
      },
      statistic: "Sum",
      ...options,
    }).attachTo(this);
  }
}
