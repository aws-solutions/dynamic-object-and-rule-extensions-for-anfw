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
import "reflect-metadata";
const metadataKey = Symbol("canaryTest");
export function canaryTest(): (
  // eslint-disable-next-line @typescript-eslint/ban-types
  target: object,
  propertyKey: string,
  descriptor: PropertyDescriptor
) => void {
  return registerProperty;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function registerProperty(target: object, propertyKey: string): void {
  let properties: string[] = Reflect.getMetadata(metadataKey, target);

  if (properties) {
    properties.push(propertyKey);
  } else {
    properties = [propertyKey];
    Reflect.defineMetadata(metadataKey, properties, target);
  }
}
// eslint-disable-next-line @typescript-eslint/ban-types
export function getFilteredProperties(origin: any): object {
  const properties: string[] = Reflect.getMetadata(metadataKey, origin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  properties.forEach((key) => (result[key] = origin[key]));
  return result;
}
