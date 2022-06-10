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
/* eslint-disable */
import {
  DeleteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb"; // ES Modules
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  CreateRuleGroupCommand,
  DescribeRuleGroupCommand,
  DescribeRuleGroupCommandInput,
  NetworkFirewallClient,
  RuleGroupType,
} from "@aws-sdk/client-network-firewall";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} from "@aws-sdk/client-auto-scaling";
import { FlowRule } from "shared_types";
import short from "short-uuid";
import { v4 as uuidv4 } from "uuid";
import {
  createHttpClient,
  CredentialProvider,
} from "shared_types/src/clients/ApjsbAwsHttpclient";
import { SwitchRoleRoleProvider } from "./CredentialProvider";
import { DescribeStacksInput } from "@aws-sdk/client-cloudformation";
import {
  ASG_OUTPUT_KEY,
  INSTANCE_OUTPUT_KEY,
  LAMBDA_TAG_KEY,
  SG_OUTPUT_KEY,
  SUBNET_OUTPUT_KEY,
  TAG_KEY,
  TAG_VALUE,
  VPC_OUTPUT_KEY,
} from "../lib/test-support-stack-stack";
import {
  CloudFormationClient,
  DescribeStacksCommand,
  Output,
} from "@aws-sdk/client-cloudformation";
import { TextDecoder } from "util";

