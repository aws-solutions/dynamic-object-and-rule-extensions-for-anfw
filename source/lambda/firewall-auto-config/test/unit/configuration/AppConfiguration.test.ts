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

    test('should get target table config', () => {
        process.env.LOG_LEVEL = 'debug';
        process.env.OBJECTS_TABLE_NAME = 'object_table';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.getDefinitionSourceFor('OBJECT')?.tableName).toEqual(
            'object_table'
        );
    });

    test('should get value from env', () => {
        process.env.AWS_REGION = 'ap-southeast-2';
        process.env.RULE_NOTIFICATION_TOPIC_ARN = 'arn';
        process.env.DEFAULT_AGGREGATOR_NAME = 'aggregator1';
        const objectUnderTest = new AppConfiguration('test-app');
        expect(objectUnderTest.region).toBe('ap-southeast-2');
        expect(objectUnderTest.ruleNotificationTopicArn).toBe('arn');
        expect(objectUnderTest.defaultAggregatorName).toBe('aggregator1');
    });
});
