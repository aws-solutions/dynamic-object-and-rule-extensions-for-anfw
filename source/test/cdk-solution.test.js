"use strict";
/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("@aws-cdk/core");
const CdkSolution = require("../lib/cdk-solution-stack");
const assert_1 = require("@aws-cdk/assert");
require("@aws-cdk/assert/jest");
/*
 * Sample snapshot test
 */
test('Sample snapshot test', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new CdkSolution.HelloSolutionsConstructsStack(app, 'MyTestStack');
    // THEN
    expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
/*
 * Sample unit test
 */
test('Test to make sure the Lambda function is there w/ proper runtime', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new CdkSolution.HelloSolutionsConstructsStack(app, 'MyTestStack');
    // THEN
    expect(stack).toHaveResource('AWS::Lambda::Function', {
        "Runtime": "nodejs12.x"
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXNvbHV0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGstc29sdXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7O0FBRUgscUNBQXFDO0FBQ3JDLHlEQUEwRDtBQUMxRCw0Q0FBNkM7QUFDN0MsZ0NBQThCO0FBRTlCOztHQUVHO0FBQ0gsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUNoQyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQixPQUFPO0lBQ1AsTUFBTSxLQUFLLEdBQUcsSUFBSSxXQUFXLENBQUMsNkJBQTZCLENBQUMsR0FBRyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ2hGLE9BQU87SUFDUCxNQUFNLENBQUMsbUJBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO0FBQy9ELENBQUMsQ0FBQyxDQUFDO0FBRUg7O0dBRUc7QUFDSCxJQUFJLENBQUMsa0VBQWtFLEVBQUUsR0FBRyxFQUFFO0lBQzVFLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzFCLE9BQU87SUFDUCxNQUFNLEtBQUssR0FBRyxJQUFJLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDaEYsT0FBTztJQUNQLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUU7UUFDcEQsU0FBUyxFQUFFLFlBQVk7S0FDeEIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqICBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKS4gWW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZVxuICogIHdpdGggdGhlIExpY2Vuc2UuIEEgY29weSBvZiB0aGUgTGljZW5zZSBpcyBsb2NhdGVkIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgb3IgaW4gdGhlICdsaWNlbnNlJyBmaWxlIGFjY29tcGFueWluZyB0aGlzIGZpbGUuIFRoaXMgZmlsZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAnQVMgSVMnIEJBU0lTLCBXSVRIT1VUIFdBUlJBTlRJRVNcbiAqICBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9uc1xuICogIGFuZCBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgQ2RrU29sdXRpb24gPSByZXF1aXJlKCcuLi9saWIvY2RrLXNvbHV0aW9uLXN0YWNrJyk7XG5pbXBvcnQgeyBTeW50aFV0aWxzIH0gZnJvbSAnQGF3cy1jZGsvYXNzZXJ0JztcbmltcG9ydCAnQGF3cy1jZGsvYXNzZXJ0L2plc3QnO1xuXG4vKlxuICogU2FtcGxlIHNuYXBzaG90IHRlc3RcbiAqL1xudGVzdCgnU2FtcGxlIHNuYXBzaG90IHRlc3QnLCAoKSA9PiB7XG4gIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIC8vIFdIRU5cbiAgY29uc3Qgc3RhY2sgPSBuZXcgQ2RrU29sdXRpb24uSGVsbG9Tb2x1dGlvbnNDb25zdHJ1Y3RzU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snKTtcbiAgLy8gVEhFTlxuICBleHBlY3QoU3ludGhVdGlscy50b0Nsb3VkRm9ybWF0aW9uKHN0YWNrKSkudG9NYXRjaFNuYXBzaG90KCk7XG59KTtcblxuLypcbiAqIFNhbXBsZSB1bml0IHRlc3RcbiAqL1xudGVzdCgnVGVzdCB0byBtYWtlIHN1cmUgdGhlIExhbWJkYSBmdW5jdGlvbiBpcyB0aGVyZSB3LyBwcm9wZXIgcnVudGltZScsICgpID0+IHtcbiAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgLy8gV0hFTlxuICBjb25zdCBzdGFjayA9IG5ldyBDZGtTb2x1dGlvbi5IZWxsb1NvbHV0aW9uc0NvbnN0cnVjdHNTdGFjayhhcHAsICdNeVRlc3RTdGFjaycpO1xuICAvLyBUSEVOXG4gIGV4cGVjdChzdGFjaykudG9IYXZlUmVzb3VyY2UoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICBcIlJ1bnRpbWVcIjogXCJub2RlanMxMi54XCJcbiAgfSk7XG59KTsiXX0=