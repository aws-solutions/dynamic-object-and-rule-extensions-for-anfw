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

import { Duration } from "aws-cdk-lib";
import {
  Dashboard,
  DimensionsMap,
  GraphWidget,
  GraphWidgetProps,
  IMetric,
  IWidget,
  MathExpression,
  Metric,
  MetricProps,
  Statistic,
  Unit,
} from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";

export interface ApiGatewayWidgetProps {
  apiName: string;
  endpoints: { method: string; resource: string; friendlyName?: string }[];
}

export interface LambdaWidgetProps {
  functionName: string;
  friendlyName?: string;
}

export interface DynamoDbWidgetProps {
  tableName: string;
  friendlyTableName?: string;
}

export interface ServiceDashboardProps {
  dashboardName?: string;
  serviceName: string;
  canaryName?: string;
  lambdas: LambdaWidgetProps[];
  apiGateway?: ApiGatewayWidgetProps;
  dynamoDbTables?: DynamoDbWidgetProps[];
  additionalWidgets?: IWidget[];
}

export class ServiceDashboard extends Construct {
  public readonly dashboard: Dashboard;
  public keyMetrics: Map<string, IMetric>;

  constructor(scope: Construct, id: string, props: ServiceDashboardProps) {
    super(scope, id);
    this.keyMetrics = new Map();
    const dashboard = new Dashboard(this, `${props.serviceName}-dashboard`, {
      dashboardName: props.dashboardName,
    });

    // canary and api gateway widgets
    if (props.apiGateway) {
      dashboard.addWidgets(
        ...this.createApiWidgets(props.apiGateway, props.canaryName)
      );
    }

    // lambda widgets
    dashboard.addWidgets(
      ...props.lambdas
        .map((lambda) => this.createLambdaWidgets(lambda))
        .reduce((previous, current) => previous.concat(current))
    );

    // dynamo db
    if (props.dynamoDbTables && props.dynamoDbTables.length > 0) {
      dashboard.addWidgets(
        ...props.dynamoDbTables
          .map((table) => this.createDynamoDbWidgets(table))
          .reduce((previous, current) => previous.concat(current))
      );
    }

    if (props.additionalWidgets && props.additionalWidgets.length > 0) {
      dashboard.addWidgets(...props.additionalWidgets);
    }
    this.dashboard = dashboard;
  }

  private createLambdaWidgets(lambda: LambdaWidgetProps): IWidget[] {
    const prefix = lambda.friendlyName ?? lambda.functionName;
    const successRateMetrics = this.createSuccessRateMetrics(lambda);
    const maximumDurationMetrics = this.lambdaMetric(
      lambda,
      "Maximum",
      "Duration",
      Statistic.MAXIMUM,
      Unit.MILLISECONDS
    );
    const averageDurationMetrics = this.lambdaMetric(
      lambda,
      "Average",
      "Duration",
      Statistic.AVERAGE,
      Unit.MILLISECONDS
    );
    const minDurationMetrics = this.lambdaMetric(
      lambda,
      "Minimum",
      "Duration",
      Statistic.MINIMUM,
      Unit.MILLISECONDS
    );
    this.keyMetrics.set(`SUCCESS_RATE_${prefix}`, successRateMetrics);

    return [
      this.lambdaWidget(`${prefix} - Duration`, [
        minDurationMetrics,
        maximumDurationMetrics,
        averageDurationMetrics,
      ]),
      this.createGraphWidget({
        title: `${prefix} -  Success Rate`,
        left: [successRateMetrics],
        leftYAxis: { max: 100, min: 0, label: "Percent", showUnits: false },
      }),
    ];
  }

  private createSuccessRateMetrics(lambda: LambdaWidgetProps) {
    const invocations: IMetric = this.lambdaMetric(
      lambda,
      "Invocations",
      "Invocations",
      Statistic.SUM,
      Unit.COUNT
    );

    const errorCount: IMetric = this.lambdaMetric(
      lambda,
      "Error",
      "Errors",
      Statistic.SUM,
      Unit.COUNT
    );

    const successRateMetrics = new MathExpression({
      expression: "100 - 100 * errors / MAX([errors, invocations])",
      usingMetrics: {
        errors: errorCount,
        invocations: invocations,
      },
      period: Duration.minutes(5),
      label: "Success rate",
    });

    return successRateMetrics;
  }

  private createApiWidgets(
    apg: ApiGatewayWidgetProps,
    canaryName?: string
  ): IWidget[] {
    const metrics = [];

    if (canaryName) {
      metrics.push(
        this.apiGatewayWidget("Canary Status", [
          this.createGraphMetric({
            metricName: "SuccessPercent",
            namespace: "CloudWatchSynthetics",
            label: "Canary Status",
            statistic: Statistic.AVERAGE,
            unit: Unit.PERCENT,
            dimensionsMap: { CanaryName: canaryName },
          }),
        ])
      );
    }

    metrics.push(
      this.apiGatewayWidget(
        "API Invocation",
        apg.endpoints.map((api) =>
          this.apiGatewayMetric(
            apg.apiName,
            api.friendlyName ?? `${api.method} ${api.resource}`,
            "Count",
            Statistic.SUM,
            Unit.COUNT,
            api.method,
            api.resource
          )
        )
      ),
      this.apiGatewayWidget(
        "API Latency",
        apg.endpoints.map((api) =>
          this.apiGatewayMetric(
            apg.apiName,
            api.friendlyName ?? `${api.method} ${api.resource}`,
            "Latency",
            Statistic.AVERAGE,
            Unit.MILLISECONDS,
            api.method,
            api.resource
          )
        )
      ),
      this.apiGatewayWidget(
        "API Errors",
        apg.endpoints.map((api) =>
          this.apiGatewayMetric(
            apg.apiName,
            api.friendlyName ?? `${api.method} ${api.resource}`,
            "4XXError",
            Statistic.SUM,
            Unit.COUNT,
            api.method,
            api.resource
          )
        ),
        apg.endpoints.map((api) =>
          this.apiGatewayMetric(
            apg.apiName,
            api.friendlyName ?? `${api.method} ${api.resource}`,
            "5XXError",
            Statistic.SUM,
            Unit.COUNT,
            api.method,
            api.resource
          )
        ),
        "4XX Errors",
        "5XX Errors"
      )
    );

    return metrics;
  }

