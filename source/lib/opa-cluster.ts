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
import * as certificateMgr from "@aws-cdk/aws-certificatemanager";
import * as ec2 from "@aws-cdk/aws-ec2";
import { SubnetType } from "@aws-cdk/aws-ec2";
import * as ecr_assets from "@aws-cdk/aws-ecr-assets";
import * as ecs from "@aws-cdk/aws-ecs";
import { FargatePlatformVersion } from "@aws-cdk/aws-ecs";
import {
  ApplicationLoadBalancedFargateService,
  ApplicationLoadBalancedServiceRecordType,
} from "@aws-cdk/aws-ecs-patterns";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";
import * as route53 from "@aws-cdk/aws-route53";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import * as cdk from "@aws-cdk/core";
import { CfnOutput, Stack, Token } from "@aws-cdk/core";
import * as path from "path";
import { FirewallConfigSecureBucket } from "./firewall-config-secure-bucket";
export interface OpaECSClusterProps {
  vpc: ec2.IVpc;
}

const ulimits: ecs.Ulimit[] = [
  {
    name: ecs.UlimitName.NOFILE,
    softLimit: 131072,
    hardLimit: 131072,
  },
  {
    name: ecs.UlimitName.NPROC,
    softLimit: 8192,
    hardLimit: 8192,
  },
];

// TODO: this is a region aware account as listed above, since we are assume only on ap-southeast-2 for alpha, it's good for now
const CLOUD_WATCH_ACCOUNT = "783225319266";
export class OpaECSCluster extends cdk.Construct {
  opaALBDnsName: string;
  loadBalancedFargateService: ApplicationLoadBalancedFargateService;
  constructor(scope: cdk.Construct, id: string, props: OpaECSClusterProps) {
    super(scope, id);
    const cluster = new ecs.Cluster(this, "OpaCluster", { vpc: props.vpc });

    const policyBucket = new FirewallConfigSecureBucket(
      this,
      "policy-bucket",
      {}
    );
    const asset = new ecr_assets.DockerImageAsset(
      this,
      "ObjectExtensionOpaImage",
      {
        directory: path.join(__dirname, "../opa/"),
      }
    );

    const certificateArn = this.node.tryGetContext("certificateArn");

    const cert = certificateMgr.Certificate.fromCertificateArn(
      this,
      "elb-cert",
      certificateArn
    );
    const lbProps = {
      vpc: props.vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: SubnetType.PRIVATE, onePerAz: true },
    };
    const lb = new elbv2.ApplicationLoadBalancer(this, "LB", lbProps);

    const sidecarAsset = ecs.ContainerImage.fromAsset(
      path.join(__dirname, "../ecs_sidecar/"),
      {
        buildArgs: {
          PORT: "443",
          UPSTREAM_PORT: "8080",
        },
      }
    );
    const loadBalancedFargateService =
      new ApplicationLoadBalancedFargateService(this, "Service", {
        cluster,
        memoryLimitMiB: 1024,
        cpu: 512,
        serviceName: "object-extension-opa-service",
        certificate: cert,
        // loadBalancer: loadBalancer,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        // The following 3 parameters are workaround to avoid creating a record and init a new cert
        domainName: "www.dummy.com",
        taskSubnets: { subnetType: SubnetType.PRIVATE },
        domainZone: {} as route53.IHostedZone,
        recordType: ApplicationLoadBalancedServiceRecordType.NONE,
        openListener: false,
        loadBalancer: lb,
        targetProtocol: elbv2.ApplicationProtocol.HTTPS,
        publicLoadBalancer: false,
        taskImageOptions: {
          image: sidecarAsset,
          enableLogging: true,
          containerPort: 443,
          logDriver: ecs.LogDriver.awsLogs({
            logRetention: logs.RetentionDays.TEN_YEARS,
            streamPrefix: `nginx`,
          }),
        },
        desiredCount: 2,
        platformVersion: FargatePlatformVersion.VERSION1_4,
      });
    const listener: elbv2.CfnListener = loadBalancedFargateService.listener.node
      .defaultChild as elbv2.CfnListener;
    listener.addOverride("Properties.SslPolicy", elbv2.SslPolicy.TLS12_EXT);
    const opaContainer = loadBalancedFargateService.taskDefinition.addContainer(
      "opa",
      {
        containerName: "opa",
        portMappings: [{ containerPort: 8080 }],
        image: ecs.ContainerImage.fromEcrRepository(
          asset.repository,
          asset.sourceHash
        ),
        logging: ecs.LogDriver.awsLogs({
          logRetention: logs.RetentionDays.TEN_YEARS,
          streamPrefix: `opa`,
        }),
        environment: {
          BUNDLE_BUCKET: policyBucket.bucket.bucketName,
        },
      }
    );
    opaContainer.addUlimits(...ulimits);

