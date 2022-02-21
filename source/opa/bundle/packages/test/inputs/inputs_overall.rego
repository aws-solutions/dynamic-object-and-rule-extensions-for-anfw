package ff.packages.cfn.test.inputs.overall
import data.ff.packages.cfn.test.inputs.util as testUtil

request_non_existing_policies_input  = {
    "input": {
        "request": {
            "policyIds": [ "not_existing_policies_xxxxxyyyy"],
            "context": {
                "requester": {
                    "arn": "arn-bla",
                    "accountId": "111122223333",
                    "role": "appowner"
                },
            },
            "type": "CREATE",
            "content": {
                "object": {
                    "id": "Ec2_SUBNET",
                    "port": {
                        "type": "Any"
                    },
                    "type": "Arn",
                    "value": "arn:aws:ec2:ap-southeast-2:111122223333:subnet/subnet-0290eedfd4a706c55"
                }
            }
        }
    }
}
