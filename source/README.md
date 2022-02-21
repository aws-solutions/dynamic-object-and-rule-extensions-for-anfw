# dynamic-object-and-rule-extensions-for-anfw
Dynamic Object and Rule Extensions for AWS Network Firewall solution source folder

This folder contains the solution's infrastructure code (CDK stacks and construct) as well as the lambdas written in Typescript to support the core functions


## Prerequisite
* The latest version of the AWS CLI (2.2.37 or newer), installed and configured.
    * https://aws.amazon.com/cli/
* The latest version of the AWS CDK (1.139.0 or newer).
    * https://docs.aws.amazon.com/cdk/latest/guide/home.html
    * Bootstrap target account https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html
* Make 3.5.0 +
* Docker 19.0.0 +.  (required when enableOpa set to true)
    * https://docs.docker.com/get-docker/
* A CDK bootstrapped AWS account.
    * https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html
* nodejs version 14 
    * https://docs.npmjs.com/getting-started
* cli tools zip tar gzip    

## Useful commands for development

 * `npm run install:all`   install all dependencies for the solution
 * `npm run all`           compile and build the solution
 * `npm run all`           compile and build the solution
 * `npm release`           release a new version of this solution
 * `npm cleanup`           clean up node_module and dist folder for a clean environment

### Deployment 
Configuration and deployment steps are specified in [Building and Deploy the solution](../README.md)

 ## Working with Lambda functions in the solution

This solution provides the following structure to manage its core lambdas includes:
* firewall-auto-config
* firewall-config-api
* firewall-config-scheduler
* canary

Folder structure:

```
|-lambda
├── canary                     [ The canary lambda to monitor API connectivity]
│   ├── build
│   ├── canary.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── src
│   └── tsconfig.json
├── firewall-auto-config       [ The auto config lambda module to resolve cloud resource info suricata rules]
│   ├── buildspec.yml
│   ├── canary.config.js
│   ├── coverage
│   ├── env.json
│   ├── events
│   ├── jest.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── reports
│   ├── samconfig.toml
│   ├── src
│   ├── template.yaml
│   ├── test
│   ├── tsconfig.json
│   └── webpack.config.js
├── firewall-config-api       [ The lambda module to response to API calls]
│   ├── buildspec.yml
│   ├── canary.config.js
│   ├── coverage
│   ├── env.json
│   ├── events
│   ├── jest.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── reports
│   ├── samconfig.toml
│   ├── src
│   ├── template.yaml
│   ├── test
│   ├── tsconfig.json
│   └── webpack.config.js
├── firewall-config-scheduler  [ The lambda module to schedule rule evaluation periodically based on configuration]
│   ├── buildspec.yml
│   ├── coverage
│   ├── env.json
│   ├── events
│   ├── jest.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── reports
│   ├── samconfig.toml
│   ├── src
│   ├── template.yaml
│   ├── test
│   ├── tsconfig.json
│   └── webpack.config.js
└── shared-types              [ The node module contains the shared function and types to be used by the lambdas above]
    ├── coverage
    ├── dist
    ├── index.ts
    ├── jest.config.js
    ├── package-lock.json
    ├── package.json
    ├── reports
    ├── src
    ├── test
    └── tsconfig.json
```