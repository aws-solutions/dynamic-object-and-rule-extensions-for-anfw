package packages.ff.rules

import data.ff.packages.rules as rules
import data.ff.packages.rules.test.inputs

test_failure{
    i=inputs.failure_input
    result=rules.forbidden_create_modify_deny_rules_for_non_admin with input as i.input
    result.status == "fail"
}

test_success{
    i=inputs.success_input
    result=rules.forbidden_create_modify_deny_rules_for_non_admin with input as i.input
    result.status = "pass"
}

test_admin_not_limited{
    i=inputs.admin_request_input
    result=rules.forbidden_create_modify_deny_rules_for_non_admin with input as i.input
    result.status = "pass"
}

# test_pass_ignore_none_mutation_changes {
#     i=inputs.non_mutation_input
#     result=rules.forbidden_cross_object_reference with input as i.input
#     result.status = "pass"
# }
