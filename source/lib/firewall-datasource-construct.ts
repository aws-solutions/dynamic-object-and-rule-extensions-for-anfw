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
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  TableEncryption,
} from "@aws-cdk/aws-dynamodb";
import * as kms from "@aws-cdk/aws-kms";
import * as sns from "@aws-cdk/aws-sns";
import {
  Annotations,
  CfnOutput,
  Construct,
  RemovalPolicy,
} from "@aws-cdk/core";
import * as subscriptions from "@aws-cdk/aws-sns-subscriptions";

export interface AutConfigConstructProps {
  pointInTimeRecovery: boolean;
}

export class AutConfigDataSourceConstructConstruct extends Construct {
  readonly rulesTable: dynamodb.Table;
  readonly objectsTable: dynamodb.Table;
  readonly rulebundlesTable: dynamodb.Table;
  readonly auditsTable: dynamodb.Table;
  readonly notificationTopic: sns.Topic;
  readonly snsEncryptionKey: kms.Key;
  constructor(scope: Construct, id: string, props: AutConfigConstructProps) {
    super(scope, id);

    const dataBaseTableEncryption = new kms.Key(
      this,
      `auto-config-encryption-key`,
      {
        removalPolicy: RemovalPolicy.RETAIN,
        enableKeyRotation: true,
        alias: "AutoConfigTablesEncryptionKey",
      }
    );

    this.rulesTable = new dynamodb.Table(this, "RulesTable", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataBaseTableEncryption,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      tableName: "RuleExtensionsRuleTable",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: props.pointInTimeRecovery,
    });
    this.rulesTable.addGlobalSecondaryIndex({
      indexName: "ruleBundleId",
      partitionKey: { name: "ruleBundleId", type: AttributeType.STRING },
    });

    const dataBaseAuditTableEncryption = new kms.Key(
      this,
      `auto-config-audit-encryption-key`,
      {
        removalPolicy: RemovalPolicy.RETAIN,
        enableKeyRotation: true,
        alias: "AutoConfigAuditTablesEncryptionKey",
      }
    );

    this.objectsTable = new dynamodb.Table(this, "ObjectsTable", {
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataBaseTableEncryption,
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      tableName: "RuleExtensionsObjectTable",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      // sortKey: {name: 'namespace', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: props.pointInTimeRecovery,
    });

    this.rulebundlesTable = new dynamodb.Table(this, "RuleBundlesTable", {
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataBaseTableEncryption,
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: "RuleExtensionsRuleBundleTable",
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: props.pointInTimeRecovery,
    });

    this.auditsTable = new dynamodb.Table(this, "AuditsTable", {
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataBaseAuditTableEncryption,
      tableName: "RuleExtensionsAuditTable",
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: props.pointInTimeRecovery,
    });

    this.snsEncryptionKey = new kms.Key(
      this,
      `notification-sns-encryption-key`,
      {
        removalPolicy: RemovalPolicy.DESTROY,
        enableKeyRotation: true,
        alias: "RuleEvaluationResultTopicEncryptionKey",
      }
    );

    this.notificationTopic = new sns.Topic(this, "RuleEvaluationResultTopic", {
      masterKey: this.snsEncryptionKey,
    });
    this.subscribeToTopic();

    new CfnOutput(this, "RuleEvaluationResultTopicARN", {
      value: this.notificationTopic.topicArn,
    });
  }

  private subscribeToTopic() {
    const emails = this.node.tryGetContext("failureNotificationTargetEmails");
    if (emails) {
      if (!Array.isArray(emails)) {
        Annotations.of(this).addWarning(
          "failureNotificationTargetEmails contains invalid value it should be a list of emails, skip subscription"
        );
      } else {
        (<Array<string>>emails).forEach((email) =>
          this.notificationTopic.addSubscription(
            new subscriptions.EmailSubscription(email)
          )
        );
      }
    }
  }
}
