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
import { StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { RoleChecker } from 'src/common/RoleChecker';
import RuleConfigError from 'src/common/RuleConfigError';

describe('test RoleChecker', () => {
    let objectUnderTest: RoleChecker;
    beforeEach(() => {
        objectUnderTest = new RoleChecker(new StaticLoggerFactory(), {
            adminRole: 'arn:aws:iam::100000000000:role/adminRole',
        } as AppConfiguration);
    });
    test('should return admin for admin role', () => {
        expect(
            objectUnderTest.isAdmin(
                'arn:aws:sts::100000000001:assumed-role/adminRole/session-name',
                '100000000000'
            )
        ).toBe(true);
    });
    test('should return appowner for appowner role', () => {
        expect(
            objectUnderTest.isAdmin(
                'arn:aws:sts::100000000001:assumed-role/notAdminRole/session-name',
                '100000000000'
            )
        ).toBe(false);
    });
    test('should return appowner for undetermined role', () => {
        expect.assertions(1);
        try {
            objectUnderTest.isAdmin('invalidArn', '100000000000');
        } catch (e) {
            expect(e).toEqual(
                new RuleConfigError(`Encounter error Error: Malformed ARN`, 500, false)
            );
        }
    });
});
