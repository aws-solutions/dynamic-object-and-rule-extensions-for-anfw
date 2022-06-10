#!/usr/bin/env node
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
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { FirewallObjectExtensionSolutionStack } from '../lib/cdk-solution-stack';

const app = new cdk.App();
const SOLUTION_ID = process.env['SOLUTION_ID']
    ? process.env['SOLUTION_ID']
    : 'SO0196';
const VERSION = process.env['VERSION'] ? process.env['VERSION'] : 'v1.1.0';

const solutionProperty = {
    description: `(${SOLUTION_ID}) - The AWS CDK template for deployment of the Dynamic Object and Rule Extensions for AWS Network Firewall solution, version: (Version ${VERSION})`,
    solutionId: SOLUTION_ID,
    version: VERSION,
};

if (app.node.tryGetContext('account') && app.node.tryGetContext('region')) {
    new FirewallObjectExtensionSolutionStack(
        app,
        'FirewallObjectExtensionSolutionStack',
        {
            ...solutionProperty,
            env: {
                account: app.node.tryGetContext('account'),
                region: app.node.tryGetContext('region'),
            },
        }
    );
} else {
    new FirewallObjectExtensionSolutionStack(
        app,
        'FirewallObjectExtensionSolutionStack',
        { ...solutionProperty }
    );
}
