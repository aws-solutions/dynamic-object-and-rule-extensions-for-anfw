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
import 'reflect-metadata';
import { FlowRuleBundle, StaticLoggerFactory } from 'shared_types';
import { RuleBundleDataSourceService } from 'src/service/RuleBundleDataSourceService';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { anything, instance, mock, when } from 'ts-mockito';
const DEFAULT_RULE_GROUP: FlowRuleBundle = {
    id: 'rule-group-01',
    ruleGroupArn: 'arn',
    version: 1,
    description: 'test',
    ownerGroup: ['arn:aws:iam::1000:role/ADMIN'],
};
describe('Test RuleGroupAuthenticationValidator', () => {
    let classUnderTest: RuleGroupAuthenticationValidator;
    const ruleGroupDataSourceService = mock(RuleBundleDataSourceService);
    beforeEach(() => {
        classUnderTest = new RuleGroupAuthenticationValidator(
            new StaticLoggerFactory(),
            instance(ruleGroupDataSourceService)
        );
    });
    test('should return null when no authorization violation', async () => {
        when(ruleGroupDataSourceService.getRuleBundleBy(anything())).thenResolve(
            DEFAULT_RULE_GROUP
        );
        const result = await classUnderTest.checkRuleGroupAccess(
            'arn:aws:sts::1000:assumed-role/ADMIN/session-name',
            'rule-group-01',
            '1000',
            'UPDATE'
        );
        expect(result).toBeNull();
    });

    test('should return error response when no authorization role', async () => {
        when(ruleGroupDataSourceService.getRuleBundleBy(anything())).thenResolve(
            DEFAULT_RULE_GROUP
        );
        const result = await classUnderTest.checkRuleGroupAccess(
            'arn:aws:sts::1000:assumed-role/UNAUTHORIZED_ROLE/session-name',
            'rule-group-01',
            '1000',
            'UPDATE'
        );
        expect(result?.statusCode).toBe(403);
    });

    test('should return error response when no invalid account', async () => {
        when(ruleGroupDataSourceService.getRuleBundleBy(anything())).thenResolve(
            DEFAULT_RULE_GROUP
        );
        const result = await classUnderTest.checkRuleGroupAccess(
            'arn:aws:sts::1000:assumed-role/UNAUTHORIZED_ROLE/session-name',
            'rule-group-01',
            '2000',
            'UPDATE'
        );
        expect(result?.statusCode).toBe(403);
    });

    test('should return error response when no rulegroup found', async () => {
        when(ruleGroupDataSourceService.getRuleBundleBy(anything())).thenResolve(
            undefined
        );
        const result = await classUnderTest.checkRuleGroupAccess(
            'arn:aws:sts::1000:assumed-role/UNAUTHORIZED_ROLE/session-name',
            'rule-group-01',
            '2000',
            'UPDATE'
        );
        expect(result?.statusCode).toBe(404);
    });
});
