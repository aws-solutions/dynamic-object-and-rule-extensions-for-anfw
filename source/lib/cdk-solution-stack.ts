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

import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as synthetics from "@aws-cdk/aws-synthetics";
import * as cdk from "@aws-cdk/core";
import { Annotations, RemovalPolicy, Stack, Tags } from "@aws-cdk/core";
import * as fs from "fs";
import * as path from "path";
import { AutConfigConstructConstruct } from "./firewall-auto-config-construct";
import { AutConfigAPIConstructConstruct } from "./firewall-config-api-construct";
import { AutConfigDataSourceConstructConstruct } from "./firewall-datasource-construct";
import { AutConfigNetworkConstruct } from "./firewall-network-construct";
import { ApiServiceDashboard } from "./monitor/api-dashboard";
import { AGSSyntheticsCanary } from "./monitor/api-synthetics-canary";
import { SolutionMetricsCollectorConstruct } from "./monitor/solution-metrics-collector";
import { OpaECSCluster } from "./opa-cluster";
export interface FirewallObjectExtensionSolutionStackProperty
  extends cdk.StackProps {
  solutionId: string;
  version: string;
}

export class FirewallObjectExtensionSolutionStack extends cdk.Stack {
  SOLUTION_ID = "SO0196";
  REG_IAM_ARN = /arn:aws:iam::\d{12}:role\/\w+/;
  public readonly apiGatewayId: string;
  constructor(
    scope: cdk.Construct,
    id: string,
    props: FirewallObjectExtensionSolutionStackProperty
  ) {
    super(scope, id, props);
    const importVpcDetails =
      this.node.tryGetContext("importVpcDetails") ?? undefined;
    const networkConstruct = new AutConfigNetworkConstruct(
      this,
      "network",
      importVpcDetails
    );
    const vpc = networkConstruct.vpc;
    const trail = networkConstruct.trail;
    const dataSources = new AutConfigDataSourceConstructConstruct(
      this,
      "DataSources",
      { pointInTimeRecovery: true }
    );
    const loglevel = this.node.tryGetContext("loglevel");
    const defaultAggregatorName = this.node.tryGetContext(
      "defaultAggregatorName"
    );
    const networkFirewallRuleGroupNamePattern = this.node.tryGetContext(
      "networkFirewallRuleGroupNamePattern"
    );
    const secOpsAdminRole = this.importAdminRole();
    const crossAccountConfigReadOnlyRole = this.node.tryGetContext(
      "crossAccountConfigReadOnlyRole"
    );
    const apiGatewayType = this.node.tryGetContext("apiGatewayType");
    const crossAccountNetworkFirewallReadWriteRole = this.node.tryGetContext(
      "crossAccountNetworkFirewallReadWriteRole"
    );
    const enableOpa = !!this.node.tryGetContext("enableOpa");

    this.validateRoleFormat(
      crossAccountNetworkFirewallReadWriteRole,
      "crossAccountNetworkFirewallReadWriteRole"
    );
    this.validateRoleFormat(
      crossAccountConfigReadOnlyRole,
      "crossAccountConfigReadOnlyRole"
    );

    const autoConfigConstruct = new AutConfigConstructConstruct(
      this,
      "auto-config",
      {
        rulesTable: dataSources.rulesTable,
        ruleBundlesTable: dataSources.rulebundlesTable,
        objectsTable: dataSources.objectsTable,
        notificationTopic: dataSources.notificationTopic,
        notificationEncryptionKey: dataSources.snsEncryptionKey,
        vpc: vpc,
        solutionId: props.solutionId,
        version: props.version,
        trail: trail,
        loglevel,
        networkFirewallRuleGroupNamePattern,
        defaultAggregatorName,
        crossAccountConfigReadOnlyRole,
        crossAccountNetworkFirewallReadWriteRole,
      }
    );

    const opaCluster = this.createOPAClusterByConfig(enableOpa, vpc);
    const canaryRole = new iam.Role(this, `CanaryExecutionRole`, {
      assumedBy: new iam.ServicePrincipal("lambda"),
    });

    const apiConstruct = new AutConfigAPIConstructConstruct(
      this,
      "auto-config-api",
      {
        rulesTable: dataSources.rulesTable,
        ruleBundlesTable: dataSources.rulebundlesTable,
        objectsTable: dataSources.objectsTable,
        auditsTable: dataSources.auditsTable,
        vpc: vpc,
        opaClusterAlbName: opaCluster?.opaALBDnsName,
        allowTestInvoke: false,
        trail: trail,
        solutionId: props.solutionId,
        version: props.version,
        loglevel,
        networkFirewallRuleGroupNamePattern,
        defaultAggregatorName,
        crossAccountConfigReadOnlyRole,
        crossAccountNetworkFirewallReadWriteRole,
        apiGatewayType,
        canaryRole,
        secOpsAdminRole,
      }
    );

    // Has to do this after all the construct initialized otherwise it would be a circular dependency
    if (opaCluster) {
      const allowLambdaSg = new ec2.SecurityGroup(this, "SecurityGroup", {
        vpc: vpc,
        description: "Security group allowing lambda SG to access OPA ",
        allowAllOutbound: true,
      });
      allowLambdaSg.addIngressRule(
        apiConstruct.defaultSecurityGroup,
        ec2.Port.tcp(443)
      );
      opaCluster?.loadBalancedFargateService.loadBalancer.addSecurityGroup(
        allowLambdaSg
      );
    }

    this.allowAccessToVpcEndpointOnlyFromLambdas(
      dataSources,
      networkConstruct,
      apiConstruct,
      autoConfigConstruct
    );

    new ApiServiceDashboard(this, "auto-config-api-dashboard", {
      serviceName: "auto-config-api",
      apiName: apiConstruct.api.restApiName,
      functionName: apiConstruct.apiFunction.functionName,
      schedulerFunction: autoConfigConstruct.schedulerFunction,
      alarmsTriggerDuration: autoConfigConstruct.ruleResolutionInterval,
      auditsTableName: dataSources.auditsTable.tableName,
      objectsTableName: dataSources.objectsTable.tableName,
      rulesTableName: dataSources.rulesTable.tableName,
      ruleBundlesTableName: dataSources.rulebundlesTable.tableName,
      solutionOperationalTopic: dataSources.notificationTopic,
    });

    this.apiGatewayId = apiConstruct.api.restApiId;

    // Check ApiGateway type to decide if use VpcEndpoint
    const useVpcEndpoint = apiGatewayType === "private";

    const vpcConfig = useVpcEndpoint
      ? {
          vpcId: vpc.vpcId,
          subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
          securityGroupIds: [apiConstruct.defaultSecurityGroup.securityGroupId],
        }
      : undefined;

    const canary = this.createCanary(
      apiConstruct.api.restApiId,
      RemovalPolicy.DESTROY,
      vpcConfig,
      canaryRole
    );
    canary.canaryRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["execute-api:Invoke"],
        resources: [
          `arn:aws:execute-api:${Stack.of(this).region}:${
            Stack.of(this).account
          }:${this.apiGatewayId}/*/GET/*`,
        ],
      })
    );
    const sendAnonymousMetric =
      this.node.tryGetContext("sendAnonymousMetric") ?? "Yes";
    if (sendAnonymousMetric && !["Yes", "No"].includes(sendAnonymousMetric)) {
      Annotations.of(this).addError(
        "Configuration sendAnonymousMetric can only contain value Yes or No"
      );
    }

    new SolutionMetricsCollectorConstruct(this, "metrics-collector-construct", {
      version: props.version,
      solutionId: props.solutionId,
      solutionDisplayName:
        "Dynamic Object and Rule Extensions for AWS Network Firewall",
      sendAnonymousMetric: sendAnonymousMetric,
      functionName: "SolutionMetricsCollectorFunction",
      metricsData: {
        enabledOpa: enableOpa,
        crossAccount:
          crossAccountNetworkFirewallReadWriteRole ||
          crossAccountConfigReadOnlyRole,
        privateEndpoint: useVpcEndpoint,
        importedVpc: importVpcDetails ? true : false,
      },
    });
    Tags.of(this).add("SOLUTION-ID", props.solutionId);
    Tags.of(this).add("VERSION", props.version);
  }

  private importAdminRole(): iam.IRole | undefined {
    const secOpsAdminRole = this.node.tryGetContext(
      "objectExtensionSecOpsAdminRole"
    );
    this.validateRoleFormat(secOpsAdminRole, "objectExtensionSecOpsAdminRole");
    if (secOpsAdminRole) {
      return iam.Role.fromRoleArn(
        this,
        "objectExtensionSecOpsAdminRole",
        secOpsAdminRole
      );
    }
    return undefined;
  }

  private validateRoleFormat(role: string, roleName: string) {
    if (!role) {
      return;
    }
    const match = role.match(this.REG_IAM_ARN);
    if (!match) {
      Annotations.of(this).addError(
        `Invalid configuration, ${roleName} is not a valid arn`
      );
    }
  }

  private allowAccessToVpcEndpointOnlyFromLambdas(
    dataSources: AutConfigDataSourceConstructConstruct,
    networkConstruct: AutConfigNetworkConstruct,
    apiConstruct: AutConfigAPIConstructConstruct,
    autoConfigConstruct: AutConfigConstructConstruct
  ) {
    const targetTableArns = [
      dataSources.auditsTable.tableArn,
      dataSources.objectsTable.tableArn,
      dataSources.rulebundlesTable.tableArn,
      dataSources.rulesTable.tableArn,
    ];
    const targetResourceArn = targetTableArns
      .map((arn) => [arn ? arn + "/index/*" : "", arn])
      .flatMap((i) => i);

    networkConstruct.ddbEndpoint?.addToPolicy(
      iam.PolicyStatement.fromJson({
        Effect: iam.Effect.ALLOW,
        Principal: {
          AWS: "*",
        },
        Action: "dynamodb:*",
        Resource: targetResourceArn,
        Condition: {
          ArnEquals: {
            "aws:PrincipalArn": apiConstruct.apiFunction.role?.roleArn,
          },
        },
      })
    );
    networkConstruct.ddbEndpoint?.addToPolicy(
      iam.PolicyStatement.fromJson({
        Effect: iam.Effect.ALLOW,
        Principal: {
          AWS: "*",
        },
        Action: "dynamodb:*",
        Resource: targetResourceArn,
        Condition: {
          ArnEquals: {
            "aws:PrincipalArn":
              autoConfigConstruct.schedulerFunction.role?.roleArn,
          },
        },
      })
    );
    networkConstruct.ddbEndpoint?.addToPolicy(
      iam.PolicyStatement.fromJson({
        Effect: iam.Effect.ALLOW,
        Principal: {
          AWS: "*",
        },
        Action: "dynamodb:*",
        Resource: targetResourceArn,
        Condition: {
          ArnEquals: {
            "aws:PrincipalArn":
              autoConfigConstruct.autoConfigFunction.role?.roleArn,
          },
        },
      })
    );
  }

  private createOPAClusterByConfig(
    enableOpa: boolean,
    vpc: ec2.IVpc
  ): OpaECSCluster | undefined {
    if (enableOpa) {
      const opaECSCluster = new OpaECSCluster(this, "opa-cluster", {
        vpc: vpc,
      });
      return opaECSCluster;
    }
    return undefined;
  }

  private createCanary(
    restApiId: string,
    removePolicy: RemovalPolicy,
    vpcConfig?: synthetics.CfnCanary.VPCConfigProperty,
    canaryRole?: iam.IRole
  ): AGSSyntheticsCanary {
    const apiCanary = new AGSSyntheticsCanary(this, "canary", {
      canaryName: "ff-canary",
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_3_0,
      schedule: synthetics.Schedule.expression("rate(5 minutes)"),
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(
          fs
            .readFileSync(
              path.join(__dirname, "../lambda/canary/build/canary/index.js")
            )
            .toString()
        ),
        handler: "index.handler",
      }),
      environmentVariables: {
        TEST_TARGET_API: `https://${restApiId}.execute-api.${
          Stack.of(this).region
        }.amazonaws.com/prod/`,
      },
      startAfterCreation: true,
      removalPolicy: removePolicy,
      canaryRole: canaryRole,
      ...(vpcConfig && { vpcConfig: vpcConfig }),
    });
    return apiCanary;
  }
}
