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
import * as cloudwatch from "@aws-cdk/aws-cloudwatch";
import * as cw_actions from "@aws-cdk/aws-cloudwatch-actions";
import { IFunction } from "@aws-cdk/aws-lambda";
import * as sns from "@aws-cdk/aws-sns";
import * as cdk from "@aws-cdk/core";
import { Duration, Stack } from "@aws-cdk/core";
import { ServiceDashboard } from "./service-dashboard";

export interface ApiServiceDashboardProps {
  serviceName: string;
  apiName: string;
  functionName: string;
  objectsTableName: string;
  rulesTableName: string;
  ruleBundlesTableName: string;
  auditsTableName: string;
  schedulerFunction: IFunction;
  alarmsTriggerDuration: Duration;
  solutionOperationalTopic: sns.ITopic;
  canaryName?: string;
}

export class ApiServiceDashboard extends cdk.Construct {
  public dashboard: ServiceDashboard;
  constructor(
    scope: cdk.Construct,
    id: string,
    props: ApiServiceDashboardProps
  ) {
    super(scope, id);

    const SCHEDULER_FRIENDLY_NAME = "firewall-object-rule-scheduler";
    this.dashboard = new ServiceDashboard(this, "service-dashboard", {
      dashboardName: `RuleExtensionServiceDashboard${Stack.of(this).region}`,
      apiGateway: {
        apiName: props.apiName,
        endpoints: [
          { method: "GET", resource: "/audits" },

          { method: "POST", resource: "/objects" },
          { method: "GET", resource: "/objects" },
          { method: "GET", resource: "/objects/{id}" },
          { method: "PUT", resource: "/objects/{id}" },

          { method: "POST", resource: "/rulebundles" },
          { method: "GET", resource: "/rulebundles" },
          { method: "PUT", resource: "/rulebundles/{id}" },
          { method: "GET", resource: "/rulebundles/{id}" },

          { method: "POST", resource: "/rulebundles/{id}/rules" },
          { method: "GET", resource: "/rulebundles/{id}/rules" },
          { method: "GET", resource: "/rulebundles/{id}/rules/{ruleId}" },
          { method: "PUT", resource: "/rulebundles/{id}/rules/{ruleId}" },
          { method: "DELETE", resource: "/rulebundles/{id}/rules/{ruleId}" },
        ],
      },
      serviceName: props.serviceName,
      lambdas: [
        {
          functionName: props.functionName,
          friendlyName: "firewall-object-rule-api",
        },
        {
          functionName: props.schedulerFunction.functionName,
          friendlyName: SCHEDULER_FRIENDLY_NAME,
        },
      ],
      dynamoDbTables: [
        {
          tableName: props.objectsTableName,
          friendlyTableName: "Objects",
        },
        {
          tableName: props.auditsTableName,
          friendlyTableName: "Audits",
        },
        {
          tableName: props.rulesTableName,
          friendlyTableName: "Rules",
        },
        {
          tableName: props.ruleBundlesTableName,
          friendlyTableName: "RuleBundles",
        },
      ],
    });

    // alarm if no error happens on remote
    const errorAlarm = props.schedulerFunction
      .metricErrors({ period: props.alarmsTriggerDuration })
      .createAlarm(this, "Error-Alarm", {
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: "Too many error on scheduler",
      });

    // alarm if no invoke at all in the max configuration period
    const noInvocationAlarm = props.schedulerFunction
      .metricInvocations({ period: Duration.minutes(60) })
      .createAlarm(this, "Non-Invocation-Alarm", {
        threshold: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
      });
    noInvocationAlarm.addAlarmAction(
      new cw_actions.SnsAction(props.solutionOperationalTopic)
    );
    errorAlarm.addAlarmAction(
      new cw_actions.SnsAction(props.solutionOperationalTopic)
    );
  }
}
