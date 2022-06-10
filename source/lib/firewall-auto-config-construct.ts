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
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SubnetType } from '@aws-cdk/aws-ec2';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import { Tracing } from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import {
    Annotations,
    CfnOutput,
    Construct,
    Duration,
    Stack,
} from '@aws-cdk/core';
import * as path from 'path';
import * as sqs from '@aws-cdk/aws-sqs';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';

export interface AutConfigConstructProps {
    ruleBundlesTable: dynamodb.Table;
    rulesTable: dynamodb.Table;
    objectsTable: dynamodb.Table;
    notificationTopic: sns.Topic;
    notificationEncryptionKey: kms.Key;
    vpc: ec2.IVpc;
    solutionId: string;
    version: string;
    trail?: cloudtrail.Trail;
    networkFirewallRuleGroupNamePattern?: string;
    loglevel?: string;
    defaultAggregatorName?: string;
    crossAccountConfigReadOnlyRole?: string;
    crossAccountNetworkFirewallReadWriteRole?: string;
}

const MIN_INTERVAL = 5;
const MAX_INTERVAL = 60;
const DEFAULT_INTERVAL = 10;
export class AutConfigConstructConstruct extends Construct {
    autoConfigFunction: lambda.Function;
    schedulerFunction: lambda.Function;
    public readonly ruleResolutionInterval: Duration;
    constructor(scope: Construct, id: string, props: AutConfigConstructProps) {
        super(scope, id);
        const functionName = 'AutoConfigFunction';
        const loglevel = props.loglevel ?? 'DEBUG';
        const defaultAggregatorName =
            props.defaultAggregatorName ?? 'org-replicator';
        const ruleGroupNamePattern =
            props.networkFirewallRuleGroupNamePattern ?? 'default-anfwconfig-*';
        const crossAccountConfigReadonlyRole =
            props.crossAccountConfigReadOnlyRole;
        const crossAccountNetworkFirewallReadWriteRole =
            props.crossAccountNetworkFirewallReadWriteRole;

        const functionRole = new iam.Role(this, 'ExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            ...(crossAccountConfigReadonlyRole && {
                roleName: `${functionName}ExecutionRole`,
            }),
            description: `Lambda execution role for function`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaBasicExecutionRole'
                ),
                // must to have this one for lambda to run in VPC
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaVPCAccessExecutionRole'
                ),
            ],
        });

        const additionalPolicies = [
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'network-firewall:CreateRuleGroup',
                    'network-firewall:ListRuleGroups',
                    'network-firewall:DescribeRuleGroup',
                    'network-firewall:UpdateRuleGroup',
                ],
                resources: [
                    `arn:aws:network-firewall:${Stack.of(this).region}:${
                        Stack.of(this).account
                    }:stateful-rulegroup/${ruleGroupNamePattern}`,
                ],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['SNS:Publish'],
                resources: [props.notificationTopic.topicArn],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['config:SelectAggregateResourceConfig'],
                resources: [
                    `arn:aws:config:${Stack.of(this).region}:${
                        Stack.of(this).account
                    }:config-aggregator/*`,
                ],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['kms:GenerateDataKey'],
                resources: [props.notificationEncryptionKey.keyArn],
            }),
        ];

        if (crossAccountConfigReadonlyRole) {
            additionalPolicies.push(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['sts:AssumeRole'],
                    resources: [crossAccountConfigReadonlyRole],
                })
            );
        }
        // Allow cross account assume role if cross account role provided
        this.attachAcrossAccountAssumeRolePermission(
            additionalPolicies,
            crossAccountConfigReadonlyRole
        );
        this.attachAcrossAccountAssumeRolePermission(
            additionalPolicies,
            crossAccountNetworkFirewallReadWriteRole
        );

        const autoConfigFunctionDLQ = new sqs.Queue(
            this,
            'autoConfigFunctionDLQ',
            {
                encryption: sqs.QueueEncryption.KMS_MANAGED,
            }
        );

        this.autoConfigFunction = new lambda.Function(
            this,
            'autoConfig',

            {
                handler: 'app.lambdaHandler',
                code: lambda.Code.fromAsset(
                    path.resolve(
                        __dirname,
                        `../lambda/firewall-auto-config/.aws-sam/build/${functionName}`
                    )
                ),

                timeout: Duration.minutes(15),
                initialPolicy: [...additionalPolicies],
                runtime: lambda.Runtime.NODEJS_14_X,
                role: functionRole,
                description:
                    'Firewall object extension rule resolution and application lambda,\
                 periodically triggered by schedule lambda to translate \
                 cloud resource reference into network firewall rules',
                deadLetterQueue: autoConfigFunctionDLQ,
                vpc: props.vpc,
                vpcSubnets: { subnetType: SubnetType.PRIVATE },
                memorySize: 3008,
                tracing: Tracing.ACTIVE,
                environment: {
                    RULES_TABLE_NAME: props.rulesTable.tableName,
                    OBJECTS_TABLE_NAME: props.objectsTable.tableName,
                    RULEBUNDLES_TABLE_NAME: props.ruleBundlesTable.tableName,
                    RULE_NOTIFICATION_TOPIC_ARN:
                        props.notificationTopic.topicArn,
                    LOGLEVEL: loglevel,
                    DEFAULT_AGGREGATOR_NAME: defaultAggregatorName,
                    CROSS_ACCOUNT_CONFIG_ROLE:
                        crossAccountConfigReadonlyRole ?? '',
                    CROSS_ACCOUNT_ANFW_ROLE:
                        crossAccountNetworkFirewallReadWriteRole ?? '',
                    SOLUTION_ID: props.solutionId,
                    VERSION: props.version,
                },
            }
        );

        const scheduleFunctionRole = new iam.Role(
            this,
            'scheduleFunctionExecutionRole',
            {
                assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
                description: `Lambda execution role for lambda`,
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName(
                        'service-role/AWSLambdaBasicExecutionRole'
                    ),
                    // must to have this one for lambda to run in VPC
                    iam.ManagedPolicy.fromAwsManagedPolicyName(
                        'service-role/AWSLambdaVPCAccessExecutionRole'
                    ),
                ],
            }
        );
        const schedulerFunctionName = 'AutoConfigSchedulerFunction';
        this.ruleResolutionInterval = this.getEvaluationIntervalValue();

        const schedulerFunctionDLQ = new sqs.Queue(
            this,
            'schedulerFunctionDLQ',
            {
                encryption: sqs.QueueEncryption.KMS_MANAGED,
            }
        );
        this.schedulerFunction = new lambda.Function(
            this,
            'autoConfigScheduler',

            {
                handler: 'app.lambdaHandler',
                code: lambda.Code.fromAsset(
                    path.resolve(
                        __dirname,
                        `../lambda/firewall-config-scheduler/.aws-sam/build/${schedulerFunctionName}`
                    )
                ),

                timeout: this.ruleResolutionInterval,
                description:
                    'Firewall object extension scheduler lambda, \
                periodically triggered to get all the rule bundles',
                // initialPolicy: [...additionalPolicies],
                runtime: lambda.Runtime.NODEJS_14_X,
                role: scheduleFunctionRole,
                deadLetterQueue: schedulerFunctionDLQ,
                memorySize: 1024,
                vpc: props.vpc,
                vpcSubnets: { subnetType: SubnetType.PRIVATE },
                tracing: Tracing.ACTIVE,
                // not allow/need parallel invocation
                environment: {
                    RULEBUNDLES_TABLE_NAME: props.ruleBundlesTable.tableName,
                    AUTO_CONFIG_FUNCTION_NAME:
                        this.autoConfigFunction.functionName,
                    LOGLEVEL: 'DEBUG',
                    SOLUTION_ID: props.solutionId,
                    VERSION: props.version,
                },
            }
        );
        new CfnOutput(this, 'autoConfigFunctionScheduler', {
            value: this.schedulerFunction.functionName,
        });

        if (props.trail) {
            props.trail.addLambdaEventSelector([
                this.schedulerFunction,
                this.autoConfigFunction,
            ]);
        }
        const ruleSchedulerTriggerEventRule = new events.Rule(
            this,
            'TriggerRule',
            {
                schedule: events.Schedule.rate(this.ruleResolutionInterval),
                description:
                    'Trigger auto configure scheduler lambda based on the configured interval value of ruleResolutionInterval',
            }
        );
        ruleSchedulerTriggerEventRule.addTarget(
            new targets.LambdaFunction(this.schedulerFunction)
        );

        this.autoConfigFunction.grantInvoke(this.schedulerFunction);
        props.rulesTable.grantReadWriteData(this.autoConfigFunction);
        props.objectsTable.grantReadWriteData(this.autoConfigFunction);
        props.ruleBundlesTable.grantReadWriteData(this.autoConfigFunction);
        props.ruleBundlesTable.grantReadWriteData(this.schedulerFunction);
        props.notificationTopic.grantPublish(this.autoConfigFunction);
        props.notificationEncryptionKey.grantEncryptDecrypt(
            this.autoConfigFunction
        );
    }

    private getEvaluationIntervalValue(): Duration {
        const configuredValue = this.node.tryGetContext(
            'ruleResolutionInterval'
        );
        let intervalValue = parseInt(configuredValue as string);
        if (
            !intervalValue ||
            intervalValue < MIN_INTERVAL ||
            intervalValue > MAX_INTERVAL ||
            isNaN(intervalValue)
        ) {
            Annotations.of(this).addWarning(
                `configuration ruleResolutionInterval is not in range of [${MIN_INTERVAL}, ${MAX_INTERVAL}], setting value to default ${DEFAULT_INTERVAL}`
            );
            intervalValue = DEFAULT_INTERVAL;
        }
        return Duration.minutes(intervalValue);
    }

    private attachAcrossAccountAssumeRolePermission(
        additionalPolicies: iam.PolicyStatement[],
        crossAccountConfigReadonlyRole?: string
    ) {
        if (crossAccountConfigReadonlyRole) {
            additionalPolicies.push(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['sts:AssumeRole'],
                    resources: [crossAccountConfigReadonlyRole],
                })
            );
        }
    }
}
