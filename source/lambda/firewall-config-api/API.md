<a name="top"></a>

# Dynamic Object and Rule Extensions for AWS Network Firewall Solution v1.1.0

Dynamic Object and Rule Extensions for AWS Network Firewall Solution API Documentation

# Table of contents

-   [Audits](#Audits)
    -   [List audits request](#List-audits-request)
-   [Objects](#Objects)
    -   [Create new object](#Create-new-object)
    -   [Delete an object](#Delete-an-object)
    -   [Get an object](#Get-an-object)
    -   [List objects](#List-objects)
    -   [Update an object](#Update-an-object)
-   [Rule](#Rule)
    -   [Create new rule](#Create-new-rule)
    -   [Delete a rule](#Delete-a-rule)
    -   [Get a rule](#Get-a-rule)
    -   [List rules](#List-rules)
    -   [Update a rule](#Update-a-rule)
-   [RuleBundle](#RuleBundle)
    -   [Create new rule bundle](#Create-new-rule-bundle)
    -   [Delete rule bundle](#Delete-rule-bundle)
    -   [Get a rule bundle](#Get-a-rule-bundle)
    -   [List rule bundles](#List-rule-bundles)
    -   [Update a rule bundle](#Update-a-rule-bundle)

---

# <a name='Audits'></a> Audits

## <a name='List-audits-request'></a> List audits request

[Back to top](#top)

```
GET /audits
```

### Parameters - `Optional Query Parameters`

| Name      | Type     | Description                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| limit     | `number` | **optional** <p>The number of audits per page.</p>_Default value: 100_<br>_Size range: 1-100_<br> |
| nextToken | `string` | **optional** <p>The pagination token.</p>                                                         |

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/audits'
```

### Success response

#### Success response - `Success 200`

| Name       | Type | Description   |
| ---------- | ---- | ------------- |
| Evaluation |      | <p>result</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "results": [
        {
            "requestedTimestamp": "2021-09-15T02:53:39.725Z",
            "requestedBy": "arn:aws:sts::<account_number>:assumed-role/ObjectExtensionSecOpsAdminRole/ObjectExtensionSecOpsAdminRole",
            "id": "0236070c-d95c-49fe-84ef-47e9625b4312",
            "requestedChange": {
                "type": "CREATE",
                "changeContent": {
                    "requestedObject": {
                        "lastUpdated": "2021-09-15T02:53:39.702Z",
                        "protocol": "tcp",
                        "destination": "Ec2_VPC_int_kbxZPcQP9dz3Fc3PsqZ23y",
                        "action": "pass",
                        "source": "Onprem_Server_int_kbxZPcQP9dz3Fc3PsqZ23y",
                        "id": "0902f0e0-269e-466e-aa0e-48630aab0d2e",
                        "ruleBundleId": "integration-test-group-e99dfe8d-c143-4f72-9252-89dd75345d23",
                        "version": 0,
                        "status": "PENDING"
                    }
                },
                "changeResult": "SUCCESS",
                "reasonPhrase": []
            }
        }]
}
```

### Error response

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

# <a name='Objects'></a> Objects

## <a name='Create-new-object'></a> Create new object

[Back to top](#top)

<p>Create new object referencing a cloud resource or fixed resource</p>

```
POST /objects
```

### Parameters - `Parameter`

| Name  | Type             | Description                                                                                                                                                                                                                                    |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | ------------ |
| id    | `String[1..100]` | <p>The object's id.</p>_Allowed values: "[ 0-9a-zA-Z_-]+"\_                                                                                                                                                                                    |
| type  | `string`         | <p>The object's type 'Address'                                                                                                                                                                                                                 | 'Cidr' | 'Arn' | 'Tagged'</p> |
| value | `value`          | <p>The object's value, can a an ARN or A tag list <br> e.g ARN arn:aws:ec2:ap-southeast-2:&lt;account_number&gt;:subnet/subnet-123 e.g A tag list { <br> &quot;value&quot;: &quot;1&quot;, <br> &quot;key&quot;: &quot;FF_TEST&quot;<br> }</p> |

### Examples

CURL Example:

```curl
 curl --location --request POST 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/audits' --data-raw '{
    "id": "Onprem_Server",
    "value": "172.16.1.20",
    "type": "Address"
}'
```

### Success response

#### Success response - `Success 201`

| Name   | Type | Description                  |
| ------ | ---- | ---------------------------- |
| object |      | <p>created object values</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "object": {
        "id": "Onprem_Server",
        "type": "Address",
        "value": "172.16.1.20",
        "createdBy": "arn:aws:sts::1000000:assumed-role/ObjectExtensionSecOpsAdminRole/DeviceClient",
        "lastUpdated": "2021-09-15T06:39:38.997Z"
    }
}
```

### Error response

#### Error response - `Error 400`

| Name                   | Type | Description                                                                  |
| ---------------------- | ---- | ---------------------------------------------------------------------------- | ------ | ----- | ------------- |
| UnsupportedObjectType  |      | <p>Supported object type 'SinglePort' , 'Any' , 'PortRange'</p>              |
| InvalidObjectValue     |      | <p>When request contains unsupported object value, supported 'Address'       | 'Cidr' | 'Arn' | 'Tagged';</p> |
| ObjectInvalidReference |      | <p>When requested object is not reference to a concrete resource with IP</p> |
| BadRequest             |      | <p>NONE_COMPLIANT due to violate OPA policy</p>                              |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

## <a name='Delete-an-object'></a> Delete an object

[Back to top](#top)

<p>Delete an object referencing a cloud resource or fixed resource</p>

```
DELETE /objects/{id}
```

### Parameters - `Parameter`

| Name | Type   | Description             |
| ---- | ------ | ----------------------- |
| id   | `UUID` | <p>The object's id.</p> |

### Examples

CURL Example:

```curl
curl --location --request DELETE 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/object_id'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| object |      | <p>updated</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
    HTTP/1.1 200 OK
{
   "id": "object_id"
   }
```

### Error response

#### Error response - `Error 404`

| Name   | Type | Description      |
| ------ | ---- | ---------------- |
| object |      | <p>not found</p> |

#### Error response - `Error 400`

| Name    | Type | Description         |
| ------- | ---- | ------------------- |
| Invalid |      | <p>object value</p> |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

## <a name='Get-an-object'></a> Get an object

[Back to top](#top)

<p>Get an object referencing a cloud resource or fixed resource</p>

```
GET /objects/{id}
```

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/Onprem_Server'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Object |      | <p>updated</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "object": {
        "id": "Onprem_Server",
        "type": "Address",
        "value": "172.16.1.20",
        "createdBy": "arn:aws:sts::1000000:assumed-role/ObjectExtensionSecOpsAdminRole/DeviceClient",
        "lastUpdated": "2021-09-15T06:39:38.997Z"
    }
}
```

### Error response

#### Error response - `Error 404`

| Name   | Type | Description      |
| ------ | ---- | ---------------- |
| Object |      | <p>not found</p> |

#### Error response - `Error 400`

| Name    | Type | Description         |
| ------- | ---- | ------------------- |
| Invalid |      | <p>Object value</p> |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

## <a name='List-objects'></a> List objects

[Back to top](#top)

<p>List objects</p>

```
GET /objects
```

### Parameters - `Optional Query Parameters`

| Name      | Type     | Description                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| limit     | `number` | **optional** <p>The number of object per page.</p>_Default value: 100_<br>_Size range: 1-100_<br> |
| nextToken | `string` | **optional** <p>The pagination token.</p>                                                         |

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Object |      | <p>results</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
    HTTP/1.1 200 OK
{
   "results": [
       {
           "value": "arn:aws:ec2:ap-southeast-2:10000:vpc/vpc-0c315768612ee4eb1",
           "lastUpdated": "2021-09-15T02:53:38.350Z",
           "id": "Ec2_VPC_int_kbxZPcQP9dz3Fc3PsqZ23y",
           "createdBy": "arn:aws:sts::10000:assumed-role/ObjectExtensionSecOpsAdminRole/ObjectExtensionSecOpsAdminRole",
           "type": "Arn"
       }
   }
```

### Error response

#### Error response - `Error 502`

| Name    | Type | Description              |
| ------- | ---- | ------------------------ |
| Timeout |      | <p>Service timed out</p> |

#### Error response - `Error 503`

| Name          | Type | Description                    |
| ------------- | ---- | ------------------------------ |
| InternalError |      | <p>Internal error occurred</p> |

## <a name='Update-an-object'></a> Update an object

[Back to top](#top)

<p>Update an object referencing a cloud resource or fixed resource</p>

```
PUT /objects
```

### Parameters - `Parameter`

| Name  | Type             | Description                                                                                                                                                                                                                                    |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | ------------ |
| id    | `String[1..100]` | <p>The object's id. id The object's id.</p>_Allowed values: "[ 0-9a-zA-Z_-]+"\_                                                                                                                                                                |
| type  | `string`         | <p>The object's type 'Address'                                                                                                                                                                                                                 | 'Cidr' | 'Arn' | 'Tagged'</p> |
| value | `value`          | <p>The object's value, can a an ARN or A tag list <br> e.g ARN arn:aws:ec2:ap-southeast-2:&lt;account_number&gt;:subnet/subnet-123 e.g A tag list { <br> &quot;value&quot;: &quot;1&quot;, <br> &quot;key&quot;: &quot;FF_TEST&quot;<br> }</p> |

### Examples

CURL Example:

```curl
 curl --location --request PUT 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/objects/Onprem_Server' --data-raw '{
    "value": "172.16.1.20",
    "type": "Address"
}'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Target |      | <p>updated</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "object": {
        "id": "Onprem_Server",
        "type": "Address",
        "value": "172.16.1.20",
        "createdBy": "arn:aws:sts::1000000:assumed-role/ObjectExtensionSecOpsAdminRole/DeviceClient",
        "lastUpdated": "2021-09-15T06:39:38.997Z"
    }
}
```

### Error response

#### Error response - `Error 400`

| Name                  | Type | Description                                                            |
| --------------------- | ---- | ---------------------------------------------------------------------- | ------ | ----- | ------------- |
| UnsupportedObjectType |      | <p>Supported object type 'SinglePort' , 'Any' , 'PortRange'</p>        |
| InvalidObjectValue    |      | <p>When request contains unsupported object value, supported 'Address' | 'Cidr' | 'Arn' | 'Tagged';</p> |
| BadRequest            |      | <p>NONE_COMPLIANT due to violate OPA policy</p>                        |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

# <a name='Rule'></a> Rule

## <a name='Create-new-rule'></a> Create new rule

[Back to top](#top)

<p>Create new rule in a rule bundle referencing a cloud resource or fixed resource</p>

```
POST /rulebundles/{id}/rules
```

### Parameters - `Parameter`

| Name         | Type     | Description                                          |
| ------------ | -------- | ---------------------------------------------------- | ---- | --------- |
| protocol     | `string` | <p>The protocol for this rule supported tcp          | udp  | icmp</p>  |
| action       | `string` | <p>The action specified for this rule supported drop | pass | alert</p> |
| source       | `string` | <p>The object's id as a source of this rule</p>      |
| destination  | `string` | <p>The object's id as a destination of this rule</p> |
| ruleBundleId | `string` | <p>The bundle ID this rule attaches to</p>           |

### Examples

CURL Example:

```curl
 curl --location --request POST 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules' --data-raw '{
  "action": "drop",
  "destination": "Onprem_Server",
  "protocol": "tcp",
  "ruleBundleId": "demo-group-group",
  "source": "Ec2_Arn_DEMO",
    "destinationPort": {
        "type": "SinglePort",
        "value": '123'
    },
    "sourcePort": {
        "type": "Any"
    },
}'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description    |
| ---- | ---- | -------------- |
| Rule |      | <p>created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 201 OK
 {
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
```

### Error response

#### Error response - `Error 400`

| Name       | Type | Description                                                  |
| ---------- | ---- | ------------------------------------------------------------ |
| BadRequest |      | <p>Rule bundle id path parameter cannot be null or empty</p> |

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 500`

| Name        | Type | Description                                   |
| ----------- | ---- | --------------------------------------------- |
| RemoteError |      | <p>Unable to determine user accessibility</p> |

## <a name='Delete-a-rule'></a> Delete a rule

[Back to top](#top)

<p>Delete a rule in a rule bundle</p>

```
DELETE /rulebundles/{id}/rules/{ruleId}
```

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/rule_id'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description    |
| ---- | ---- | -------------- |
| Rule |      | <p>created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "ruleId": "rule_id"
}
```

### Error response

#### Error response - `Error 400`

| Name       | Type | Description                                                  |
| ---------- | ---- | ------------------------------------------------------------ |
| BadRequest |      | <p>Rule bundle id path parameter cannot be null or empty</p> |

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 500`

| Name        | Type | Description                             |
| ----------- | ---- | --------------------------------------- |
| RemoteError |      | <p>Error while creating rule object</p> |

## <a name='Get-a-rule'></a> Get a rule

[Back to top](#top)

<p>Get a rule in a rule bundle referencing a cloud resource or fixed resource</p>

```
GET /rulebundles/{id}/rules/{ruleId}
```

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/rule_id'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description    |
| ---- | ---- | -------------- |
| Rule |      | <p>created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "rule": {
        "protocol": "tcp",
        "action": "drop",
        "source": "Ec2_Arn_DEMO",
        "destination": "Onprem_Server",
        "status": "PENDING",
        "ruleBundleId": "ruleGroup_Id",
        "lastUpdated": "2021-09-16T23:11:56.198Z",
        "id": "rule_id",
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
```

### Error response

#### Error response - `Error 400`

| Name       | Type | Description                                                  |
| ---------- | ---- | ------------------------------------------------------------ |
| BadRequest |      | <p>Rule bundle id path parameter cannot be null or empty</p> |

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 500`

| Name        | Type | Description                             |
| ----------- | ---- | --------------------------------------- |
| RemoteError |      | <p>Error while creating rule object</p> |

## <a name='List-rules'></a> List rules

[Back to top](#top)

<p>List rule bundles belongs to requestor's arn</p>

```
GET /rulebundles/{id}/rules
```

### Parameters - `Optional Query Parameters`

| Name      | Type     | Description                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| limit     | `number` | **optional** <p>The number of object per page.</p>_Default value: 100_<br>_Size range: 1-100_<br> |
| nextToken | `string` | **optional** <p>The pagination token.</p>                                                         |

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/rulebundle_id/rules'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Object |      | <p>results</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "results": [
        {
            "id": "rule_id",
            "version": 536,
            "lastUpdated": "2021-09-15T02:53:53.754Z",
            "action": "drop",
            "protocol": "udp",
            "status": "ACTIVE",
            "ruleBundleId": "rulebundle_id",
            "destination": "Ec2_SUBNET",
            "source": "Onprem_Server",
            "failureReasons": [],
             "destinationPort": {
            "type": "SinglePort",
            "value": '123'
            },
            "sourcePort": {
                "type": "Any"
            },
        }
    ],
    "nextToken": "rule_id_2"
}
```

### Error response

#### Error response - `Error 502`

| Name    | Type | Description              |
| ------- | ---- | ------------------------ |
| Timeout |      | <p>Service timed out</p> |

#### Error response - `Error 503`

| Name          | Type | Description                    |
| ------------- | ---- | ------------------------------ |
| InternalError |      | <p>Internal error occurred</p> |

## <a name='Update-a-rule'></a> Update a rule

[Back to top](#top)

<p>Update rule in a rule bundle referencing a cloud resource or fixed resource</p>

```
PUT /rulebundles/{id}/rules/{ruleId}
```

### Parameters - `Parameter`

| Name         | Type     | Description                                          |
| ------------ | -------- | ---------------------------------------------------- | ------- | --------- |
| protocol     | `string` | <p>The protocol for this rule supported tcp          | udp</p> |
| action       | `string` | <p>The action specified for this rule supported drop | pass    | alert</p> |
| source       | `string` | <p>The object's id as a source of this rule</p>      |
| destination  | `string` | <p>The object's id as a destination of this rule</p> |
| ruleBundleId | `string` | <p>The bundle ID this rule attaches to</p>           |

### Examples

CURL Example:

```curl
 curl --location --request PUT 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-group/rules/88bc676a-4917-490e-92ab-610a545c5baf' --data-raw '{
  "action": "drop",
  "destination": "Onprem_Server",
  "protocol": "udp",
  "ruleBundleId": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23",
  "source": "Ec2_Arn_DEMO",
  "id":"88bc676a-4917-490e-92ab-610a545c5baf"
}'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description    |
| ---- | ---- | -------------- |
| Rule |      | <p>created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
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
```

### Error response

#### Error response - `Error 400`

| Name       | Type | Description                                                  |
| ---------- | ---- | ------------------------------------------------------------ |
| BadRequest |      | <p>Rule bundle id path parameter cannot be null or empty</p> |

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 500`

| Name        | Type | Description                                   |
| ----------- | ---- | --------------------------------------------- |
| RemoteError |      | <p>Unable to determine user accessibility</p> |

# <a name='RuleBundle'></a> RuleBundle

## <a name='Create-new-rule-bundle'></a> Create new rule bundle

[Back to top](#top)

<p>Create new rule bundle referencing a cloud resource or fixed resource</p>

```
POST /rulebundles
```

### Parameters - `Parameter`

| Name         | Type             | Description                                                                          |
| ------------ | ---------------- | ------------------------------------------------------------------------------------ |
| description  | `string`         | <p>Description of this rule bundle</p>                                               |
| id           | `String[1..100]` | <p>The object's id. id Id of this rule bundle</p>_Allowed values: "[0-9a-zA-Z_-]+"\_ |
| ownerGroup   | `list[]`         | <p>The owner group, this is SecOpsAdminRole provided by the solution</p>             |
| ruleGroupArn | `string`         | <p>The underlying AWS network firewall rule bundle arn</p>                           |

### Examples

CURL Example:

```curl
 curl --location --request POST 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/' --data-raw '{
  "id":"demo-bundle",
  "description": "demo rule bundle",
  "ownerGroup": [
    "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
  ],
  "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup"
}'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description           |
| ---- | ---- | --------------------- |
| Rule |      | <p>Bundle created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 201 OK
 {
    "id": "demo-bundle"
}
```

### Error response

#### Error response - `Error 400`

| Name        | Type | Description         |
| ----------- | ---- | ------------------- |
| Unsupported |      | <p>Port Type</p>    |
| Invalid     |      | <p>Object value</p> |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

## <a name='Delete-rule-bundle'></a> Delete rule bundle

[Back to top](#top)

<p>Delete a rule bundle</p>

```
DELETE /rulebundles/{id}
```

### Examples

CURL Example:

```curl
curl --location --request DELETE 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/demo-group-demo1'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Object |      | <p>updated</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
HTTP/1.1 200 OK
{
   "id": "demo-group-demo1"
   }
```

### Error response

#### Error response - `Error 404`

| Name   | Type | Description      |
| ------ | ---- | ---------------- |
| Object |      | <p>not found</p> |

#### Error response - `Error 400`

| Name    | Type | Description         |
| ------- | ---- | ------------------- |
| Invalid |      | <p>Object value</p> |

#### Error response - `Error 502`

| Name | Type | Description |
| ---- | ---- | ----------- |
| Time |      | <p>out</p>  |

#### Error response - `Error 503`

| Name     | Type | Description  |
| -------- | ---- | ------------ |
| Internal |      | <p>error</p> |

## <a name='Get-a-rule-bundle'></a> Get a rule bundle

[Back to top](#top)

<p>Get get rule bundle</p>

```
GET /rulebundles
```

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/{id}'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description           |
| ---- | ---- | --------------------- |
| Rule |      | <p>Bundle created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
 HTTP/1.1 200 OK
 {
    "id":"demo-group-demo",
    "description": "demo rule bundle",
    "ownerGroup": [
        "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
    ],
    "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup-1"
}
```

### Error response

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 404`

| Name     | Type | Description                                     |
| -------- | ---- | ----------------------------------------------- |
| NotFound |      | <p>The rule bundle with {id} does not exits</p> |

#### Error response - `Error 400`

| Name       | Type | Description                         |
| ---------- | ---- | ----------------------------------- |
| BadRequest |      | <p>ruleGroupArn does not exists</p> |

#### Error response - `Error 502`

| Name    | Type | Description |
| ------- | ---- | ----------- |
| Timeout |      |             |

#### Error response - `Error 503`

| Name               | Type | Description |
| ------------------ | ---- | ----------- |
| ServiceUnavailable |      |             |

## <a name='List-rule-bundles'></a> List rule bundles

[Back to top](#top)

<p>List rule bundles belongs to this requestor's arn</p>

```
GET /rulebundles
```

### Parameters - `Optional Query Parameters`

| Name      | Type     | Description                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| limit     | `number` | **optional** <p>The number of object per page.</p>_Default value: 100_<br>_Size range: 1-100_<br> |
| nextToken | `string` | **optional** <p>The pagination token.</p>                                                         |

### Examples

CURL Example:

```curl
curl --location --request GET 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/'
```

### Success response

#### Success response - `Success 200`

| Name   | Type | Description    |
| ------ | ---- | -------------- |
| Object |      | <p>results</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
     HTTP/1.1 200 OK
 {
    "results": [
        {
            "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account_number>:stateful-rulegroup/anfwconfig-testrulegroup-demo",
            "ownerGroup": [
                "arn:aws:iam::<account_number>:role/ObjectExtensionSecOpsAdminRole"
            ],
            "description": "integration rule bundle admin only",
            "id": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23",
            "createdTimestamp": "2021-09-15T02:53:53.435Z",
            "aggregatorName": "org-replicator"
        }
    ],
    "nextToken": "integration-CRUD-test-group-4dadbfc5-58f2-4e3d-a9bc-193753a49a23"
}
```

### Error response

#### Error response - `Error 502`

| Name    | Type | Description              |
| ------- | ---- | ------------------------ |
| Timeout |      | <p>Service timed out</p> |

#### Error response - `Error 503`

| Name          | Type | Description                    |
| ------------- | ---- | ------------------------------ |
| InternalError |      | <p>Internal error occurred</p> |

## <a name='Update-a-rule-bundle'></a> Update a rule bundle

[Back to top](#top)

<p>Create new rule bundle to encapsulate the underling Network firewall rule bundles</p>

```
PUT /rulebundles
```

### Parameters - `Parameter`

| Name         | Type     | Description                                                              |
| ------------ | -------- | ------------------------------------------------------------------------ |
| description  | `string` | <p>Description of this rule bundle</p>                                   |
| id           | `string` | <p>Id of this rule bundle</p>                                            |
| ownerGroup   | `list[]` | <p>The owner group, this is SecOpsAdminRole provided by the solution</p> |
| ruleGroupArn | `string` | <p>The underlying AWS network firewall rule bundle arn</p>               |

### Examples

CURL Example:

```curl
 curl --location --request PUT 'https://<rest_api_id>.execute-api.ap-southeast-2.amazonaws.com/prod/rulebundles/' --data-raw '{
    "id":"demo-group-demo",
    "description": "demo rule bundle",
    "ownerGroup": [
        "arn:aws:iam::<account-number>:role/ObjectExtensionSecOpsAdminRole"
    ],
    "ruleGroupArn": "arn:aws:network-firewall:ap-southeast-2:<account-number>:stateful-rulegroup/anfwconfig-demo-rulegroup-1"
}'
```

### Success response

#### Success response - `Success 201`

| Name | Type | Description          |
| ---- | ---- | -------------------- |
| Rule |      | <p>Group created</p> |

### Success response example

#### Success response example - `Success-Response: `

```json
 HTTP/1.1 200 OK
 {
    "ruleBundleId": "demo-group-demo"
}
```

### Error response

#### Error response - `Error 403`

| Name      | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| Forbidden |      | <p>Requestor's arn is not authorized to perform this action</p> |

#### Error response - `Error 409`

| Name     | Type | Description                        |
| -------- | ---- | ---------------------------------- |
| Conflict |      | <p>Requested id already exists</p> |

#### Error response - `Error 400`

| Name       | Type | Description                         |
| ---------- | ---- | ----------------------------------- |
| BadRequest |      | <p>ruleGroupArn does not exists</p> |

#### Error response - `Error 502`

| Name    | Type | Description |
| ------- | ---- | ----------- |
| Timeout |      |             |

#### Error response - `Error 503`

| Name               | Type | Description |
| ------------------ | ---- | ----------- |
| ServiceUnavailable |      |             |
