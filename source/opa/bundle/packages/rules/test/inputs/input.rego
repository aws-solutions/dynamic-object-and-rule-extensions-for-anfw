package ff.packages.rules.test.inputs

success_input = {"input": {"request": {
	"policyIds": ["forbidden_cross_object_reference"],
	"context": {"requester": {
		"arn": "arn-bla",
		"accountId": "111122223333",
		"role": "appowner",
	}},
	"type": "CREATE",
	"content": {"rule": {
		"action": "pass",
		"destination": "Onprem_Server",
		"failureReasons": [],
		"protocol": "tcp",
		"ruleGroupId": "new-group-admin-created002",
		"source": "ASG_INSTANCE_2",
		"version": 0,
	}},
}}}

failure_input = {"input": {"request": {
	"policyIds": ["forbidden_cross_object_reference"],
	"context": {"requester": {
		"arn": "arn-bla",
		"accountId": "111122223333",
		"role": "appowner",
	}},
	"type": "CREATE",
	"content": {"rule": {
		"action": "drop",
		"destination": "Onprem_Server",
		"failureReasons": [],
		"protocol": "tcp",
		"ruleGroupId": "new-group-admin-created002",
		"source": "ASG_INSTANCE_2",
		"version": 0,
	}},
}}}



admin_request_input = {"input": {"request": {
	"policyIds": ["forbidden_cross_object_reference"],
	"context": {"requester": {
		"arn": "arn-bla",
		"accountId": "111122223333",
		"role": "admin",
	}},
	"type": "CREATE",
	"content": {"rule": {
		"action": "drop",
		"destination": "Onprem_Server",
		"failureReasons": [],
		"protocol": "tcp",
		"ruleGroupId": "new-group-admin-created002",
		"source": "ASG_INSTANCE_2",
		"version": 0,
	}},
}}}
