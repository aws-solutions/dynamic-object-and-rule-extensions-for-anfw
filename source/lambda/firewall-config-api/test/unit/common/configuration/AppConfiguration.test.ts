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
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';

describe('Test AppConfiguration', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...ORIGINAL_ENV };
    });
    afterEach(() => {
        process.env = ORIGINAL_ENV;
    });

    test('should retrieve rule group table configuration', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.RULEBUNDLES_TABLE_NAME = 'rulegroup_table';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.getDefinitionSourceFor('RULEBUNDLE')?.tableName).toEqual(
            'rulegroup_table'
        );
    });

    test('should get rule table config', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.RULES_TABLE_NAME = 'rule_table';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.getDefinitionSourceFor('RULE')?.tableName).toEqual(
            'rule_table'
        );
    });

    test('should get object table config', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.OBJECTS_TABLE_NAME = 'OBJECT_table';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.getDefinitionSourceFor('OBJECT')?.tableName).toEqual(
            'OBJECT_table'
        );
    });

    test('should get policy list', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.OPA_POLICY_LIST = 'policy1,policy2, policy3';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.defaultPolicySet).toEqual([
            'policy1',
            'policy2',
            'policy3',
        ]);
    });

    test('should get policy list', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.OPA_POLICY_LIST = 'policy1,policy2, policy3';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.defaultPolicySet).toEqual([
            'policy1',
            'policy2',
            'policy3',
        ]);
    });

    test('should get passed in value', () => {
        process.env.AWS_REGION = 'ap-southeast-1';
        process.env.DEFAULT_AGGREGATOR_NAME = 'aggregator1';
        process.env.ADMINISTRATOR_ROLE = 'arn:bla';
        process.env.APPLICATION_OWNER_ROLES = 'arn:iam:bla1,arn:iam:bla2';
        process.env.OPA_URL = 'elb.bla.com';

        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.opaURL).toEqual('elb.bla.com');
        expect(objectUnderTest.applicationOwnerRoles).toEqual([
            'arn:iam:bla1',
            'arn:iam:bla2',
        ]);
        expect(objectUnderTest.defaultAggregatorName).toEqual('aggregator1');
        expect(objectUnderTest.region).toEqual('ap-southeast-1');
    });
    test('should get default values', () => {
        process.env.AWS_REGION = undefined;
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.logLevel).toEqual('debug');
        expect(objectUnderTest.region).toEqual('ap-southeast-2');
        expect(objectUnderTest.defaultAggregatorName).toEqual('DEFAULT_AGGREGATOR');
    });
});
