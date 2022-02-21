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
import { FlowObject } from 'shared_types';

export const EC2_OBJECT: FlowObject = {
    id: 'EC2_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:1000:instance/i-0a5bcc01670572c78',
};

export const VPC_OBJECT: FlowObject = {
    id: 'VPC_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:2000:vpc/vpc-0c315768612ee4eb1',
};

export const SUBNET_OBJECT: FlowObject = {
    id: 'SUBNET_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:2000:subnet/subnet-0290eedfd4a706c55',
};

export const SG_OBJECT: FlowObject = {
    id: 'EC2_Arn',
    type: 'Arn',
    value: 'arn:aws:ec2:ap-southeast-2:1000:security-group/sg-0517a9f2bb8487190',
};

export const ASG_OBJECT: FlowObject = {
    id: 'ASG_INSTANCE',
    type: 'Arn',
    value:
        'arn:aws:autoscaling:ap-southeast-2:2000:autoScalingGroup:418f69ae-24d0-449c-8fbb-64f34c34e06b:autoScalingGroupName/asg-tmp-test',
};

export const TAGGED_OBJECT: FlowObject = {
    id: 'EC2_Arn',
    type: 'Tagged',
    value: [
        {
            key: 'FF_TEST',
            value: '1',
        },
    ],
};
