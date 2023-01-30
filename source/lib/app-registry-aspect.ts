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
import * as appRegistry from "@aws-cdk/aws-servicecatalogappregistry-alpha";
import * as cdk from "aws-cdk-lib";
import * as appInsights from "aws-cdk-lib/aws-applicationinsights";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { CfnResourceAssociation } from "aws-cdk-lib/aws-servicecatalogappregistry";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct, IConstruct } from "constructs";
import * as path from "path";

export interface AppRegistryProps {
  solutionName: string;
  solutionId: string;
  solutionVersion: string;
  applicationType: string;
  applicationName: string;
}

const DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_TIMEOUT =
  cdk.Duration.minutes(5);
const DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_INTERVAL =
  cdk.Duration.seconds(1);

/**
 * Create App Registry Application and add the current context Stack and all its nested Stacks into the Application.
 */
export class AppRegistry extends Construct implements cdk.IAspect {
  public readonly application: appRegistry.Application;
  public constructor(
    scope: cdk.Stack,
    id: string,
    private readonly props: AppRegistryProps
  ) {
    super(scope, id);
    this.application = this.createAppForAppRegistry();

    this.createAttributeGroup(this.application);
    this.addTagsforApplication(this.application);
    const waiter = this.waitForResourceGroupCreated(this.application);
    this.createAppForAppInsights(this.application, waiter);

    this.application.associateApplicationWithStack(scope);
  }

  public visit(node: IConstruct): void {
    if (!(node instanceof cdk.Stack)) {
      return;
    }

    if (!node.nested) {
      // it's a root stack, associate the stack with the app, create attribute group and tag it
      const stack = node as cdk.Stack;
      this.application.associateApplicationWithStack(stack);
    } else {
      new CfnResourceAssociation(node, "AppRegistryAssociation", {
        application: this.application.applicationName!,
        resource: node.stackId,
        resourceType: "CFN_STACK",
      }).addDependsOn(this.application.node.defaultChild as cdk.CfnResource);
    }
  }

  private createAppForAppRegistry(): appRegistry.Application {
    return new appRegistry.Application(this, "RegistrySetup", {
      applicationName: cdk.Fn.join("-", [
        this.props.applicationName,
        cdk.Aws.REGION,
        cdk.Aws.ACCOUNT_ID,
      ]),
      description: `Service Catalog application to track and manage all your resources for the solution ${this.props.solutionName}`,
    });
  }

  private addTagsforApplication(application: appRegistry.Application): void {
    cdk.Tags.of(application).add("Solutions:SolutionID", this.props.solutionId);
    cdk.Tags.of(application).add(
      "Solutions:SolutionName",
      this.props.solutionName
    );
    cdk.Tags.of(application).add(
      "Solutions:SolutionVersion",
      this.props.solutionVersion
    );
    cdk.Tags.of(application).add(
      "Solutions:ApplicationType",
      this.props.applicationType
    );
  }

  private createAttributeGroup(application: appRegistry.Application): void {
    application.associateAttributeGroup(
      new appRegistry.AttributeGroup(this, "AppAttributes", {
        attributeGroupName: cdk.Aws.STACK_NAME,
        description: "Attributes for Solutions Metadata",
        attributes: {
          applicationType: this.props.applicationType,
          version: this.props.solutionVersion,
          solutionID: this.props.solutionId,
          solutionName: this.props.solutionName,
        },
      })
    );
  }

  // The Resource Group is created by the Application asychronously.
  // The Application does not expose the resource group instance that we can use to set dependency which will cause the intermittent failure in AppInsight Application provision.
  // Add a waiter customer resource to ensure the Resource Group is CREATED.
  private waitForResourceGroupCreated(
    application: appRegistry.Application
  ): cdk.CustomResource {
    const lambdaPolicyStatement = new iam.PolicyStatement({
      actions: ["servicecatalog:GetApplication"],
      resources: [
        cdk.Arn.format(
          {
            service: "servicecatalog",
            resource: "application",
            resourceName: "*",
          },
          cdk.Stack.of(this)
        ),
        application.applicationArn,
      ],
    });

    const eventHandlerLambda = new lambda.Function(
      this,
      "appRegistryCloudFormationHandler",

      {
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, `../lambda/app-registry-cr/build/handler`)
        ),

        timeout: DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_TIMEOUT,
        initialPolicy: [lambdaPolicyStatement],
        runtime: lambda.Runtime.NODEJS_14_X,
        description:
          "Customer resource lambda to check the completion of application insight creation",
      }
    );

    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: eventHandlerLambda,
      isCompleteHandler: eventHandlerLambda,
      queryInterval: DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_INTERVAL,
      totalTimeout: DEFAULT_APPLICATION_RESOURCE_GROUP_STATE_QUERY_TIMEOUT,
    });

    return new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      properties: {
        applicationId: application.applicationId,
        applicationName: application.applicationName,
      },
    });
  }

  private createAppForAppInsights(
    application: appRegistry.Application,
    waiter: cdk.CustomResource
  ): void {
    new appInsights.CfnApplication(this, "AppInsightsSetup", {
      resourceGroupName: cdk.Fn.join("-", [
        "AWS_AppRegistry_Application",
        application.applicationName!,
      ]),
      autoConfigurationEnabled: true,
      cweMonitorEnabled: true,
      opsCenterEnabled: true,
    }).addDependsOn(waiter.node.defaultChild as cdk.CfnResource);
  }
}
