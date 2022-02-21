package packages.main

import data.main 
import  data.ff.packages.objects.test.inputs as objects_inputs
import  data.ff.packages.cfn.test.inputs.overall as general_inputs

test_fail_object_modification_violate {
    i = objects_inputs.success_input
    result = data.main.decision with input as i.input
    result.status == "pass"
    result.responses[_].policyId == "forbidden_cross_object_reference"
}

test_fail_object_modification_violate {
    i = general_inputs.request_non_existing_policies_input
    result = data.main.decision with input as i.input
    result.status == "fail"
    result.responses[_].decisionContext.invalidPolicyIds[_] == "not_existing_policies_xxxxxyyyy"
}