type methodType = "GET" | "POST" | "PUT" | "DELETE";
type RuleOptionPair = { key: string; value?: string | number };
const ruleRegex = /.+\(msg:(.+);\s(sid.+)\)/;
describe("use case 1, onboarding rule bundles", () => {
  // TODO : use config https://github.com/lorenwest/node-config for all these config, if needed to port to pipeline
  const requireCleanState = process.env.FF_CLEAN_DATA === "True";
  const testingTargetAccount = process.env.FF_TARGET_ACCOUNT ?? "10000";
  const testRegion = process.env.FF_TARGET_REGION ?? "ap-southeast-2";
  const adminRole =
    process.env.FF_ADMIN_ROLE ??
    `arn:aws:iam::${testingTargetAccount}:role/ObjectExtensionSecOpsAdminRole-${testRegion}`;
  const region = process.env.FF_REGION ?? "ap-southeast-2";
  const testRuleGroupName =
    process.env.FF_RULEGROUP_NAME ?? "default-anfwconfig-rule-01";

  const testANFWruleGroupArn = `arn:aws:network-firewall:${region}:${testingTargetAccount}:stateful-rulegroup/${testRuleGroupName}`;

  let schedulerFnName: string;
  let invokeApi: (method: methodType, path: string, data?: any) => Promise<any>;

  const ffObjectTableName =
    process.env.OBJECTS_TABLE_NAME ?? "RuleExtensionsObjectTable";
  const ffRuleGroupTableName =
    process.env.RULEBUNDLES_TABLE_NAME ?? "RuleExtensionsRuleBundleTable";
  const ffRuleTableName =
    process.env.RULES_TABLE_NAME ?? "RuleExtensionsRuleTable";

  const dynamoDBClient = new DynamoDBClient({ region: region });

  const showSuffix = "_int_" + short.generate();
  // const fixedOnPremObjId = 'Onprem_Server' + showSuffix;
  // DUMMY FIX OBJECT
  const fixedObj = {
    id: "Onprem_Server" + showSuffix,
    value: "172.16.1.20",
    type: "Address",
  };
  const validFFCloudResourceTargets: any[] = [];

  function exactOutputValueByKey(outputs: any | undefined, key: string) {
    const value = outputs?.find(
      (op: any) => op.OutputKey === key || op.OutputKey?.startsWith(key)
    );
    console.log("value", value?.OutputValue);
    return value?.OutputValue;
  }

  beforeAll(async () => {
    jest.setTimeout(120000);
    if (requireCleanState) {
      await clearData(ffObjectTableName, dynamoDBClient);
      await clearData(ffRuleTableName, dynamoDBClient);
      await clearData(ffRuleGroupTableName, dynamoDBClient);
    }
    const credentialProvider = new SwitchRoleRoleProvider(region);
    const solutionStackOutput = await getStackInfo(
      region,
      "FirewallObjectExtensionSolutionStack"
    );
    const apiEndpoint = exactOutputValueByKey(
      solutionStackOutput,
      "autoconfigapiAPIEndpoint"
    );
    if (!apiEndpoint) {
      fail("not able to locate api endpoint");
    }

    const schedulerFnNameValue = exactOutputValueByKey(
      solutionStackOutput,
      "autoconfigautoConfigFunctionScheduler"
    );

    if (!schedulerFnNameValue) {
      fail("not able to locate schedule function");
    }
    schedulerFnName = schedulerFnNameValue;
    invokeApi = await createInvokeFn(
      credentialProvider,
      adminRole,
      region,
      apiEndpoint
    );

    const supportStackOutput = await getStackInfo(
      region,
      "TestSupportStackStack"
    );

    // check if network firewall rule group exists
    await createNetworkFirewallRuleGroup(region, testRuleGroupName);

    // expect(true).toBe(false);
    const outputs = supportStackOutput;
    console.log("outputs" + JSON.stringify(outputs));

    // vpc
    const vpcArn = exactOutputValueByKey(outputs, VPC_OUTPUT_KEY);
    validFFCloudResourceTargets.push({
      id: "Ec2_VPC" + showSuffix,
      value: vpcArn,
      type: "Arn",
    });
    console.log({
      id: "Ec2_VPC" + showSuffix,
      value: vpcArn,
      type: "Arn",
    });
    // expect(true).toBe(false);
    // // ec2 arn
    const ec2Arn = exactOutputValueByKey(outputs, INSTANCE_OUTPUT_KEY);
    validFFCloudResourceTargets.push({
      id: "Ec2_Arn" + showSuffix,
      value: ec2Arn,
      type: "Arn",
    });

    // ec2 tagged instance
    validFFCloudResourceTargets.push({
      id: "Ec2_TAG" + showSuffix,
      value: [
        {
          value: TAG_VALUE,
          key: TAG_KEY,
        },
      ],
      type: "Tagged",
    });

    // lambda tagged instance
    validFFCloudResourceTargets.push({
      id: "Lambda_TAG" + showSuffix,
      value: [
        {
          value: TAG_VALUE,
          key: LAMBDA_TAG_KEY,
        },
      ],
      type: "Lambda",
    });
    // sg
    const securityGroup = exactOutputValueByKey(outputs, SG_OUTPUT_KEY);
    validFFCloudResourceTargets.push({
      id: "SecurityGroup_Arn" + showSuffix,
      value: securityGroup,
      type: "Arn",
    });
    // ags
    const asgGroupName = exactOutputValueByKey(outputs, ASG_OUTPUT_KEY);
    if (!asgGroupName) {
      fail("no ags group name found");
    }
    const agsClient = new AutoScalingClient({ region: region });
    const describeAgsInput = { AutoScalingGroupNames: [asgGroupName] };
    const describeAutoScalingGroupCmd = new DescribeAutoScalingGroupsCommand(
      describeAgsInput
    );
    const agsRespose = await agsClient.send(describeAutoScalingGroupCmd);

    const deployedAGSgroup = agsRespose.AutoScalingGroups?.find(
      (group) => group.AutoScalingGroupName === asgGroupName
    );
    if (!deployedAGSgroup) {
      fail("no deployed ags group found");
    }
    const asgGroupArn = deployedAGSgroup.AutoScalingGroupARN;
    validFFCloudResourceTargets.push({
      id: "ASG_INSTANCE" + showSuffix,
      value: asgGroupArn,
      type: "Arn",
    });
    // subnet
    const subnetArn = exactOutputValueByKey(outputs, SUBNET_OUTPUT_KEY);
    validFFCloudResourceTargets.push({
      id: "Ec2_SUBNET" + showSuffix,
      value: subnetArn,
      type: "Arn",
    });

    const allTargetsToBeCreated = [...validFFCloudResourceTargets, fixedObj];
    console.log("allTargetsToBeCreated", allTargetsToBeCreated);
    for (const target of allTargetsToBeCreated) {
      console.log("createObject request", target);
      const createObjectRsp = await invokeApi("POST", "objects", target);
      console.log("createObjectRsp", createObjectRsp);
      if (createObjectRsp.statusCode != 201) {
        console.log("createObjectRsp.statusCode", createObjectRsp.statusCode);
        fail(`can not create target ${target}`);
      }
    }
  });

  test("happy case, create rule group/objects/rules", async () => {
    const getAuditResponse = await invokeApi("GET", "audits");
    console.log("1");
    expect(getAuditResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: expect.stringMatching(/result/),
    });

    const id = uuidv4();
    const newRuleGroupId = `integration-test-group-${id}`;
    const createRuleBundle = {
      id: newRuleGroupId,
      // aggregatorName: "org-replicator",
      description: "integration rule group admin only",
      ownerGroup: [adminRole],
      ruleGroupArn: testANFWruleGroupArn,
    };
    console.log("2 newRuleGroupId");
    const createRuleBundleResponse = await invokeApi(
      "POST",
      "rulebundles",
      createRuleBundle
    );

    console.log("createRuleGroupResponse", createRuleBundleResponse);
    expect(createRuleBundleResponse).toMatchObject({
      statusCode: 201,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: expect.stringMatching(/id/),
    });

    const ruleBundleId = JSON.parse(createRuleBundleResponse.body).id;

    const allCreatedRuleIds = await Promise.all(
      validFFCloudResourceTargets.map(async (obj) => {
        const targetObjId = obj.id;
        // add rule
        const createdRuleId = await createRule(
          targetObjId,
          ruleBundleId,
          fixedObj,
          invokeApi
        );
        return createdRuleId;
      })
    );

    const targetObjId = validFFCloudResourceTargets[0].id;
    const option1 = { key: "flow", value: "to_server" };
    const ruleWithOptionId = await createRule(
      targetObjId,
      ruleBundleId,
      fixedObj,
      invokeApi,
      [option1]
    );
    allCreatedRuleIds.push(ruleWithOptionId);

    console.log("all created rule ids", allCreatedRuleIds);
    // wait (from test config to sync the interval of invoke) or just invoke directly
    // check ANFW
    //TODO: ddb consistent write
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await triggerScheduler(schedulerFnName, region);
    await triggerScheduler(schedulerFnName, region);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const networkFirewallClient = new NetworkFirewallClient({
      region: region,
      // credentials: credential,
    });
    const input: DescribeRuleGroupCommandInput = {
      RuleGroupName: testRuleGroupName,
      Type: "STATEFUL",
    };
    const cmd = new DescribeRuleGroupCommand(input);
    const data = await networkFirewallClient.send(cmd);
    console.log("target rule group description response", data);
    console.log(
      "target rule group description rules",
      JSON.stringify(data.RuleGroup?.RulesSource?.RulesString)
    );
    const ruleStrings: string[] | undefined =
      data.RuleGroup?.RulesSource?.RulesString?.split("\n");
    // expect(ruleStrings?.length).toBe(2);

    for (const createdRuleId of allCreatedRuleIds) {
      const hasTheNewRuleApplied = ruleStrings?.some((s) => {
        const matched = s.trim().match(ruleRegex);
        console.log("comparing ruleStrings", s);
        if (matched) {
          const ruleId = matched[1].trim().replace(/['"]+/g, "");
          console.log("returned ruleId", ruleId);
          console.log("createdRuleId", createdRuleId);
          console.log("ruleId === createdRuleId", ruleId === createdRuleId);
          if (ruleId === ruleWithOptionId) {
            console.log("checking rule with options", matched[2]);
            const hasOptionField = matched[2]
              .split(";")
              .map((kp) => kp.trim())
              .some((kp) => kp === `${option1.key}: ${option1.value}`);

            console.log("found hasOptionField", hasOptionField);
            expect(hasOptionField).toBe(true);
          }
          return ruleId === createdRuleId;
        }
      });

      console.log("hasTheNewRuleApplied", hasTheNewRuleApplied);

      expect(hasTheNewRuleApplied).toBe(true);
      // check API the rule status is ACTIVE
      const getRuleResponse = await invokeApi(
        "GET",
        `rulebundles/${newRuleGroupId}/rules/${createdRuleId}`
      );

      console.log("getRuleResponse", getRuleResponse);
      const rule = <FlowRule>JSON.parse(getRuleResponse.body);

      expect(rule.status).toBe("ACTIVE");
    }
  });

  test("happy case, CRUD rulebundles", async () => {
    const getAuditResponse = await invokeApi("GET", "audits");

    expect(getAuditResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: expect.stringMatching(/result/),
    });

    const id = uuidv4();
    const newRuleGroupId = `integration-CRUD-test-group-${id}`;
    const createRuleGroup = {
      id: newRuleGroupId,
      // aggregatorName: "org-replicator",
      description: "integration rule group admin only",
      ownerGroup: [adminRole],
      ruleGroupArn: testANFWruleGroupArn,
    };

    const createRuleGroupResponse = await invokeApi(
      "POST",
      "rulebundles",
      createRuleGroup
    );

    console.log("createRuleGroupResponse", createRuleGroupResponse);
    expect(createRuleGroupResponse).toMatchObject({
      statusCode: 201,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: expect.stringMatching(/id/),
    });

    const ruleBundleId = JSON.parse(createRuleGroupResponse.body).id;

    const getRuleGroupResponse = await invokeApi(
      "GET",
      `rulebundles/${ruleBundleId}`
    );

    console.log("getRuleGroupResponse", getRuleGroupResponse);
    expect(getRuleGroupResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      // body: expect.stringMatching(/id/),
    });

    const modifyRuleGroupResponse = await invokeApi(
      "PUT",
      `rulebundles/${ruleBundleId}`,
      {
        id: newRuleGroupId,
        aggregatorName: "org-replicator",
        description: "change description",
        ownerGroup: [adminRole],
        ruleGroupArn: testANFWruleGroupArn,
      }
    );

    console.log("modifyRuleGroupResponse", modifyRuleGroupResponse);
    expect(modifyRuleGroupResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      // body: expect.stringMatching(/ruleBundleId/),
    });

    const deleteRuleGroupResponse = await invokeApi(
      "DELETE",
      `rulebundles/${ruleBundleId}`
    );

    expect(deleteRuleGroupResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      // body: expect.stringMatching(/ruleBundleId/),
    });

    console.log("deleteRuleGroupResponse", deleteRuleGroupResponse);

    const getRuleGroupOriginalResponse = await invokeApi(
      "GET",
      `rulebundles/${ruleBundleId}`
    );

    expect(getRuleGroupOriginalResponse).toMatchObject({
      statusCode: 404,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      // body: expect.stringMatching(/ruleBundleId/),
    });
  });

  test("happy case, CRUD rules", async () => {
    const id = uuidv4();
    const ruleBundleId = await createRuleGroup(
      id,
      adminRole,
      testANFWruleGroupArn,
      invokeApi
    );

    const ruleId = await createRule(
      validFFCloudResourceTargets[0].id,
      ruleBundleId,
      fixedObj,
      invokeApi
    );

    const modifyRuleResponse = await invokeApi(
      "PUT",
      `rulebundles/${ruleBundleId}/rules/${ruleId}`,
      {
        id: ruleId,
        action: "drop",
        destination: validFFCloudResourceTargets[1].id,
        protocol: "udp",
        ruleBundleId: ruleBundleId,
        source: fixedObj.id,
        destinationPort: {
          type: "SinglePort",
          value: "1000",
        },
        sourcePort: {
          type: "Any",
        },
      }
    );
    console.log("modifyRuleResponse", modifyRuleResponse);
    expect(modifyRuleResponse).toMatchObject({
      statusCode: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      // body: expect.stringMatching(/ruleBundleId/),
    });

    const getRuleResponse = await invokeApi(
      "GET",
      `rulebundles/${ruleBundleId}/rules/${ruleId}`
    );

    expect(getRuleResponse.statusCode).toBe(200);
    const action = JSON.parse(getRuleResponse.body).action;
    expect(action).toBe("drop");

    const deleteRuleResponse = await invokeApi(
      "GET",
      `rulebundles/${ruleBundleId}/rules/${ruleId}`
    );

    expect(deleteRuleResponse.statusCode).toBe(200);
  });

  test("happy case, CRUD objects", async () => {
    // reference already done in 1st test case, here only verify CRUD API works
    const fixedIpTarget = {
      id: "FixedObject" + showSuffix,
      value: "172.16.1.22",
      type: "Address",
    };
    const createObjectRsp = await invokeApi("POST", "objects", fixedIpTarget);

    expect(createObjectRsp.statusCode).toBe(201);

    const updateTarget = await invokeApi("PUT", `objects/${fixedIpTarget.id}`, {
      ...fixedIpTarget,
      value: "172.16.1.23",
    });
    expect(updateTarget.statusCode).toBe(200);

    const getObjectRsp = await invokeApi("GET", `objects/${fixedIpTarget.id}`);
    expect(getObjectRsp.statusCode).toBe(200);
    expect(JSON.parse(getObjectRsp.body).value).toBe("172.16.1.23");
  });
});

