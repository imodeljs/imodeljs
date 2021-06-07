# iTwin.js RPC Interface Integration Tests

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

This package contains the iTwin.js RPC Interface integration tests and configuration setup to run them against a deployed backend.

## Prerequisites

Refer to the iTwin.js [prerequisites](https://github.com/imodeljs/imodeljs#prerequisites)

## Running the tests

Before running the tests, the environment needs to be setup.  The easiest way is to configure a [.env] file in the working directory, the [template.env](./template.env) file has information about how to set one up and all the variables that need to be configured.

All test related settings are contained in the `process.env` variable and parsed by [Settings.ts](./setup/Settings.ts).  If something required is missing or not configured properly, the tests will fail to setup.

### Setting up the required context

The tests require an Project and iModel to be setup in order to run properly.

The iModel doesn't require anything special and can be a seed iModel.

### Specifying users to be used for testing

The tests require a single user to be specified.  The user's access rules required are:

1. User1 - full access to the Project and an iModel (requires iModelHub Read iModel Project Role)
    - i.e., "user_with_access_username" in the `.env` file.

### Specifying the backend

If the specified address for the backend is "localhost", you must have built a backend and start it.

If you do not specify the address to be "localhost" for the backend, you must specify a valid URL to a hosted backend.

### Configuring OIDC

By default the tests will retrieve valid OIDC tokens on behalf of each user specified in `environment` in order to make API calls. However,
if you wish to use JWTs instead, you may set the `oidc_client_id` environment variable which will use OIDC authentication instead of SAML.

In order to run the integration tests they need to have a valid OIDC client id which can be obtains by performing the following steps:

1. Go to the "[Register your application](https://developer.bentley.com/register/)" page and sign in
1. Click 'New App'
1. Select "SPA" application
1. Specify a client name (can be anything you want)
1. Add `http://localhost:5000` as a redirect url
1. Hit 'Next' to finish

### Actually running the tests

Once all the required environment variables are setup, to run the integration tests:

1. Install dependencies: `npm install`
2. Clean output: `npm run clean`
3. Build source: `npm run build`
4. Run tests: `npm test:integration`

## Development instructions

The base 'after all' and 'before all' hooks are implemented in TestSetup.test.ts. Any cleanup and setup steps should be added here.

The `TestContext` class follows the singleton pattern and will automatically be setup when its static instance is invoked via its `TestContext.instance()`.
The setup uses a [.env file](./.env) and `process.env` to populate the `TestContext`.
