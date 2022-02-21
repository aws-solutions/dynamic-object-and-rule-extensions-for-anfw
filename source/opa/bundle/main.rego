package main

import data.ff.lib.policy

decision = res {
  res = data.ff.loader.run
} else = res {
  res = policy.invalidRequest
}

policies = res {
  res = [ r | 
    r = data.ff.packages[_].availablePolicySet[_][_]
  ]
} else = res {
  res = policy.invalidRequest
}