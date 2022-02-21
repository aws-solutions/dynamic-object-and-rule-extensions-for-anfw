#!/bin/bash
#
# This script runs all tests for the root CDK project and Lambda functions.
# These include unit tests, integration tests, and snapshot tests.

[ "$DEBUG" == 'true' ] && set -x
set -e

source_dir="$PWD"

echo "------------------------------------------------------------------------------"
echo "Starting Lambda Unit Tests"
echo "------------------------------------------------------------------------------"
cd $source_dir

npm run install:all
npm run all

cd $source_dir

echo "------------------------------------------------------------------------------"
echo "Starting CDK Unit Test"
echo "------------------------------------------------------------------------------"
npm ci && npm run test -- -u

echo "------------------------------------------------------------------------------"
echo "Unit tests complete"
echo "------------------------------------------------------------------------------"