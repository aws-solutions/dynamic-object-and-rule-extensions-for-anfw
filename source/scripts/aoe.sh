#!/bin/bash

SOLUTION="ANFW Network and Object Extensions Solution"

function do_help() {
    echo >&2 "
$SOLUTION API script

Supported commands:

    Audit
    -----
    list-audits-request [--audit-limit <number>] [--audit-next-token <nexttoken>]

    Rule-Bundles
    ----------
    get-rule-bundles
    get-rule-bundle --rule-bundle-id <id>
    create-rule-bundle --rule-bundle-id <id> --rule-bundle-description <description> --rule-bundle-owner-group <ownerarn> --rule-group-arn <rulegrouparn>
    update-rule-bundle --rule-bundle-id <id> --rule-bundle-description <description> --rule-bundle-owner-group <ownerarn> --rule-group-arn <rulegrouparn>
    delete-rule-bundle --rule-bundle-id <id>

    Rules
    -----
    get-rules --rule-bundle-id <id>
    get-rule --rule-bundle-id <id> --rule-id <id>
    create-rule --rule-bundle-id <id> --rule-protocol <protocol> --rule-action <action> --rule-source <source object>  --source-port-type <type> --source-port-value --rule-destination <destination object>  --destination-port-type <type> --destination-port-value  [--options [optionfield]]
    update-rule --rule-bundle-id <id> --rule-protocol <protocol> --rule-action <action> --rule-source <source object> --rule-destination <destination object> [--options [optionfield]]
    delete-rule --rule-bundle-id <id> --rule-id <id>

    Objects
    -------
    get-objects
    get-object --object-id <id>
    create-object --object-id <id> --object-type <type> --object-value <value> 
    update-object --object-id <id> --object-type <type> --object-value <value> 
    delete-object --object-id <id>

Parameters:

    Object Types (--object-type)
    ------------
    \"Arn\"         Value: The arn of an AWS object
    \"Tagged\"      Value: A tag list in json format, eg '[{\"key\":\"Name\",\"value\":\"CloudInstance\"}]' 
    \"Address\"     Value: A static IP address

    Port Types and Values (--port-type)
    -----------------------------------
    \"Any\"         Value: Notrequired
    \"SinglePort\"  Value: A single tcp/udp port
    \"PortRange\"   Value: A port range, eg '[80:85]]

    Rule Action
    -----------
    Value:  One of pass, drop or alert

    Rule Options
    ------------
    Value: A key/value pair of rule options in json format, eg 
        '[{\"key\":\"reference\",\"value\":\"url,a.com\"},{\"key\":\"classtype\",\"value\":\"trojan-activity\"}]'

Options:
    -d     Enable verbose output
    -r     Enable raw output (do not send through jq)

Environment variables:
    AWS_ACCESS_KEY_ID       (required) - Authentication parameters
    AWS_SECRET_ACCESS_KEY   (required)- Authentication parameters
    AWS_SESSION_TOKEN       (required) - Authentication parameters
    API_ENDPOINT            (required) - URL for solution API endpoint
    GNU_GETOPT_PATH         (optional) - Local path to find gnu getopt
"
    exit 1
}

function vars_unset() {
    variables=("$@")
    for var in "${variables[@]}"; do
        if [ -z "${!var}" ]; then
            echo >&2 "Error: $var is not set."
            error=true
        fi
    done
    if [ -n "$error" ]; then
        echo >&2 "Exiting."
        exit 1
    fi
    return 0
}

function opts_unset() {
    var=$1
    cmd=$2
    opt=$3
    if [ -z "${!var}" ]; then
        echo >&2 "Error: $cmd requires $opt. 
Exiting."
        exit 1
    fi
    return 0
}

# Check for binary dependencies
hash awscurl 2>/dev/null || {
    echo >&2 "Error: awscurl is not installed. Exiting."
    exit 1
}

hash jq 2>/dev/null || {
    echo >&2 "Error: jq is not installed. Exiting."
    exit 1
}

if [ -z ${GNU_GETOPT_PATH} ]; then
    hash getopt 2>/dev/null || {
        echo >&2 "Error: getopt is not installed. Exiting."
        exit 1
    }
    GETOPT=$(which getopt)
else
    GETOPT=${GNU_GETOPT_PATH}
fi
# Make sure we have gnu getopt available

$GETOPT -T >/dev/null
if [ $? -ne 4 ]; then
    echo "Error: gnu getopt is required. On Mac OSX, please install from homebrew/macports and ensure it is in your path, or set GNU_GETOPT_PATH correctly. Exiting."
    exit 1
