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
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import 'reflect-metadata';
import { lambdaHandler } from 'src/App';
import { ListAuditsHandler } from 'src/handlers/audits/ListAuditsHandler';
import { CreateObjectHandler } from 'src/handlers/objects/CreateObjectHandler';
import { DeleteObjectHandler } from 'src/handlers/objects/DeleteObjectHandler';
import { GetObjectHandler } from 'src/handlers/objects/GetObjectHandler';
import { UpdateObjectHandler } from 'src/handlers/objects/UpdateObjectHandler';
import { DeleteRuleConfigHandler } from 'src/handlers/rulebundles/DeleteRuleBundleHandler';
import { GetRuleConfigHandler } from 'src/handlers/rulebundles/GetRuleBundleHandler';
import { ListRuleBundlesHandler } from 'src/handlers/rulebundles/ListRuleBundlesHandler';
import { UpdateRuleBundleHandler } from 'src/handlers/rulebundles/UpdateRuleBundleHandler';
import { DeleteRuleHandler } from 'src/handlers/rules/DeleteRuleHandler';
import { GetRuleHandler } from 'src/handlers/rules/GetRuleHandler';
import { ListRulesHandler } from 'src/handlers/rules/ListRulesHandler';
import { UpdateRuleHandler } from 'src/handlers/rules/UpdateRuleHandler';

describe('Test compliance event', () => {
    test('should get OK response for event requests', async () => {
        GetRuleConfigHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'GET', resource: '/rulebundles/{id}' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(GetRuleConfigHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for delete', async () => {
        DeleteRuleConfigHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            {
                httpMethod: 'DELETE',
                resource: '/rulebundles/{id}',
            } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(DeleteRuleConfigHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for get rule group by id', async () => {
        ListRuleBundlesHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'GET', resource: '/rulebundles' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(ListRuleBundlesHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for post rule group by id', async () => {
        UpdateRuleBundleHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'PUT', resource: '/rulebundles/{id}' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(UpdateRuleBundleHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for post target', async () => {
        CreateObjectHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'POST', resource: '/objects' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(CreateObjectHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for get audits', async () => {
        ListAuditsHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'GET', resource: '/audits' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(ListAuditsHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for get target', async () => {
        GetObjectHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'GET', resource: '/objects/{id}' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(GetObjectHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for delete target', async () => {
        DeleteObjectHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'DELETE', resource: '/objects/{id}' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(DeleteObjectHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for update objects', async () => {
        UpdateObjectHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'PUT', resource: '/objects/{id}' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(UpdateObjectHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for get rules', async () => {
        GetRuleHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            {
                httpMethod: 'GET',
                resource: '/rulebundles/{id}/rules/{ruleId}',
            } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(GetRuleHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for delete rules', async () => {
        DeleteRuleHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            {
                httpMethod: 'DELETE',
                resource: '/rulebundles/{id}/rules/{ruleId}',
            } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(DeleteRuleHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for list rules', async () => {
        ListRulesHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            {
                httpMethod: 'GET',
                resource: '/rulebundles/{id}/rules',
            } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(ListRulesHandler.prototype.handle).toHaveBeenCalled();
    });

    test('should get OK response for update rules', async () => {
        UpdateRuleHandler.prototype.handle = jest.fn().mockResolvedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            {
                httpMethod: 'PUT',
                resource: '/rulebundles/{id}/rules/{ruleId}',
            } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(UpdateRuleHandler.prototype.handle).toHaveBeenCalled();
    });
    test('should log error when handler failed', async () => {
        ListRuleBundlesHandler.prototype.handle = jest.fn().mockRejectedValueOnce({});
        expect.assertions(1);

        lambdaHandler(
            { httpMethod: 'GET', resource: '/rulebundles' } as APIGatewayProxyEvent,
            {} as Context,
            () => ({})
        );

        expect(ListRuleBundlesHandler.prototype.handle).toHaveBeenCalled();
    });
});
