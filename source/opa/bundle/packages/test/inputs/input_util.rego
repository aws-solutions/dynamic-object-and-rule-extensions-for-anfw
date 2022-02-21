package ff.packages.cfn.test.inputs.util

input_common := {
    "input": {
        "request": {
			"policyIds": [],
            "requestType": "deployment",
            "appspaceId": "",
            "user": "",
            "releaseCandidate": {
                "id": "",
                "appId": ""
            },
            "attestations": [
                {
                    "attestationId": "cb02ab35-661b-456c-a524-95207f86ffed",
                    "authorityId": "62477a42-2358-4fb5-81fd-ed0f3568702c",
                    "targetId": "est-0ckvqupmb6",
                    "createdTimestamp": "2021-06-21T01:51:03.557Z",
                    "content": {
                        "entityType": "ecp/AttestationInterpretations/TermsOfUse",
                        "schemaVersion": "0.1",
                        "itServiceCINumber": "CM0742278",
                        "platformName": "ECP",
                        "itServiceName": "ECP Core Components",
                        "informationClassification": "confidential",
                        "materialWorkload": false,
                        "extremeOrHeightenedInherentRisk": false,
                        "appliedWorkplaceStandard": true,
                        "region": "Australia",
                        "outsideRegionSupportTxt": "",
                        "signedDate": "2020-09-28T06:57:40.327Z",
                        "renewalDate": "2025-09-27T06:57:40.327Z",
                        "lanId": "wangy69",
                        "name": "Jasper Wang",
                        "positionTitle": "Technical Manager - ECP/AGS",
                        "emailAddress": "Yu.Wang@cba.com.au"
                    },
                    "schemaId": "TermsOfUse-v0.1"
                },
                {
                    "content": {
                        "meta": {
                            "applicationName": "AgsSampleAppEc2",
                            "provisionCodeRepository": false,
                            "provisionCIPipeline": false,
                            "estateId": "est-kk13s9up34",
                            "environmentIds": ["env-kk13s9up34-m5v9fufvwh", "env-kk13s9up34-61ee2jh6nc"],
                            "dataClassification": "PII",
                            "hostingConstruct": "ec2",
                            "applicationOwner": "mitchell.dellamarta@cba.com.au",
                            "applicationId": "02bz6knvdbd896ufmwl1ftmhri",
                            "createdDateTime": "2021-06-23T08:16:27.127Z",
                            "lastModifiedDateTime": "2021-06-23T08:22:45.977Z",
                            "ciArtifactBucketName": "ags-ci-art-teamce-agssampleappec2",
                            "pipelineArn": "arn:aws:codepipeline:ap-southeast-2:038892896692:AgsSampleAppEc2-Pipeline",
                            "cdTemplateBucketName": "continuous-deploy-pipeline-template-au-ecpalphanonprod",
                            "ciArtifactBucketRegion": "ap-southeast-2",
                            "ciArtifactBucketUri": "s3://ags-ci-art-teamce-agssampleappec2/app.zip",
                            "cdTemplateBucketKey": "pipeline.zip",
                            "ciArtifactBucketKey": "app.zip"
                        }
                    }
                }
            ],
            "cfnTemplate": {
                "AWSTemplateFormatVersion": "2010-09-09",
                "Resources": {},
            }
        }
    }
}

combine(cfn_resource_json, targetPolicies) = generated_input {
    cfnTempalte := object.union(
                    { k:v | some k;k != "cfnTemplate";v:=input_common.input.request[k] },
                    { "cfnTemplate":v | v := object.union(input_common.input.request.cfnTemplate, cfn_resource_json) },
                )
    generated_input := {
        "input": {
            "request":
                object.union(cfnTempalte, {  "policyIds" : targetPolicies  } )
        }
    }
}