fi

# Make sure our AWS credentials are configured

vars_unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

# Allow for region override

unset REGION
if [ -n "${AWS_REGION}" ]; then
    REGION="--region ${AWS_REGION}"
fi

# Make sure API_ENDPOINT is configured

if [ -z ${API_ENDPOINT} ]; then
    echo >&2 "
API_ENDPOINT is not set. See stack output for the solution API Endpoint.
 
Example: export API_ENDPOINT=https://abcdefgh.execute-api.ap-southeast-2.amazonaws.com/prod
 
Exiting."
    exit 1
fi

# Remove trailing slash if it exists (generated from the stack output)

if [ "${API_ENDPOINT: -1}" = "/" ]; then
    API_ENDPOINT=${API_ENDPOINT%?}
fi

OPTS=$(${GETOPT} -o hdr --long "object-id:","object-type:","object-value:","source-port-type:","source-port-value:","destination-port-type:","destination-port-value:","rule-id:","rule-protocol:","rule-action:","rule-source:","rule-destination:","rule-bundle-id:","rule-bundle-description:","rule-bundle-owner-group:","rule-group-arn:","audit-limit:","audit-next-token:","options:" -- "$@")

eval set -- "${OPTS}"

if [ "$?" -ne 0 ]; then
    do_help
fi

DEBUG=false
RAW=false
HELP=false
unset AUDIT_LIMIT AUDIT_NEXT_TOKEN
unset OBJECT_ID OBJECT_TYPE OBJECT_VALUE
unset SOURCE_PORT_TYPE SOURCE_PORT_VALUE DESTINATION_PORT_TYPE DESTINATION_PORT_VALUE
unset RULE_ID RULE_SOURCE RULE_PROTOCOL RULE_SOURCE RULE_DESTINATION
unset RULE_BUNDLE_ID RULE_BUNDLE_DESCRIPTION RULE_BUNDLE_OWNER_GROUP RULE_GROUP_ARN
unset OPTIONS

while true; do
    case "$1" in
    -r)
        RAW="true"
        shift
        ;;
    -h)
        HELP="true"
        shift
        ;;
    -d)
        DEBUG="true"
        shift
        ;;
    --object-id)
        OBJECT_ID="$2"
        shift 2
        ;;
    --rule-id)
        RULE_ID="$2"
        shift 2
        ;;
    --rule-protocol)
        RULE_PROTOCOL="$2"
        shift 2
        ;;
    --rule-action)
        RULE_ACTION="$2"
        shift 2
        ;;
    --rule-source)
        RULE_SOURCE="$2"
        shift 2
        ;;
    --rule-destination)
        RULE_DESTINATION="$2"
        shift 2
        ;;
    --rule-bundle)
        RULE_BUNDLE="$2"
        shift 2
        ;;
    --rule-bundle-id)
        RULE_BUNDLE_ID="$2"
        shift 2
        ;;
    --rule-bundle-description)
        RULE_BUNDLE_DESCRIPTION="$2"
        shift 2
        ;;
    --rule-bundle-owner-group)
        RULE_BUNDLE_OWNER_GROUP="$2"
        shift 2
        ;;
    --rule-group-arn)
        RULE_GROUP_ARN="$2"
        shift 2
        ;;
    --object-id)
        OBJECT_ID="$2"
        shift 2
        ;;
    --object-type)
        OBJECT_TYPE="$2"
        shift 2
        ;;
    --object-value)
        OBJECT_VALUE="$2"
        shift 2
        ;;
    --source-port-type)
        SOURCE_PORT_TYPE="$2"
        shift 2
        ;;
    --source-port-value)
        SOURCE_PORT_VALUE="$2"
        shift 2
        ;;
    --destination-port-type)
        DESTINATION_PORT_TYPE="$2"
        shift 2
        ;;
    --destination-port-value)
        DESTINATION_PORT_VALUE="$2"
        shift 2
        ;;
    --audit-limit)
        AUDIT_LIMIT="$2"
        shift 2
        ;;
    --audit-next-token)
        AUDIT_NEXT_TOKEN="$2"
        shift 2
        ;;
    --options)
        OPTIONS="$2"
        shift 2
        ;;
    --)
        shift
        break
        ;;
    *) break ;;
    esac
done

if [ "$HELP" = "true" ]; then
    do_help
fi

JQ=
if [ "$RAW" = "false" ]; then
    JQ='| jq'
fi
AWSCURL_VERBOSE=
if [ "$DEBUG" = "true" ]; then
    AWSCURL_VERBOSE='-v '
fi