async function createNetworkFirewallRuleGroup(
  region: string,
  testRuleGroupName: string
) {
  const networkFirewallClient = new NetworkFirewallClient({ region: region });
  const describeCmd = new DescribeRuleGroupCommand({
    RuleGroupName: testRuleGroupName,
    Type: RuleGroupType.STATEFUL,
  });
  try {
    const response = await networkFirewallClient.send(describeCmd);
    console.log("describeCmd response", response);
    if (response.RuleGroupResponse?.RuleGroupStatus !== "ACTIVE") {
      console.error(
        `rule group ${testRuleGroupName} is not in ACTIVE status can not proceed`
      );
      fail(
        `rule group ${testRuleGroupName} is not in ACTIVE status can not proceed`
      );
    }
  } catch (e) {
    console.log("errr", e);
    if (e.name === "ResourceNotFoundException") {
      console.log(`no rule group ${testRuleGroupName} found, creating one`);
      const createRuleGroupCmd = new CreateRuleGroupCommand({
        RuleGroupName: testRuleGroupName,
        Type: RuleGroupType.STATEFUL,
        Capacity: 10000,
        Rules: "drop udp any any -> any any (sid: 1;)",
      });
      try {
        const createRuleGroupCmdResponse = await networkFirewallClient.send(
          createRuleGroupCmd
        );
        console.log("createRuleGroupCmdResponse", createRuleGroupCmdResponse);
      } catch (e) {
        console.log("errr createRuleGroupCmdResponse", e);
      }
    } else {
      fail(`unexpected error ${e}`);
    }
  }
}

