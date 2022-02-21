package packages.ff.objects

import data.ff.packages.objects as objects
import data.ff.packages.objects.test.inputs

test_failure{
    i=inputs.failure_input
    result=objects.forbidden_cross_object_reference with input as i.input
    result.status == "fail"
}

test_success{
    i=inputs.success_input
    result=objects.forbidden_cross_object_reference with input as i.input
    result.status = "pass"
}

test_admin_not_limited{
    i=inputs.admin_request_input
    result=objects.forbidden_cross_object_reference with input as i.input
    result.status = "pass"
}

test_pass_ignore_none_mutation_changes {
    i=inputs.non_mutation_input
    result=objects.forbidden_cross_object_reference with input as i.input
    result.status = "pass"
}
