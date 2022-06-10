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
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as lambda from "@aws-cdk/aws-lambda";
import * as cdk from "@aws-cdk/core";
import { CfnOutput, Tags } from "@aws-cdk/core";
import * as path from "path";
export const TAG_KEY = "FF_TEST";

export const TAG_VALUE = "true";

export const VPC_OUTPUT_KEY = "TestVPC";

export const SG_OUTPUT_KEY = "TestSecurityGroup";

export const INSTANCE_OUTPUT_KEY = "TestInstance";

export const TAGGED_INSTANCE_OUTPUT_KEY = "TestTaggedInstance";

export const SUBNET_OUTPUT_KEY = "TestSubnet";

export const ASG_OUTPUT_KEY = "TestASG";

export const LAMBDA_TAG_KEY = "OPEN_ENI_LAMBDA";

export class TestSupportStackStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    //vpc?
    const vpc = ec2.Vpc.fromLookup(this, "VPC", { isDefault: true });
    // only on 2.5.0 https://github.com/aws/aws-cdk/commit/7b31376e6349440f7b215d6e11c3dd900d50df34
    const vpcArn = cdk.Arn.format(
      {
        account: this.account,
        partition: this.partition,
        region: this.region,
        resource: "vpc",
        resourceName: vpc.vpcId,
        service: "ec2",
      },
      this
    );
    new CfnOutput(this, VPC_OUTPUT_KEY, {
      value: vpcArn,
    });
    //security group

    const securityGroup = new ec2.SecurityGroup(this, `${id}-SecurityGroup`, {
      vpc,
      description: "Allow only outbound",
      allowAllOutbound: true,
    });

    const sgArn = cdk.Arn.format(
      {
        account: this.account,
        partition: this.partition,
        region: this.region,
        resource: "security-group",
        resourceName: securityGroup.securityGroupId,
        service: "ec2",
      },
      this
    );

    new CfnOutput(this, SG_OUTPUT_KEY, {
      value: sgArn,
    });
    //ec2 arn
    const ec2Instance = new ec2.Instance(this, "test-support-ec2-instance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: securityGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
    });
    // lambda in vpc
    const lambdaInVPC = new lambda.Function(
      this,
      "sampleApp",

      {
        handler: "app.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, `../lambda/sample_app`)
        ),

        runtime: lambda.Runtime.NODEJS_14_X,
        description: "Firefly integration supporting test lambda within VPC",
        vpc: vpc,
        allowPublicSubnet: true,
        // vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      }
    );
    Tags.of(lambdaInVPC).add(LAMBDA_TAG_KEY, TAG_VALUE);

    const ec2Arn = cdk.Arn.format(
      {
        account: this.account,
        partition: this.partition,
        region: this.region,
        resource: "instance",
        resourceName: ec2Instance.instanceId,
        service: "ec2",
      },
      this
    );
    new CfnOutput(this, INSTANCE_OUTPUT_KEY, {
      value: ec2Arn,
    });
    const ec2InstanceWithTag = new ec2.Instance(
      this,
      TAGGED_INSTANCE_OUTPUT_KEY,
      {
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        securityGroup: securityGroup,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
        ),
        machineImage: new ec2.AmazonLinuxImage({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
      }
    );
    Tags.of(ec2InstanceWithTag).add("FF_TEST", "true");

    const subnetIds = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    }).subnetIds;
    if (subnetIds.length === 0) {
      fail("No default subnet abort tests");
    }
    const subnetArn = cdk.Arn.format(
      {
        account: this.account,
        partition: this.partition,
        region: this.region,
        resource: "subnet",
        resourceName: subnetIds[0],
        service: "ec2",
      },
      this
    );
    new CfnOutput(this, SUBNET_OUTPUT_KEY, {
      value: subnetArn,
    });
    //subnet?
    const mySecurityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
    });
    const asg = new autoscaling.AutoScalingGroup(this, "test-support-ASG", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage(),
      securityGroup: mySecurityGroup,
      desiredCapacity: 1,
    });
    new CfnOutput(this, ASG_OUTPUT_KEY, {
      value: asg.autoScalingGroupName,
    });
  }
}
