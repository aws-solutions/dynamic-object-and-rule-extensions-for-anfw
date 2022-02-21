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
import { APIGatewayProxyEvent } from 'aws-lambda';
import RuleConfigError from 'src/common/RuleConfigError';

export const REGEX_DESCRIPTION = /^[ 0-9a-zA-Z_-\s]{1,1000}$/;

export const REGEX_ID = /^[:0-9a-zA-Z_-]{1,100}$/;

export abstract class InputValidator<T> {
    public readonly errors: string[] = [];

    async parseAndValidate(event: APIGatewayProxyEvent): Promise<T> {
        const body = this.parse(event);

        if (body) {
            await this.validate(body);
            if (this.errors.length > 0) {
                throw new RuleConfigError(this.errors.join(', '), 400, false);
            }
            return body;
        }

        throw new RuleConfigError(this.errors.join(', '), 400, false);
    }

    protected parse(event: APIGatewayProxyEvent): T | null {
        try {
            if (!event.body) {
                this.errors.push('Request body cannot be null or empty.');
                return null;
            }
            return <T>JSON.parse(event.body.toString());
        } catch (error) {
            this.errors.push('Request body contains invalid JSON.');
            return null;
        }
    }

    protected abstract validate(input: T): Promise<void>;

    protected isBlank(input: string): boolean {
        return !input || /^\s*$/.test(input);
    }

    protected isValidDescriptionName(description?: string): boolean {
        return !description || REGEX_DESCRIPTION.test(description);
    }

    protected isValidId(id: string): boolean {
        return REGEX_ID.test(id);
    }
}
