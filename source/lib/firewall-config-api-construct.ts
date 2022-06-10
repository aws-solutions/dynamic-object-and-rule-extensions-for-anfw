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
import * as apigateway from "@aws-cdk/aws-apigateway";
import { LambdaIntegration } from "@aws-cdk/aws-apigateway";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import { Tracing } from "@aws-cdk/aws-lambda";
import { CfnOutput, Construct, Duration, Names, Stack } from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as path from "path";
import * as logs from "@aws-cdk/aws-logs";
import * as kms from "@aws-cdk/aws-kms";
import * as cdk from "@aws-cdk/core";
import * as sqs from "@aws-cdk/aws-sqs";
import * as cloudtrail from "@aws-cdk/aws-cloudtrail";

export interface AutConfigAPIConstructProps {
  ruleBundlesTable: dynamodb.Table;
  rulesTable: dynamodb.Table;
  objectsTable: dynamodb.Table;
  auditsTable: dynamodb.Table;
  allowTestInvoke: boolean;
  opaClusterAlbName?: string;
  vpc: ec2.IVpc;
  additionalRoles?: iam.Role[];
  solutionId: string;
  version: string;
  trail?: cloudtrail.Trail;
  networkFirewallRuleGroupNamePattern?: string;
  loglevel?: string;
  defaultAggregatorName?: string;
  crossAccountConfigReadOnlyRole?: string;
  crossAccountNetworkFirewallReadWriteRole?: string;
  apiGatewayType?: string;
  canaryRole?: iam.IRole;
  secOpsAdminRole?: iam.IRole;
}

export interface ApiEndpoint {
  resourcePath: string;
  httpMethod: string;
}

export interface APIUserPermission {
  endpoints: ApiEndpoint[];
  allowedPersona: PersonaType[];
  exactMatch?: boolean;
}

type PersonaType = "SEC_OPS" | "APP_OWNER";
export interface APIRolePersona {
  personaType: PersonaType;
  roleArn: string;
}

const permissionDefinitions: APIUserPermission[] = [
  {
    endpoints: [
      { httpMethod: "GET", resourcePath: "audits" },
      { httpMethod: "POST", resourcePath: "objects" },
      { httpMethod: "GET", resourcePath: "objects" },
      { httpMethod: "GET", resourcePath: "objects/{id}" },
      { httpMethod: "PUT", resourcePath: "objects/{id}" },
      { httpMethod: "DELETE", resourcePath: "objects/{id}" },

      { httpMethod: "POST", resourcePath: "rulebundles" },
      { httpMethod: "GET", resourcePath: "rulebundles" },
      { httpMethod: "PUT", resourcePath: "rulebundles/{id}" },
      { httpMethod: "GET", resourcePath: "rulebundles/{id}" },

      { httpMethod: "POST", resourcePath: "rulebundles/{id}/rules" },
      { httpMethod: "GET", resourcePath: "rulebundles/{id}/rules" },
      { httpMethod: "GET", resourcePath: "rulebundles/{id}/rules/{ruleId}" },
      { httpMethod: "PUT", resourcePath: "rulebundles/{id}/rules/{ruleId}" },
      { httpMethod: "DELETE", resourcePath: "rulebundles/{id}/rules/{ruleId}" },
    ],

    allowedPersona: ["SEC_OPS"],
  },
];