async function getStackInfo(
  region: string,
  stackName: string
): Promise<Output[] | undefined> {
  const client = new CloudFormationClient({ region: region });
  const input: DescribeStacksInput = {
    StackName: stackName,
  };
  const describeStackComd = new DescribeStacksCommand(input);

  const response = await client.send(describeStackComd);
  if (response.Stacks?.length != 1) {
    fail("no support stack installed, can not run function test, abort");
  }
  return response.Stacks![0].Outputs;
}

async function createRuleGroup(
  id: string,
  adminRole: string,
  testANFWruleGroupArn: string,
  invokeApi: (method: methodType, path: string, data?: any) => Promise<any>
) {
  const newRuleGroupId = `integration-CRUD-test-group-${id}`;
  const createRuleGroup = {
    id: newRuleGroupId,
    // aggregatorName: "org-replicator",
    description: "integration rule group admin only",
    ownerGroup: [adminRole],
    ruleGroupArn: testANFWruleGroupArn,
  };

  const createRuleGroupResponse = await invokeApi(
    "POST",
    "rulebundles",
    createRuleGroup
  );

  console.log("createRuleGroupResponse", createRuleGroupResponse);
  expect(createRuleGroupResponse).toMatchObject({
    statusCode: 201,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    },
    body: expect.stringMatching(/id/),
  });

  const ruleBundleId = JSON.parse(createRuleGroupResponse.body).id;

  const getRuleGroupResponse = await invokeApi(
    "GET",
    `rulebundles/${ruleBundleId}`
  );

  expect(getRuleGroupResponse).toMatchObject({
    statusCode: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    },
    // body: expect.stringMatching(/ruleBundleId/),
  });
  return ruleBundleId;
}

