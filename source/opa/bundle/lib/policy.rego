package ff.lib.policy

createPolicyResult(packageId, policyId, status, msg, decisionContext) = result {
  result := {
    "packageId": packageId,
    "id": policyId,
    "status": status,
    "msg": msg,
    "decisionContext": decisionContext
  }
}

createPolicyResponse(packageId, policyInfo, result) = response {
  response := {
    "packageId": packageId,
    "policyId": policyInfo.policyId,
    "level": policyInfo.level,
    "parameters": policyInfo.parameters,
    "status": result.status,
    "msg": result.msg,
    "decisionContext": result.decisionContext
  }
}

createRunResponse(packages, policies, responses, missingResults) = response {
  response := {
    "status": getOverallStatus(responses),
    "packages": packages,
    "policies": policies,
    "missingResults": missingResults,
    "responses": responses
  }
}

invalidRequest = res {
  result := createPolicyResult( 
    "core",
    "invalidRequest",
    "fail",
    sprintf("Unknown request - '%s'", [ input.request]),
    []
  )

  mainpolicy := {
    "level": "mandatory",
    "policyId": "main/invalidRequest",
    "parameters": {}
  }

  response := createPolicyResponse("core", mainpolicy, result)

  res = {
    "packages": [],
    "policies": [],
    "responses": [ response ],
    "status": "fail"
  }
}

getOverallStatus(responses) = res {
  responses[idx].level == "mandatory"
  responses[idx].status == "fail"
  res := "fail"
} else = res {
  responses[idx].level == "mandatory"
  responses[idx].status == "unkown"
  res := "unkown"
} else = res {
  res := "pass"
}

params(policies) = res {
  res := {
    "parameters": { packageId : objs | 
      packageId := policies[_].packageId
      objs := { policyId : params | 
        policies[x].packageId == packageId
        pol := policies[x]
        policyId := policies[x].policyId
        params := pol.parameters
      }
    }
  }
}

run(packages, policies, policyInput) = response {
  trace(sprintf("Evaluating policies %v", [policies]))
  r = [ r2 |
    p = policies[_]
    parameters =  params(policies)
    inputPlusParams := object.union(policyInput, parameters)    
    r1 = data.ff.packages[p.packageId][p.policyId] with input as inputPlusParams
    r2 = createPolicyResponse(p.packageId, p, r1)
  ]

  policyIds = { fullId | 
    p = policies[_]
    fullId = sprintf("%s/%s", [p.packageId, p.policyId])
  }
  resultIds = { fullId | 
    p = r[_]
    fullId = sprintf("%s/%s", [p.packageId, p.policyId])
  }
  missingResults = policyIds - resultIds
  packageInfo := [ pkg |  
    pname := packages[_]
    pversion := data.ff.packages[pname].packageVersion
    pkg := { 
      "packageId": pname,
      "version": pversion
    }
  ]
   
  response = createRunResponse(
    packageInfo,
    policyIds,
    r,
    missingResults
  )
}