export class AutConfigAPIConstructConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly apiFunction: lambda.Function;
  public readonly defaultSecurityGroup: ec2.SecurityGroup;
  private apiGatewayType: string;
  private readonly canaryRole?: iam.IRole;

  constructor(scope: Construct, id: string, props: AutConfigAPIConstructProps) {
    super(scope, id);
    this.canaryRole = props.canaryRole;
    const functionName = "AutoConfigAPIFunction";
    const defaultPolicyIds =
      this.node.tryGetContext("defaultPolicyIds") ??
      "forbidden_cross_object_reference,forbidden_create_modify_deny_rules_for_non_admin";
    const loglevel = props.loglevel ?? "DEBUG";
    const defaultAggregatorName =
      props.defaultAggregatorName ?? "org-replicator";
    const ruleGroupNamePattern =
      props.networkFirewallRuleGroupNamePattern ?? "default-anfwconfig-rule-*";
    this.apiGatewayType = props.apiGatewayType ?? "private";

    const functionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      ...(props.crossAccountConfigReadOnlyRole && {
        roleName: `${functionName}ExecutionRole`,
      }),
      description: `Lambda execution role for function`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
        // must to have this one for lambda to run in VPC
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
      ],
    });

    // Check ApiGateway type to decide if use VpcEndpoint
    const useVpcEndpoint = this.apiGatewayType === "private";

    // compose VpcEndpoint setting
    const endpointConfig = this.createAPIgateWayEndpointConfig(
      useVpcEndpoint,
      props
    );
    this.defaultSecurityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: props.vpc,
      description:
        "Security group for fire fly Lambda Function " + Names.uniqueId(this),
      allowAllOutbound: true,
    });

    const additionalPolicies = [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "network-firewall:ListRuleGroups",
          "network-firewall:DescribeRuleGroup",
          "network-firewall:UpdateRuleGroup",
        ],
        resources: [
          `arn:aws:network-firewall:${Stack.of(this).region}:${
            Stack.of(this).account
          }:stateful-rulegroup/${ruleGroupNamePattern}`,
        ],
      }),

      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "config:SelectAggregateResourceConfig",
          "config:DescribeConfigurationAggregators",
        ],
        // https://docs.aws.amazon.com/service-authorization/latest/reference/list_awsconfig.html only * can be added
        resources: [`*`],
      }),
    ];

    // Allow cross account assume role if cross account role provided
    this.attachAcrossAccountAssumeRolePermission(
      additionalPolicies,
      props.crossAccountConfigReadOnlyRole
    );
    this.attachAcrossAccountAssumeRolePermission(
      additionalPolicies,
      props.crossAccountNetworkFirewallReadWriteRole
    );

    const apiFunctionDLQ = new sqs.Queue(this, "apiFunctionDLQ", {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    this.apiFunction = new lambda.Function(
      this,
      "autoConfig",

      {
        handler: "app.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.resolve(
            __dirname,
            `../lambda/firewall-config-api/.aws-sam/build/${functionName}`
          )
        ),

        timeout: Duration.seconds(30),
        initialPolicy: [...additionalPolicies],
        runtime: lambda.Runtime.NODEJS_14_X,
        role: functionRole,
        deadLetterQueue: apiFunctionDLQ,
        memorySize: 3008,
        tracing: Tracing.ACTIVE,
        vpc: props.vpc,
        securityGroups: [this.defaultSecurityGroup],
        environment: {
          RULES_TABLE_NAME: props.rulesTable.tableName,
          OBJECTS_TABLE_NAME: props.objectsTable.tableName,
          RULEBUNDLES_TABLE_NAME: props.ruleBundlesTable.tableName,
          AUDITS_TABLE_NAME: props.auditsTable.tableName,
          LOGLEVEL: loglevel,
          DEFAULT_AGGREGATOR_NAME: defaultAggregatorName,
          ...(props.opaClusterAlbName && { OPA_URL: props.opaClusterAlbName }),
          OPA_POLICY_LIST: defaultPolicyIds,
          CROSS_ACCOUNT_CONFIG_ROLE: props.crossAccountConfigReadOnlyRole ?? "",
          CROSS_ACCOUNT_ANFW_ROLE:
            props.crossAccountNetworkFirewallReadWriteRole ?? "",
          SOLUTION_ID: props.solutionId,
          VERSION: props.version,
        },
      }
    );

    if (props.trail) {
      props.trail.addLambdaEventSelector([this.apiFunction]);
    }
    props.objectsTable.grantReadWriteData(this.apiFunction);
    props.ruleBundlesTable.grantReadWriteData(this.apiFunction);
    props.rulesTable.grantReadWriteData(this.apiFunction);
    props.auditsTable.grantReadWriteData(this.apiFunction);
    const adminUserRole =
      props.secOpsAdminRole ??
      new iam.Role(this, "api-admin-role", {
        assumedBy: new iam.AccountRootPrincipal(),
        roleName: `ObjectExtensionSecOpsAdminRole-${Stack.of(this).region}`,
      });
    const appOwnerApiAccessRole = new iam.Role(this, "api-app-owner-role", {
      assumedBy: new iam.AccountRootPrincipal(),
    });
    const serviceName = "NetworkFirewallObjectExtension";
    const personas: APIRolePersona[] = [
      { personaType: "SEC_OPS", roleArn: adminUserRole.roleArn },
      { personaType: "APP_OWNER", roleArn: appOwnerApiAccessRole.roleArn },
    ];
    const policyDoc = this.createAPIgatewayResourcePolicy(personas, props);
    const accessLogGroup = this.createAccessLogGroup();

    this.api = new apigateway.RestApi(this, `API`, {
      description: `Rest Api for Firewall config`,
      defaultIntegration: new LambdaIntegration(this.apiFunction, {
        proxy: true, //lambda proxy should be always on
        allowTestInvoke: props.allowTestInvoke,
      }),
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
      },
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.IAM,
      },
      policy: policyDoc,
      endpointConfiguration: endpointConfig,
      deployOptions: {
        metricsEnabled: true,
        tracingEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(
          accessLogGroup
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
      restApiName: `${serviceName}-API`,
    });

    this.api.addUsagePlan("API-usage-plan").addApiStage({
      stage: this.api.deploymentStage,
    });

    adminUserRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["execute-api:Invoke"],
        resources: [
          `arn:aws:execute-api:${Stack.of(this).region}:${
            Stack.of(this).account
          }:${this.api.restApiId}/*/*/*`,
        ],
      })
    );
    const rulebundlesResource = this.api.root.addResource("rulebundles");
    rulebundlesResource.addMethod("GET");
    rulebundlesResource.addMethod("POST");

    this.apiFunction.addEnvironment(
      "ADMINISTRATOR_ROLE",
      adminUserRole.roleArn
    );
    this.apiFunction.addEnvironment(
      "APPLICATION_OWNER_ROLES",
      appOwnerApiAccessRole.roleArn
    );

    new CfnOutput(this, "adminRoleArn", {
      value: adminUserRole.roleArn,
    });

    const rulebundlesIdResource = rulebundlesResource.addResource("{id}");
    rulebundlesIdResource.addMethod("GET");
    rulebundlesIdResource.addMethod("PUT");
    rulebundlesIdResource.addMethod("DELETE");

    const rulesResource = rulebundlesIdResource.addResource("rules");
    rulesResource.addMethod("POST");
    rulesResource.addMethod("GET");
    const ruleIdResource = rulesResource.addResource("{ruleId}");
    ruleIdResource.addMethod("PUT");
    ruleIdResource.addMethod("GET");
    ruleIdResource.addMethod("DELETE");

    const objectsResource = this.api.root.addResource("objects");

    objectsResource.addMethod("GET");
    objectsResource.addMethod("POST");

    const objectsIdResource = objectsResource.addResource("{id}");
    objectsIdResource.addMethod("GET");
    objectsIdResource.addMethod("PUT");
    objectsIdResource.addMethod("DELETE");

    const auditsResource = this.api.root.addResource("audits");
    auditsResource.addMethod("GET");
  }

  private attachAcrossAccountAssumeRolePermission(
    additionalPolicies: iam.PolicyStatement[],
    crossAccountConfigReadonlyRole?: string
  ) {
    if (crossAccountConfigReadonlyRole) {
      additionalPolicies.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sts:AssumeRole"],
          resources: [crossAccountConfigReadonlyRole],
        })
      );
    }
  }

  private createAccessLogGroup() {
    const encryptionKey = new kms.Key(this, "VpcFlowLogsKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });
    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        sid: "Allow Access Logs to use the key",
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
        // This is a resource policy
        resources: ["*"],
      })
    );
    const accessLogGroup = new logs.LogGroup(this, "ApiGatewayAccessLogs", {
      encryptionKey: encryptionKey,
    });
    return accessLogGroup;
  }

  private createAPIgatewayResourcePolicy(
    personas: APIRolePersona[],
    props: AutConfigAPIConstructProps
  ) {
    const policyDoc = this.composeApiResourcePolicy(
      permissionDefinitions,
      personas
    );

    if (this.apiGatewayType === "private") {
      policyDoc.addStatements(
        iam.PolicyStatement.fromJson({
          Effect: iam.Effect.DENY,
          Principal: {
            AWS: "*",
          },
          Action: "execute-api:Invoke",
          Resource: `arn:aws:execute-api:${Stack.of(this).region}:${
            Stack.of(this).account
          }:*/*/*/*`,
          Condition: {
            StringNotEquals: {
              "aws:sourceVpc": props.vpc.vpcId,
            },
          },
        })
      );
    }
    return policyDoc;
  }

  composeApiResourcePolicy(
    permissionDefinitions: APIUserPermission[],
    personas: APIRolePersona[]
  ): iam.PolicyDocument {
    const policyDoc = new iam.PolicyDocument();
    const apiResourceStatements: iam.PolicyStatement[] = [];
    permissionDefinitions.forEach((permission: APIUserPermission) => {
      const personaRoles = personas.filter((p) =>
        permission.allowedPersona.includes(p.personaType)
      );
      // generate resource list of this statement
      const resources = permission.endpoints.map(
        ({ resourcePath, httpMethod }) =>
          `execute-api:/*/${httpMethod.toUpperCase()}/${resourcePath}`
      );

      // allow statement
      const allowStatements = personaRoles.map((pr) => {
        return iam.PolicyStatement.fromJson({
          Effect: iam.Effect.ALLOW,
          Principal: {
            AWS: "*",
          },
          Action: "execute-api:Invoke",
          Resource: resources,
          Condition: {
            StringEquals: {
              "aws:PrincipalArn": pr.roleArn,
            },
          },
        });
      });
      // deny statement
      const denyIfNotGivenPersonalStatements = personaRoles.map((pr) => {
        return iam.PolicyStatement.fromJson({
          Effect: iam.Effect.DENY,
          Principal: {
            AWS: "*",
          },
          Action: "execute-api:Invoke",
          Resource: `arn:aws:execute-api:${Stack.of(this).region}:${
            Stack.of(this).account
          }:*/*/*`,
          Condition: {
            "ForAllValues:StringNotEquals": {
              "aws:PrincipalArn": [pr.roleArn, this.canaryRole?.roleArn],
            },
          },
        });
      });

      apiResourceStatements.push(
        ...allowStatements,
        ...denyIfNotGivenPersonalStatements
      );
    });

    policyDoc.addStatements(...apiResourceStatements);

    return policyDoc;
  }

  private createAPIgateWayEndpointConfig(
    useVpcEndpoint: boolean,
    props: AutConfigAPIConstructProps
  ) {
    let endpointConfig = undefined;
    if (useVpcEndpoint) {
      const vpcEndpointSecurityGroup = new ec2.SecurityGroup(
        this,
        `apigw-vpc-endpoint-sg`,
        {
          vpc: props.vpc,
          allowAllOutbound: false,
        }
      );

      vpcEndpointSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        ec2.Port.tcp(443)
      );
      vpcEndpointSecurityGroup.addEgressRule(
        ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        ec2.Port.tcp(443)
      );

      const vpcEndPoint = new ec2.InterfaceVpcEndpoint(
        this,
        `api-vpc-endpoint`,
        {
          vpc: props.vpc,
          service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
          privateDnsEnabled: true,
          securityGroups: [vpcEndpointSecurityGroup],
          subnets: {
            subnetType: ec2.SubnetType.PRIVATE,
          },
        }
      );

      endpointConfig = {
        types: [apigateway.EndpointType.PRIVATE],
        vpcEndpoints: [vpcEndPoint],
      };
    } else {
      endpointConfig = {
        types: [apigateway.EndpointType.EDGE],
      };
    }
    return endpointConfig;
  }
}
