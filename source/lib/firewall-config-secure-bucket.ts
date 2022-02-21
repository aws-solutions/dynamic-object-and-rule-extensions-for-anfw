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
import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as kms from "@aws-cdk/aws-kms";
import * as iam from "@aws-cdk/aws-iam";

export type FirewallConfigSecureBucketProps = Omit<
  s3.BucketProps,
  | "encryptionKey"
  | "encryption"
  | "blockPublicAccess"
  | "accessControl"
  | "versioned"
  | "serverAccessLogsPrefix"
> & { encryptionKeyArn?: string };

export class FirewallConfigSecureBucket extends cdk.Construct {
  public readonly bucket: s3.Bucket;
  public readonly encryptionKey: kms.IKey;

  constructor(
    scope: cdk.Construct,
    id: string,
    props: FirewallConfigSecureBucketProps
  ) {
    super(scope, id);

    this.encryptionKey = props.encryptionKeyArn
      ? kms.Key.fromKeyArn(this, `encryption-key-${id}`, props.encryptionKeyArn)
      : new kms.Key(this, `encryption-key-${id}`, {
          removalPolicy: props.removalPolicy,
          enableKeyRotation: true,
        });

    this.bucket = new s3.Bucket(this, `ags-${id}`, {
      ...props,
      encryptionKey: this.encryptionKey,
      encryption: s3.BucketEncryption.KMS,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      versioned: true,
      serverAccessLogsPrefix: "access-log",
    });

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "HttpsOnly",
        resources: [`${this.bucket.bucketArn}/*`],
        actions: ["*"],
        principals: [new iam.AnyPrincipal()],
        effect: iam.Effect.DENY,
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      })
    );
  }
}