  private lambdaWidget(title: string, metrics: IMetric[]): IWidget {
    return this.createGraphWidget({ title, left: metrics });
  }

  private lambdaMetric(
    lambda: LambdaWidgetProps,
    label: string,
    metricName: string,
    statistic: Statistic,
    unit?: Unit
  ): IMetric {
    return this.createGraphMetric({
      label,
      metricName,
      namespace: "AWS/Lambda",
      statistic,
      unit,
      dimensionsMap: { FunctionName: lambda.functionName },
    });
  }

  private createDynamoDbWidgets(dynamoDbTable: DynamoDbWidgetProps): IWidget[] {
    const prefix = dynamoDbTable.friendlyTableName ?? dynamoDbTable.tableName;
    return [
      this.ddbWidget(`${prefix} - Capacity`, [
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Provisioned Read",
          "ProvisionedReadCapacityUnits",
          Statistic.AVERAGE,
          Unit.COUNT
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Consumed Read",
          "ConsumedReadCapacityUnits",
          Statistic.AVERAGE,
          Unit.COUNT
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Provisioned Read",
          "ProvisionedWriteCapacityUnits",
          Statistic.AVERAGE,
          Unit.COUNT
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Consumed Read",
          "ConsumedWriteCapacityUnits",
          Statistic.AVERAGE,
          Unit.COUNT
        ),
      ]),
      this.ddbWidget(`${prefix} - Latency`, [
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Get Latency",
          "SuccessfulRequestLatency",
          Statistic.AVERAGE,
          Unit.MILLISECONDS,
          { Operation: "GetItem" }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Put Latency",
          "SuccessfulRequestLatency",
          Statistic.AVERAGE,
          Unit.MILLISECONDS,
          { Operation: "PutItem" }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Scan Latency",
          "SuccessfulRequestLatency",
          Statistic.AVERAGE,
          Unit.MILLISECONDS,
          { Operation: "Scan" }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Query Latency",
          "SuccessfulRequestLatency",
          Statistic.AVERAGE,
          Unit.MILLISECONDS,
          { Operation: "Query" }
        ),
      ]),
      this.ddbWidget(`${prefix} - Errors`, [
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Get",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "GetItem",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Batch Get",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "BatchGetItem",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Scan",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "Scan",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Query",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "Query",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Put",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "PutItem",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Batch Write",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "BatchWriteItem",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Update",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "UpdateItem",
          }
        ),
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Delete",
          "SystemErrors",
          Statistic.SUM,
          Unit.COUNT,
          {
            Operation: "DeleteItem",
          }
        ),
      ]),
      this.ddbWidget(`${prefix} - Throttled Requests`, [
        this.ddbMetric(
          dynamoDbTable.tableName,
          "Throttled Requests",
          "ThrottledRequests",
          Statistic.SUM,
          Unit.COUNT
        ),
      ]),
    ];
  }

  private ddbMetric(
    tableName: string,
    label: string,
    metricName: string,
    statistic: Statistic,
    unit?: Unit,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dimensions?: DimensionsMap
  ): IMetric {
    return this.createGraphMetric({
      label,
      metricName,
      statistic,
      namespace: "AWS/DynamoDB",
      unit,
      dimensionsMap: { ...dimensions, TableName: tableName },
    });
  }

  private ddbWidget(title: string, metrics: IMetric[]): IWidget {
    return this.createGraphWidget({ title, left: metrics });
  }

  private apiGatewayWidget(
    title: string,
    leftMetrics: IMetric[],
    rightMetrics?: IMetric[],
    leftLabel?: string,
    rightLabel?: string
  ): IWidget {
    return this.createGraphWidget({
      title,
      left: leftMetrics,
      right: rightMetrics,
      leftYAxis: { label: leftLabel },
      rightYAxis: { label: rightLabel },
    });
  }

  private apiGatewayMetric(
    apiName: string,
    label: string,
    metricName: string,
    statistic: Statistic,
    unit?: Unit,
    method?: string,
    resource?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dimensions?: DimensionsMap
  ): IMetric {
    return this.createGraphMetric({
      label,
      metricName,
      statistic,
      unit,
      namespace: "AWS/ApiGateway",
      dimensionsMap: {
        ...dimensions,
        ApiName: apiName,
        Stage: "prod",
        Method: method ?? "",
        Resource: resource ?? "",
      },
    });
  }

  private createGraphWidget(props: GraphWidgetProps): GraphWidget {
    return new GraphWidget({
      height: 6,
      width: 6,
      liveData: true,
      ...props,
    });
  }

  private createGraphMetric(props: MetricProps): IMetric {
    return new Metric(props);
  }
}