    loadBalancedFargateService.targetGroup.configureHealthCheck({
      port: "443",
      path: "/health",
    });

    // * A region must be specified on the stack containing the load balancer; you cannot enable logging on
    // * environment-agnostic stacks. See https://docs.aws.amazon.com/cdk/latest/guide/environments.html
    const region = Stack.of(this).region;
    if (Token.isUnresolved(region)) {
      cdk.Annotations.of(this).addWarning(
        "Region is not specified can not enable ELBv2 access logging"
      );
    } else {
      const albAccessLogBucket = this.createElbAccessLogBucket(
        cdk.RemovalPolicy.RETAIN
      );
      loadBalancedFargateService.loadBalancer.logAccessLogs(albAccessLogBucket);
    }

    asset.repository.grantPull(
      loadBalancedFargateService.taskDefinition.taskRole
    );

    policyBucket.bucket.grantRead(
      loadBalancedFargateService.taskDefinition.taskRole
    );
    policyBucket.encryptionKey.grantEncryptDecrypt(
      loadBalancedFargateService.taskDefinition.taskRole
    );

    new s3deploy.BucketDeployment(this, "DeployBundles", {
      sources: [s3deploy.Source.asset("./opa/build/default.zip")],
      destinationBucket: policyBucket.bucket,
      destinationKeyPrefix: "bundles",
    });

    // loadBalancedFargateService.node.addDependency(props.policyBucket);
    this.opaALBDnsName =
      loadBalancedFargateService.loadBalancer.loadBalancerDnsName;
    new CfnOutput(this, "OPA-alb-url", {
      value: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
    });

    new CfnOutput(this, "OPA-policy-bucket", {
      value: policyBucket.bucket.bucketName,
    });
    this.loadBalancedFargateService = loadBalancedFargateService;
  }

  private createElbAccessLogBucket(removalPolicy: cdk.RemovalPolicy) {
    const elbAccessLogBucket = new s3.Bucket(
      this,
      "opa-alb-elbAccessLogBucket",
      {
        removalPolicy: removalPolicy,
        //only support s3 managed https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
        versioned: true,
        serverAccessLogsPrefix: "access-log",
        autoDeleteObjects: removalPolicy == cdk.RemovalPolicy.DESTROY,
      }
    );

    elbAccessLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "HttpsOnly",
        resources: [`${elbAccessLogBucket.bucketArn}/*`],
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
    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html?icmpid=docs_elbv2_console
    elbAccessLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        principals: [new iam.AccountPrincipal(CLOUD_WATCH_ACCOUNT)],
        resources: [
          `arn:aws:s3:::${elbAccessLogBucket.bucketName}/AWSLogs/${
            Stack.of(this).account
          }/*`,
        ],
      })
    );

    elbAccessLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        resources: [
          `arn:aws:s3:::${elbAccessLogBucket.bucketName}/AWSLogs/${
            Stack.of(this).account
          }/*`,
        ],
        conditions: {
          StringEquals: {
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
        },
      })
    );

    elbAccessLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        principals: [new iam.ServicePrincipal("logdelivery.elb.amazonaws.com")],
        resources: [
          `arn:aws:s3:::${elbAccessLogBucket.bucketName}/AWSLogs/${
            Stack.of(this).account
          }/*`,
        ],
        conditions: {
          StringEquals: {
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
        },
      })
    );

    elbAccessLogBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetBucketAcl"],
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        resources: [`arn:aws:s3:::${elbAccessLogBucket.bucketName}`],
      })
    );
    return elbAccessLogBucket;
  }
}