async function createRule(
  targetObjId: string,
  ruleBundleId: any,
  fixedObj: {
    id: string;
    value: string;
    type: string;
  },
  invokeApi: (method: methodType, path: string, data?: any) => Promise<any>,
  optionFields?: RuleOptionPair[]
): Promise<string> {
  const ruleTobeCreated = {
    action: "pass",
    destination: targetObjId,
    protocol: "tcp",
    ruleBundleId: ruleBundleId,
    source: fixedObj.id,
    sourcePort: {
      type: "SinglePort",
      value: 1234,
    },
    destinationPort: {
      type: "Any",
    },
    ...(optionFields && { optionFields: optionFields }),
  };

  const ruleCreationResponse = await invokeApi(
    "POST",
    `rulebundles/${ruleBundleId}/rules`,
    ruleTobeCreated
  );

  console.log("ruleCreationREsponse", ruleCreationResponse);
  expect(ruleCreationResponse).toMatchObject({
    statusCode: 201,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    },
    // a bug need to be fixed
    body: expect.stringMatching(/rule/),
  });

  const createdRuleId = JSON.parse(ruleCreationResponse.body).rule.id;

  console.log("ruleId", createdRuleId);
  return createdRuleId;
}

async function createInvokeFn(
  credentialProvider: SwitchRoleRoleProvider,
  adminRole: string,
  region: string,
  apiEndPoint: string
) {
  const credentials = await credentialProvider.assumeRole(adminRole);

  const ffAdminCredentialProvider: CredentialProvider = {
    getCredential: async () => credentials,
  };

  const httpClient = createHttpClient(region, ffAdminCredentialProvider);
  const invokeApi = (
    method: methodType,
    path: string,
    data?: any
  ): Promise<any> =>
    httpClient.request(
      method,
      `${apiEndPoint}${path}`,
      "execute-api",
      data ? JSON.stringify(data) : undefined
    );
  return invokeApi;
}

