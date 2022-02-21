# Integration test
we need to deploy firefly and then deploy support stack to be referenced by the tests in 
# deploy support stack
*ensure the credential is correct* 
## install support stack
npm i
cdk deploy   -c account=10000 -c region=ap-southeast-2

## run test
export FF_TARGET_ACCOUNT=10000
//default-anfwconfig-rule-01 is the network firewall rule group you created to be used
export FF_RULEGROUP_NAME=default-anfwconfig-rule-01
FF_CLEAN_DATA=True npx jest test/OnboardingScenariosNew.test.ts
 