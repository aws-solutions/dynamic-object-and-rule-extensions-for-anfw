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

import { HttpResponse } from '@aws-sdk/types';
import { Logger, LoggerFactory, ApjsbAwsHttpClient } from 'shared_types';
import { AppConfiguration } from 'src/common/configuration/AppConfiguration';
import { RoleChecker } from 'src/common/RoleChecker';
import RuleConfigError from 'src/common/RuleConfigError';
import {
    PolicyDecisionRequestContent,
    PolicyDecisionRequestContext,
    PolicyDecisionRequestType,
} from 'src/types/PolicyDecisionRequest';
import {
    OpaPolicyEvaluationStatus,
    PolicyDecisionResponse,
    ReasonPhrase,
    Status,
} from 'src/types/PolicyDecisionResponse';
import { PolicyDecisionResult, PolicyMeta } from 'src/types/PolicyDecisionResult';
import { inject, injectable } from 'tsyringe';
const OPA_PERSONA_ADMIN = 'admin';
const OPA_PERSONA_APPOWNER = 'appowner';
@injectable()
export class OpaPolicyService {
    opaURL?: string;
    logger: Logger;
    SERVICE_NAME = 'ff-api-lambda';
    defaultPolicySet: string[];
    constructor(
        @inject('LoggerFactory') loggerFactory: LoggerFactory,
        @inject('AppConfiguration') application: AppConfiguration,
        @inject('ApjsbAwsHttpClient') private httpClient: ApjsbAwsHttpClient,
        @inject('RoleChecker') private roleChecker: RoleChecker
    ) {
        this.logger = loggerFactory.getLogger('OpaPolicyService');
        this.opaURL = application.opaURL;
        this.defaultPolicySet = application.defaultPolicySet;
    }

    public async requestDecision(
        requestContext: PolicyDecisionRequestContext,
        requestContent: PolicyDecisionRequestContent,
        requestType: PolicyDecisionRequestType
    ): Promise<PolicyDecisionResponse> {
        if (!this.opaURL) {
            return {
                status: 'COMPLIANT',
                timestamp: Date.now(),
            };
        }
        requestContext.requester.role = this.roleChecker.isAdmin(
            requestContext.requester.arn,
            requestContext.requester.accountId
        )
            ? OPA_PERSONA_ADMIN
            : OPA_PERSONA_APPOWNER;
        const requestBody = {
            input: {
                request: {
                    policyIds: this.defaultPolicySet,

                    context: {
                        ...requestContext,
                    },
                    type: requestType,
                    content: {
                        ...requestContent,
                    },
                },
            },
        };
        this.logger.debug('opa request body', requestBody);
        return this.requestOPAEvaluation(requestBody);
    }

    private async requestOPAEvaluation(
        data: Record<string, unknown>
    ): Promise<PolicyDecisionResponse> {
        this.logger.debug('opa request request');
        this.logger.debug(`https://${this.opaURL}/v1/data/main/decision?provenance=true`);
        const result = await this.httpClient.post(
            `https://${this.opaURL}/v1/data/main/decision?provenance=true`,
            this.SERVICE_NAME,
            data
        );
        this.logger.debug('opa raw response', result);
        return this.toDecisionResponse(result);
    }

    private toDecisionResponse(rawResponse: HttpResponse): PolicyDecisionResponse {
        if (rawResponse.statusCode != 200 || rawResponse.body.length === 0) {
            throw new RuleConfigError(
                'Encounter error calling OPA cluster',
                rawResponse.statusCode,
                false
            );
        }

        const decision: PolicyDecisionResult = this.toJson(rawResponse.body.toString());

        this.logger.info('decision context %s', decision.provenance);
        return {
            status:
                decision.result.status === OpaPolicyEvaluationStatus.PASS
                    ? Status.COMPLIANT
                    : Status.NON_COMPLIANT,
            reasonPhrases: this.toReasonPhrases(decision),
            timestamp: new Date().getTime(),
        };
    }

    private toJson(rawStrJson: string) {
        try {
            return JSON.parse(rawStrJson);
        } catch (error) {
            throw new RuleConfigError(
                `Invalid input - request/response is not a valid json ${rawStrJson}`,
                503
            );
        }
    }

    private toReasonPhrases(decision: PolicyDecisionResult): Array<ReasonPhrase> {
        return decision.result.responses.map((r) => ({
            policyId: r.policyId,
            status: this.getStatus(r),
            reason: r.msg,
        }));
    }

    private getStatus(r: PolicyMeta): string {
        if (r.status === OpaPolicyEvaluationStatus.PASS) {
            return Status.COMPLIANT;
        }
        if (r.status === OpaPolicyEvaluationStatus.FAIL) {
            return Status.NON_COMPLIANT;
        }
        return Status.UNKNOWN;
    }
}
