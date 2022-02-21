package ff.loader

import data.ff.lib.policy

#----------
# Interface
#----------

policies = p {
  p = applicablePolicies with input as policyInput
}


invalidPolicyRequest = res {
  result := policy.createPolicyResult( 
    "core",
    "invalidPolicyIdInRequest",
    "fail",
        "Unable to load policies as request contains invalid policies ids",
        {
            "invalidPolicyIds": non_existed_policies
        }
  )

  mainpolicy := {
    "level": "mandatory",
    "policyId": "main/invalidPolicyIdInRequest",
    "parameters": {}
  }

  response := policy.createPolicyResponse("core", mainpolicy, result)

  res = {
    "packages": [],
    "policies": [],
    "responses": [ response ],
    "status": "fail"
  }
}

run = response {
  count(non_existed_policies) == 0
  trace(sprintf("evaluating against policies %v", [policies]))
  response = policy.run(packages, policies, policyInput)
} 

run = response {
  count(non_existed_policies) > 0
  trace(sprintf("evaluating against policies %v", [policies]))

  response := invalidPolicyRequest
}

#-------
# Config
#-------

packages = [
  "rules",
  "objects"
]


policyInput = i {
	i = {
    	"request": input.request,
    }
}

allPolicies[p] {
  p = data.ff.packages[packages[_]].applicablePolicies[_]
}

applicablePolicies[p] {
   p = allPolicies[_][_]
   p.policyId == input.request.policyIds[_]
}

allAvailiablePolicies[p] {
   p = data.ff.packages[packages[_]].availablePolices[_][_]
   p.policyId == input.request.policyIds[_]
}

non_existed_policies[non_existed_policiy_ids] {
	request_set := {x | x := input.request.policyIds[_]}
  existing_policy_set := {x | x := allAvailiablePolicies[_].policyId}
  non_existed_policiy_ids = (request_set - existing_policy_set)[_]
}

