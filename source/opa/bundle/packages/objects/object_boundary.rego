package ff.packages.objects

import data.ff.lib.policy

# ---------
# Interface
# ---------

packageId = "objects"

packageVersion = "0.0.1"

policies = p {
	p = policySet
}

#------------
# Policy sets
#------------
FF_OBJECTS_REGISTERED_POLICIES := [{
	"level": "mandatory",
	"packageId": "objects",
	"policyId": "forbidden_cross_object_reference",
	"parameters": {},
}]

availablePolicySet[p] {
	p := FF_OBJECTS_REGISTERED_POLICIES
}

policySet[p] {
	p := FF_OBJECTS_REGISTERED_POLICIES
}
packageId = "objects"
# --------
# Policies
# --------

forbidden_cross_object_reference = result {
	input.request.type == ["CREATE", "UPDATE"][_]
	input.request.context.requester.role == "appowner"
	input.request.content.object.type == "Arn"
	objectValueArn := input.request.content.object.value
	referencedAccount := regex.split(":", objectValueArn)[4]

	requestorAccount := input.request.context.requester.accountId
	referencedAccount != requestorAccount

	msg := sprintf("forbidden_cross_object_reference check failed, requester from account %s is attempting to reference object in: [%s]", [requestorAccount,  referencedAccount])
	
	result := policy.createPolicyResult(packageId, "forbidden_cross_object_reference_check_passed", "fail", msg, {})
	
} else = result {
	result := policy.createPolicyResult(packageId, "forbidden_cross_object_reference_check_failed", "pass", "",{})
}