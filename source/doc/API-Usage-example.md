## Before you begin
ensure that:

You are using Postman version 9.xx.x or higher, and
You can access the API gateway endpoint from your host (running Postman)


# Load collection to postman
1. Using Postman, navigate to Import -> Select file and select `NetworkFirewallObjectExtension-API.postman_collection.json` from /source/doc.
2. Setup environment variables
To set up the environment variables, from the left hand panel, navigate to Environments -> Create Environment, and add the following variables:

| Variable name| Description |
| -----------  | ----------- |
| ff-rest-api  | API gateway ID for this solution   |
| access_key   | AccessKeyId        |
| secret_key   | SecretAccessKey        |
| session_token   | SessionToken      |

For example, the default role to access this solution's API gate, assuming it is in ap-southeast-2, is arn:aws:iam::<region>:role/ObjectExtensionSecOpsAdminRole-ap-southeast-2.

To return the new credential values, run the following command (assuming your current credentials have the assume-role access).
```
aws sts assume-role --role-arn arn:aws:iam::<region>:role/ObjectExtensionSecOpsAdminRole-ap-southeast-2 --role-session-name IntegrationTestAdminSession --duration-second 3600
```
(assume your current credential have the assume role access) will return the new credential values.

For more information about API schema please refer to [API schema and example](source/README.md)