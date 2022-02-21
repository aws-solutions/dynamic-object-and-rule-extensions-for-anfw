package ff.packages.rules

import data.ff.lib.policy

# ---------
# Interface
# ---------

packageId = "rules"
packageVersion = "0.0.1"
violationCount = 0

applicablePolicies = p {
  p = policySet
}

availablePolices = p {
  p = availablePolicySet
}