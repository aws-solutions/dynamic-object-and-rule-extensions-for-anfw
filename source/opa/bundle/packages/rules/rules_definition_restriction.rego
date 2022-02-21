package ff.packages.rules

import data.ff.lib.policy

# ---------
# Interface
# ---------

packageId = "rules"

packageVersion = "0.0.1"

policies = p {
	p = policySet
}

#------------
# Policy sets
#------------
FF_RULES_REGISTERED_POLICIES := [{
	"level": "mandatory",
	"packageId": "rules",
	"policyId": "forbidden_create_modify_deny_rules_for_non_admin",
	"parameters": {},
	"description": "Ensure non admin can not create/modify denial [action = drop] rules"
}]

availablePolicySet[p] {
	p := FF_RULES_REGISTERED_POLICIES
}

policySet[p] {
	p := FF_RULES_REGISTERED_POLICIES
}
packageId = "rules"


forbidden_create_modify_deny_rules_for_non_admin = result {
	input.request.type == ["CREATE", "UPDATE"][_]
	input.request.context.requester.role == "appowner"
	input.request.content.rule.action == "drop"
	requestArn = input.request.context.requester.arn

	msg := sprintf("forbidden_create_modify_deny_rules_for_non_admin check failed, requester %s is attempting to create/modify denial rule in: [%s]", [requestArn,  input.request.content.rule])
	
	result := policy.createPolicyResult(packageId, "forbidden_create_modify_deny_rules_for_non_admin", "fail", msg, {})
	
} else = result {
	result := policy.createPolicyResult(packageId, "forbidden_create_modify_deny_rules_for_non_admin", "pass", "",{})
}