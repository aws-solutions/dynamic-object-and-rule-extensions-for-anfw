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
import {
    AuditChangeResult,
    FlowAudit,
    FlowRule,
    Logger,
    LoggerFactory,
} from 'shared_types';
import { AsyncRequestHandler } from 'src/common/AsyncRequestHandler';
import RuleConfigError from 'src/common/RuleConfigError';
import { ServerlessResponse } from 'src/common/ServerlessResponse';
import { AuditsDataSourceService } from 'src/service/AuditsDataSourceService';
import { OpaPolicyService } from 'src/service/OpaPolicyService';
import { RulesDataSourceService } from 'src/service/RulesDataSourceService';
import { UpdateFlowRuleInput } from 'src/types/FlowRule';
import { CreateRuleInputValidator } from 'src/validators/CreateRuletInputValidator';
import { RuleGroupAuthenticationValidator } from 'src/validators/RuleGroupAuthenticationValidator';
import { inject, injectable } from 'tsyringe';

/**
 * @api {put} /rulebundles/{id}/rules/{ruleId} Update a rule
 * @apiGroup Rule
 * @apiDescription Update rule in a rule bundle referencing a cloud resource or fixed resource
 * 
 *  @apiExample {curl} CURL Example:
 curl --location --request PUT 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/88bc676a-4917-490e-92ab-610a545c5baf' --data-raw '{
  "action": "drop",
  "destination": "Onprem_Server",
  "protocol": "udp",
  "ruleBundleId": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23",
  "source": "Ec2_Arn_DEMO",
  "id":"88bc676a-4917-490e-92ab-610a545c5baf"
}'
* @apiSuccess (Success 201) Rule created
* @apiParam {string} protocol The protocol for this rule supported tcp | udp
* @apiParam {string}  action The action specified for this rule supported drop | pass | alert
* @apiParam {string}  source The object's id as a source of this rule
* @apiParam {string}  destination The object's id as a destination of this rule
* @apiParam {string}  ruleBundleId The bundle ID this rule attaches to
* @apiError (Error 400) BadRequest Rule bundle id path parameter cannot be null or empty
* @apiError (Error 400) BadRequest Invalid rule port value according to it's type
* @apiError (Error 400) BadRequest Rule bundle id path parameter does not match request body groupId
* @apiError (Error 400) BadRequest Referenced object does not exists
* @apiError (Error 400) BadRequest RuleBundle  does not exists
* @apiError (Error 403) Forbidden Requestor's arn is not authorized to perform this action
* @apiError (Error 500) RemoteError Unable to determine user accessibility
* @apiError (Error 500) RemoteError Error while creating rule object
* 
* @apiSuccessExample Success-Response: 
*      HTTP/1.1 200 OK
*  {
    "rule": {
        "protocol": "tcp",
        "action": "drop",
        "source": "Ec2_Arn_DEMO",
        "destination": "Onprem_Server",
        "status": "PENDING",
        "ruleBundleId": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23",
        "lastUpdated": "2021-09-16T23:11:56.198Z",
        "id": "88bc676a-4917-490e-92ab-610a545c5baf",
        "destinationPort": {
            "type": "SinglePort",
            "value": '123'
            },
        "sourcePort": {
            "type": "Any"
        },
        "version": 0
    }
}
* 
* @apiSampleRequest off
*/
@injectable()
export class UpdateRuleHandler
    implements AsyncRequestHandler<APIGatewayProxyEvent, ServerlessResponse> {
    private readonly logger: Logger;

    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('RulesDataSourceService')
        private ruleDataSourceService: RulesDataSourceService,
        @inject('AuditsDataSourceService')
        private auditsDataSourceService: AuditsDataSourceService,
        @inject('CreateRuleInputValidator') private validator: CreateRuleInputValidator,
        @inject('RuleGroupAuthenticationValidator')
        private ruleGroupAuthenticationValidator: RuleGroupAuthenticationValidator,
        @inject('OpaPolicyService') private opaPolicyService: OpaPolicyService
    ) {
        this.logger = loggerFactory.getLogger('UpdateRuleHandler');
    }

    async handle(
        event: APIGatewayProxyEvent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: Context
    ): Promise<ServerlessResponse> {
        if (!event.pathParameters) {
            return ServerlessResponse.ofError(new RuleConfigError(undefined, 400, false));
        }
        const ruleId = event.pathParameters['ruleId'];
        const ruleBundleId = event.pathParameters['id'];
        if (!event.pathParameters || !ruleBundleId || !ruleId) {
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Parameter rule id or rule bundle id not found',
                    400,
                    false
                )
            );
        }
        this.logger.debug('Processing update rule request');

        const rawInput = await this.validator.parseAndValidate(event);
        const input = rawInput as UpdateFlowRuleInput;
        console.log('input', input);
        if (input.id != ruleId) {
            this.logger.error('Request id does not match ruleid in the path');
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Request id does not match ruleId in the path',
                    400,
                    false
                )
            );
        }

        if (input.ruleBundleId != ruleBundleId) {
            this.logger.error(
                'Request ruleGroupdId does not match ruleBundleId in the path'
            );
            return ServerlessResponse.ofError(
                new RuleConfigError(
                    'Request ruleBundleId does not match ruleBundleId in the path',
                    400,
                    false
                )
            );
        }
        const requestorIdentity = event.requestContext.identity?.userArn ?? 'Unknown';
        const requestingAccountId = event.requestContext.accountId;
        try {
            const response = await this.opaPolicyService.requestDecision(
                {
                    requester: {
                        arn: requestorIdentity,
                        accountId: requestingAccountId,
                    },
                },
                { rule: input as FlowRule },
                'UPDATE'
            );

            this.logger.info(' opa decision response', response);
            if (response.status === 'NON_COMPLIANT') {
                return ServerlessResponse.ofObject(400, {
                    message: response.reasonPhrases,
                });
            }
        } catch (e) {
            this.logger.error('opa error', e);
            return ServerlessResponse.ofObject(500, {
                message: `Unable to determine user accessibility, ${e}`,
            });
        }

        const errorResponse = await this.ruleGroupAuthenticationValidator.checkRuleGroupAccess(
            requestorIdentity,
            ruleBundleId,
            requestingAccountId,
            'UPDATE'
        );
        if (errorResponse) {
            this.logger.error(`Authorization error ${errorResponse.body}`);
            return errorResponse;
        }

        try {
            const existingRule = await this.ruleDataSourceService.getRuleBy(ruleId);
            if (!existingRule || existingRule.ruleBundleId != ruleBundleId) {
                return ServerlessResponse.ofObject(404, {
                    message: `rule id ${ruleId} in rule bundle ${ruleBundleId} not found`,
                });
            }

            const rule = await this.ruleDataSourceService.updateRule({
                id: existingRule.id,
                version: existingRule.version,
                ...(input.optionFields && {
                    optionFields: input.optionFields.map((kp) => ({
                        key: kp.key,
                        ...(kp.value && { value: kp.value }),
                    })),
                }),
                source: input.source,
                sourcePort: input.sourcePort,
                destination: input.destination,
                destinationPort: input.destinationPort,
                action: input.action,
                protocol: input.protocol,
                status: existingRule.status,
                ruleBundleId: ruleBundleId,
            });
            await this.auditEntryForUpdate(requestorIdentity, 'SUCCESS', rule);

            return ServerlessResponse.ofObject(200, { object: rule });
        } catch (e) {
            this.logger.error('Error while creating rule object', e, rawInput);
            this.auditEntryForUpdate(requestorIdentity, 'REJECTED', rawInput, [
                e.message,
            ]);
            return ServerlessResponse.ofObject(500, {
                message: 'Error while update rule',
            });
        }
    }

    async auditEntryForUpdate(
        requestorIdentity: string,
        status: AuditChangeResult,
        object: FlowRule,
        reasons?: string[]
    ): Promise<FlowAudit> {
        return this.auditsDataSourceService.createAuditEntry({
            requestedBy: requestorIdentity,
            requestedTimestamp: new Date().toISOString(),
            requestedChange: {
                type: 'UPDATE', //CREATE/UPDATE/DELETE
                changeContent: {
                    requestedObject: object,
                },
                changeResult: status, // SUCCESS, REJECTED
                reasonPhrase: reasons ?? [],
            },
        });
    }
}
