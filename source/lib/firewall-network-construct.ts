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
import * as cloudtrail from "@aws-cdk/aws-cloudtrail";
import * as ec2 from "@aws-cdk/aws-ec2";
import { NatProvider, SubnetType } from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as kms from "@aws-cdk/aws-kms";
import * as logs from "@aws-cdk/aws-logs";
import { Annotations, Construct, RemovalPolicy, Stack } from "@aws-cdk/core";
import { FirewallConfigSecureBucket } from "./firewall-config-secure-bucket";

export interface AutConfigNetworkConstructProps {
  vpcId: string;
  availabilityZones: string[];
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  vpcCidrBlock: string;
}

export class AutConfigNetworkConstruct extends Construct {
  public readonly trail: cloudtrail.Trail;
  public readonly vpc: ec2.IVpc;
  public ddbEndpoint?: ec2.GatewayVpcEndpoint;

  constructor(
    scope: Construct,
    id: string,
    props?: AutConfigNetworkConstructProps
  ) {
    super(scope, id);
    this.vpc = props ? this.importVPC(props) : this.setupVPC();
    this.trail = this.createTrail();
  }

  importVPC(details: AutConfigNetworkConstructProps): ec2.IVpc {
    this.validConfiguration(details);

    const vpcAttribute: ec2.VpcAttributes = {
      vpcId: details.vpcId,
      availabilityZones: details.availabilityZones,
      publicSubnetIds: details.publicSubnetIds,
      privateSubnetIds: details.privateSubnetIds,
      vpcCidrBlock: details.vpcCidrBlock,
    };
    return ec2.Vpc.fromVpcAttributes(this, "externalVPC", vpcAttribute);
  }

  validConfiguration(details: AutConfigNetworkConstructProps) {
    if (!details.vpcId) {
      Annotations.of(this).addError(
        "Invalid configuration, importVpcDetails is missing mandatory configuration vpcId"
      );
    }
    if (!Array.isArray(details.availabilityZones)) {
      Annotations.of(this).addError(
        "Invalid configuration, expecting availabilityZones to be a list in  importVpcDetails"
      );
    }
    if (!Array.isArray(details.publicSubnetIds)) {
      Annotations.of(this).addError(
        "Invalid configuration, expecting publicSubnetIds to be a list in  importVpcDetails"
      );
    }

    if (!Array.isArray(details.privateSubnetIds)) {
      Annotations.of(this).addError(
        "Invalid configuration, expecting privateSubnetIds to be a list in  importVpcDetails"
      );
    }

    if (!details.vpcCidrBlock) {
      Annotations.of(this).addError(
        "Invalid configuration, importVpcDetails is missing mandatory configuration vpcCidrBlock"
      );
    }
    return true;
  }

  private createTrail() {
    const encryptionKey = new kms.Key(this, "object-extension-trail-log-key", {
      removalPolicy: RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });
    encryptionKey.grantEncryptDecrypt(
      new iam.ServicePrincipal("cloudtrail.amazonaws.com")
    );
    const cloudTrailPrincipal = new iam.ServicePrincipal(
      "cloudtrail.amazonaws.com"
    );
    const encryptedBucket = new FirewallConfigSecureBucket(
      this,
      "trail-bucket",
      {}
    ).bucket;
    encryptedBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [encryptedBucket.bucketArn],
        actions: ["s3:GetBucketAcl"],
        principals: [cloudTrailPrincipal],
      })
    );

    encryptedBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [
          encryptedBucket.arnForObjects(`AWSLogs/${Stack.of(this).account}/*`),
        ],
        actions: ["s3:PutObject"],
        principals: [cloudTrailPrincipal],
        conditions: {
          StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control" },
        },
      })
    );

    const trail = new cloudtrail.Trail(this, "object-extension-trail", {
      encryptionKey: encryptionKey,
      cloudWatchLogsRetention: logs.RetentionDays.TEN_YEARS,
      bucket: encryptedBucket,
    });
    return trail;
  }

  private setupVPC() {
    const subnets = [
      {
        cidrMask: 24,
        name: "PrivateSubnetA",
        subnetType: SubnetType.PRIVATE,
      },
      {
        cidrMask: 24,
        name: "PublicSubnetA",
        subnetType: SubnetType.PUBLIC,
      },
    ];

    const vpc = new ec2.Vpc(this, "object-extension-Vpc", {
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
      maxAzs: 2,
      natGatewayProvider: NatProvider.gateway(),
      natGateways: 2,
      subnetConfiguration: subnets,
    });

    this.enableVpcFlowLog(vpc);

    const enableOpa = !!this.node.tryGetContext("enableOpa");
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      `s3-vpc-endpoint-sg`,
      {
        vpc: vpc,
        allowAllOutbound: false,
      }
    );

    vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443)
    );
    vpcEndpointSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443)
    );

    this.ddbEndpoint = new ec2.GatewayVpcEndpoint(this, `vpcEndpointDynamoDB`, {
      vpc: vpc,
      service: new ec2.GatewayVpcEndpointAwsService("dynamodb"),
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }],
    });
    if (enableOpa) {
      new ec2.InterfaceVpcEndpoint(this, "vpcEndpointECR", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        vpc: vpc,
        lookupSupportedAzs: false,
        open: true,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpcEndpointEcrDocker", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        vpc: vpc,
        lookupSupportedAzs: false,
        open: true,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpcEndpointELB", {
        service: ec2.InterfaceVpcEndpointAwsService.ELASTIC_LOAD_BALANCING,
        vpc: vpc,
        lookupSupportedAzs: false,
        open: true,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE },
      });
    }

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointEC2", {
      service: ec2.InterfaceVpcEndpointAwsService.EC2,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointEC2MESSAGES", {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointLambda", {
      service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointSNS", {
      service: ec2.InterfaceVpcEndpointAwsService.SNS,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointKMS", {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });
    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointCloudWatchLogs", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointCloudWatch", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH,
      vpc: vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new ec2.InterfaceVpcEndpoint(this, "vpcEndpointAWSConfig", {
      service: ec2.InterfaceVpcEndpointAwsService.CONFIG,
      vpc,
      lookupSupportedAzs: false,
      open: true,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });
    return vpc;
  }

  private enableVpcFlowLog(vpc: ec2.Vpc) {
    const encryptionKey = new kms.Key(this, "VpcFlowLogsKey", {
      removalPolicy: RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });
    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        sid: "Allow VPC Flow Logs to use the key",
        principals: [
          new iam.ServicePrincipal(
            `logs.${Stack.of(this).region}.amazonaws.com`
          ),
        ],
        actions: [
          "kms:ReEncrypt",
          "kms:GenerateDataKey",
          "kms:Encrypt",
          "kms:DescribeKey",
          "kms:Decrypt",
        ],
        // This is a resource policy, can only reference  and specifying encryptionKey would start a Circular dependency
        resources: ["*"],
      })
    );

    const logGroup = new logs.LogGroup(this, "VpcFlowLogs", {
      retention: logs.RetentionDays.TEN_YEARS,
      encryptionKey: encryptionKey,
    });

    const logGroupRole = new iam.Role(this, "VpcFlowLogsRole", {
      assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    });

    const logGroupPolicy = new iam.Policy(this, "VpcFlowLogsPolicy");

    logGroupPolicy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ],
        resources: [logGroup.logGroupArn],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ],
        resources: [encryptionKey.keyArn],
      })
    );

    logGroupPolicy.attachToRole(logGroupRole);

    vpc.addFlowLog("FlowLogsToCloudWatch", {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(
        logGroup,
        logGroupRole
      ),
    });
  }
}
