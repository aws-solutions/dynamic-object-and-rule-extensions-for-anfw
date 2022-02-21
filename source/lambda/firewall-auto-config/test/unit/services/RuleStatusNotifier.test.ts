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
import { SNSClient } from '@aws-sdk/client-sns';
import { StaticLoggerFactory } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { RuleStatusNotifier } from 'src/service/RuleStatusNotifier';
import { anything, instance, mock, verify, when } from 'ts-mockito';

describe('Test RuleStatusNotifier', () => {
    const snsClient = mock(SNSClient);
    const applicationConfig: AppConfiguration = mock(AppConfiguration);
    const objectUnderTest: RuleStatusNotifier = new RuleStatusNotifier(
        new StaticLoggerFactory(),
        instance(snsClient),
        instance(applicationConfig)
    );
    test('should notify', async () => {
        await objectUnderTest.notify({
            ruleBundleId: 'groupid',
            ruleId: 'ruleId',
            status: 'FAILED',
            reasonPhrease: ['failed reason'],
        });
        verify(snsClient.send(anything())).once();
    });

    test('should log error', async () => {
        when(snsClient.send(anything())).thenThrow(new Error('sns error'));
        try {
            await objectUnderTest.notify({
                ruleBundleId: 'groupid',
                ruleId: 'ruleId',
                status: 'FAILED',
                reasonPhrease: ['failed reason'],
            });
        } catch (e) {
            fail('should not have exception');
        }
    });
});