CONTENT_TYPE='Content-Type: application/json'

while true; do
    case "$1" in
    list-audits-request)
        if [ -n "${AUDIT_LIMIT}" ]; then
            QUERY_PARAMS="limit=${AUDIT_LIMIT}"
        fi
        if [ -n "${AUDIT_NEXT_TOKEN}" ]; then
            QUERY_PARAMS="${QUERY_PARAMS}&nextToken=${AUDIT_NEXT_TOKEN}"
        fi

        # Create API URL
        URL="${API_ENDPOINT}/audits?${QUERY_PARAMS}"

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET '${URL}' ${JQ}"

        exit 0
        ;;
    get-rules)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}/rules

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    get-rule)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        opts_unset RULE_ID ${COMMAND} "--rule-id"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}/rules/${RULE_ID}

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    create-rule)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        opts_unset RULE_PROTOCOL ${COMMAND} "--rule-protocol"
        opts_unset RULE_ACTION ${COMMAND} "--rule-action"
        opts_unset RULE_SOURCE ${COMMAND} "--rule-source"
        opts_unset RULE_DESTINATION ${COMMAND} "--rule-destination"
        opts_unset SOURCE_PORT_TYPE ${COMMAND} "--source-port-type"
        opts_unset DESTINATION_PORT_TYPE ${COMMAND} "--destination-port-type"

        # Port type != Any requires port-value 
        if [ ${SOURCE_PORT_TYPE} != "Any" ]; then
            opts_unset SOURCE_PORT_VALUE "--source-port-type of ${SOURCE_PORT_TYPE}" "--source-port-value"
        fi

        SOURCE_PORT='{ "type":"'${SOURCE_PORT_TYPE}'"'
        if [ -n "${SOURCE_PORT_VALUE}" ]; then
            SOURCE_PORT=${SOURCE_PORT}', "value": "'${SOURCE_PORT_VALUE}'"'
        fi
        SOURCE_PORT=${SOURCE_PORT}' }'

        # Port type != Any requires port-value 
        if [ ${DESTINATION_PORT_TYPE} != "Any" ]; then
            opts_unset DESTINATION_PORT_VALUE "--destination-port-type of ${DESTINATION_PORT_TYPE}" "--destination-port-value"
        fi

        DESTINATION_PORT='{ "type":"'${DESTINATION_PORT_TYPE}'"'
        if [ -n "${DESTINATION_PORT_VALUE}" ]; then
            DESTINATION_PORT=${DESTINATION_PORT}', "value": "'${DESTINATION_PORT_VALUE}'"'
        fi
        DESTINATION_PORT=${DESTINATION_PORT}' }'

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}/rules

        # Create payload
        DATA='{ "ruleBundleId": "'${RULE_BUNDLE_ID}'", "protocol": "'${RULE_PROTOCOL}'", "action": "'${RULE_ACTION}'" , "source": "'${RULE_SOURCE}'", "sourcePort": '${SOURCE_PORT}', "destination": "'${RULE_DESTINATION}'", "destinationPort": '${DESTINATION_PORT}

        # Add options if provided
        if [ -n "${OPTIONS}" ]; then
            DATA=${DATA}', "optionFields": '${OPTIONS}
        fi
        DATA=${DATA}' }'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPOST ${URL} --data '$DATA' ${JQ}"

        exit 0
        ;;
    update-rule)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        opts_unset RULE_PROTOCOL ${COMMAND} "--rule-protocol"
        opts_unset RULE_ACTION ${COMMAND} "--rule-action"
        opts_unset RULE_SOURCE ${COMMAND} "--rule-source"
        opts_unset RULE_DESTINATION ${COMMAND} "--rule-destination"
        opts_unset SOURCE_PORT_TYPE ${COMMAND} "--source-port-type"
        opts_unset DESTINATION_PORT_TYPE ${COMMAND} "--destination-port-type"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}/rules

        # Create payload
        DATA='{ "ruleBundleId": "'${RULE_BUNDLE_ID}'", "protocol": "'${RULE_PROTOCOL}'", "action": "'${RULE_ACTION}'" , "source": "'${RULE_SOURCE}'", "sourcePort": '${SOURCE_PORT}', "destination": "'${RULE_DESTINATION}'", "destinationPort": '${DESTINATION_PORT}

        # Add options if provided
        if [ -n "${OPTIONS}" ]; then
            DATA=${DATA}', "optionFields": '${OPTIONS}
        fi
        DATA=${DATA}' }'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPUT ${URL} --data '$DATA' ${JQ}"

        exit 0
        ;;
    delete-rule)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_ID ${COMMAND} "--rule-id"
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}/rules/${RULE_ID}
        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XDELETE ${URL} --data '${DATA}' ${JQ}"

        exit 0
        ;;
    get-rule-bundles)
        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    get-rule-bundle)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    create-rule-bundle)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        opts_unset RULE_BUNDLE_DESCRIPTION ${COMMAND} "--rule-bundle-description"
        opts_unset RULE_BUNDLE_OWNER_GROUP ${COMMAND} "--rule-bundle-owner-group"
        opts_unset RULE_GROUP_ARN ${COMMAND} "--rule-group-arn"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles

        # Create payload
        DATA='{ "id":"'${RULE_BUNDLE_ID}'", "description": "'${RULE_BUNDLE_DESCRIPTION}'", "ownerGroup": [ "'${RULE_BUNDLE_OWNER_GROUP}'" ], "ruleGroupArn": "'${RULE_GROUP_ARN}'" }'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPOST ${URL} --data '$DATA' ${JQ}"

        exit 0
        ;;
    update-rule-bundle)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"
        opts_unset RULE_BUNDLE_DESCRIPTION ${COMMAND} "--rule-bundle-description"
        opts_unset RULE_BUNDLE_OWNER_GROUP ${COMMAND} "--rule-bundle-owner-group"
        opts_unset RULE_GROUP_ARN ${COMMAND} "--rule-group-arn"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles

        # Create payload
        DATA='{ "id":"'${RULE_BUNDLE_ID}'", "description": "'${RULE_BUNDLE_DESCRIPTION}'", "ownerGroup": [ "'${RULE_BUNDLE_OWNER_GROUP}'" ], "ruleGroupArn": "'${RULE_GROUP_ARN}'" }'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPUT ${URL} --data '$DATA' ${JQ}"

        exit 0
        ;;
    delete-rule-bundle)
        # Check command parameters
        COMMAND=$1
        opts_unset RULE_BUNDLE_ID ${COMMAND} "--rule-bundle-id"

        # Create API URL
        URL=${API_ENDPOINT}/rulebundles/${RULE_BUNDLE_ID}

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XDELETE ${URL} --data '${DATA}' ${JQ}"

        exit 0
        ;;
    get-objects)
        URL=${API_ENDPOINT}/objects

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    get-object)
        # Check command parameters
        COMMAND=$1
        opts_unset OBJECT_ID ${COMMAND} "--object-id"

        # Create API URL
        URL=${API_ENDPOINT}/objects/${OBJECT_ID}

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XGET ${URL} ${JQ}"

        exit 0
        ;;
    create-object)
        # Check command parameters
        COMMAND=$1
        opts_unset OBJECT_ID ${COMMAND} "--object-id"
        opts_unset OBJECT_TYPE ${COMMAND} "--object-type"
        opts_unset OBJECT_VALUE ${COMMAND} "--object-value"

        if [ ${OBJECT_TYPE} = "Tagged" ]; then
            VALUE=${OBJECT_VALUE}
        else
            VALUE='"'${OBJECT_VALUE}'"'
        fi

        # Create API URL
        URL=${API_ENDPOINT}/objects

        DATA='{ "id":"'${OBJECT_ID}'", "type": "'${OBJECT_TYPE}'", "value": '${VALUE}' }'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPOST ${URL} --data '${DATA}' ${JQ}"

        exit 0
        ;;
    update-object)
        # Check command parameters
        COMMAND=$1
        opts_unset OBJECT_ID ${COMMAND} "--object-id"
        opts_unset OBJECT_TYPE ${COMMAND} "--object-type"
        opts_unset OBJECT_VALUE ${COMMAND} "--object-value"
        
        # Create API URL
        URL=${API_ENDPOINT}/objects/${OBJECT_ID}

        DATA='{ "id":"'${OBJECT_ID}'", "type": "'${OBJECT_TYPE}'", "value": "'${OBJECT_VALUE}'"}'

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XPUT ${URL} --data '${DATA}' ${JQ}"

        exit 0
        ;;
    delete-object)
        # Check command parameters
        COMMAND=$1
        opts_unset OBJECT_ID ${COMMAND} "--object-id"

        # Create API URL
        URL=${API_ENDPOINT}/objects/${OBJECT_ID}

        eval "awscurl ${AWSCURL_VERBOSE} ${REGION} -H '${CONTENT_TYPE}' -XDELETE ${URL} --data '${DATA}' ${JQ}"

        exit 0
        ;;
    *) break ;;
    esac
done
echo "Error in options or command. Use -h for help"
exit 0
