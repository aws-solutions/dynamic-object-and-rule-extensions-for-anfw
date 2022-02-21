package ff.packages.objects.test.inputs

success_input  = {
    "input": {
        "request": {
            "policyIds": [ "forbidden_cross_object_reference"],
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

failure_input  = {
    "input": {
        "request": {
            "policyIds": [ "forbidden_cross_object_reference"],
            "context": {
                "requester": {
                    "arn": "arn-bla",
                    "accountId": "100000",
                    "role": "appowner"
                }
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


non_mutation_input  = {
    "input": {
        "request": {
            "policyIds": [ "forbidden_cross_object_reference"],
            "context": {
                "requester": {
                    "arn": "arn-bla",
                    "accountId": "100000",
                    "role": "appowner"
                }
            },
            "type": "QUERY",
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



admin_request_input  = {
    "input": {
        "request": {
           "policyIds": [ "forbidden_cross_object_reference"],
            "context": {
                "requester": {
                    "arn": "arn-bla",
                    "accountId": "100000",
                    "role": "admin"
                }
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