async function clearData(tableName: string, dynamoDBClient: DynamoDBClient) {
  const allIds = [];
  let nextToken: string | undefined = undefined;
  do {
    const scanTableCommand: ScanCommand = new ScanCommand({
      TableName: tableName,
      ...(nextToken && { ExclusiveStartKey: marshall({ id: nextToken }) }),
    });
    const response = await dynamoDBClient.send(scanTableCommand);
    const lastEvaluatedKey = response.LastEvaluatedKey?.id
      ? unmarshall(response.LastEvaluatedKey)
      : undefined;

    nextToken = lastEvaluatedKey ? lastEvaluatedKey["id"] : undefined;
    const ids = response.Items?.map((i) => unmarshall(i).id as string);
    if (ids) {
      allIds.push(...ids);
    }
  } while (nextToken);

  for (const id of allIds) {
    const updateItemCommand: DeleteItemCommand = new DeleteItemCommand({
      Key: marshall({ id: id }),
      TableName: tableName,
    });
    try {
      await dynamoDBClient.send(updateItemCommand);
    } catch (e) {
      console.error("unable to clean table", tableName);
    }
  }
}

async function triggerScheduler(schedulerFnName: string, region: string) {
  const lambdasClient = new LambdaClient({ region: region });
  const invokeInput = {
    FunctionName: schedulerFnName,
  };
  const invokeSchedulerCmd = new InvokeCommand(invokeInput);
  const invokeResponse = await lambdasClient.send(invokeSchedulerCmd);
  console.log(
    "directly trigger scheduler response",
    new TextDecoder("utf-8").decode(invokeResponse.Payload)
  );
  expect(invokeResponse.$metadata.httpStatusCode).toBe(200);
}
/* eslint-enable */
