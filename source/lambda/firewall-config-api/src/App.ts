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
import { Router } from 'src/common/Router';
import { MainHandler } from './common/MainHandler';
import { setupContainer } from './Container';
import { ListAuditsHandler } from './handlers/audits/ListAuditsHandler';
import { CreateObjectHandler } from './handlers/objects/CreateObjectHandler';
import { DeleteObjectHandler } from './handlers/objects/DeleteObjectHandler';
import { GetObjectHandler } from './handlers/objects/GetObjectHandler';
import { ListObjectsHandler } from './handlers/objects/ListObjectsHandler';
import { UpdateObjectHandler } from './handlers/objects/UpdateObjectHandler';
import { CreateRuleBundleHandler } from './handlers/rulebundles/CreateRuleBundleHandler';
import { DeleteRuleConfigHandler } from './handlers/rulebundles/DeleteRuleBundleHandler';
import { GetRuleConfigHandler } from './handlers/rulebundles/GetRuleBundleHandler';
import { ListRuleBundlesHandler } from './handlers/rulebundles/ListRuleBundlesHandler';
import { UpdateRuleBundleHandler } from './handlers/rulebundles/UpdateRuleBundleHandler';
import { CreateRuleHandler } from './handlers/rules/CreateRuleHandler';
import { DeleteRuleHandler } from './handlers/rules/DeleteRuleHandler';
import { GetRuleHandler } from './handlers/rules/GetRuleHandler';
import { ListRulesHandler } from './handlers/rules/ListRulesHandler';
import { UpdateRuleHandler } from './handlers/rules/UpdateRuleHandler';

setupContainer();

// setup route
const router = new Router();

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/rulebundles/{id}',
    GetRuleConfigHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/rulebundles',
    ListRuleBundlesHandler
);

router.addRoute(
    (e) => e.httpMethod === 'POST' && e.resource == '/rulebundles',
    CreateRuleBundleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'PUT' && e.resource == '/rulebundles/{id}',
    UpdateRuleBundleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'DELETE' && e.resource == '/rulebundles/{id}',
    DeleteRuleConfigHandler
);

router.addRoute(
    (e) => e.httpMethod === 'POST' && e.resource == '/rulebundles/{id}/rules',
    CreateRuleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/rulebundles/{id}/rules',
    ListRulesHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/rulebundles/{id}/rules/{ruleId}',
    GetRuleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'DELETE' && e.resource == '/rulebundles/{id}/rules/{ruleId}',
    DeleteRuleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'PUT' && e.resource == '/rulebundles/{id}/rules/{ruleId}',
    UpdateRuleHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/objects',
    ListObjectsHandler
);

router.addRoute(
    (e) => e.httpMethod === 'POST' && e.resource == '/objects',
    CreateObjectHandler
);

router.addRoute(
    (e) => e.httpMethod === 'PUT' && e.resource == '/objects/{id}',
    UpdateObjectHandler
);

router.addRoute(
    (e) => e.httpMethod === 'DELETE' && e.resource == '/objects/{id}',
    DeleteObjectHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/objects/{id}',
    GetObjectHandler
);

router.addRoute(
    (e) => e.httpMethod === 'GET' && e.resource == '/audits',
    ListAuditsHandler
);

// main lambda handler
export const lambdaHandler = new MainHandler(router).lambdaHandler;
