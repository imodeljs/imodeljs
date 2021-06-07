# Developing a desktop viewer

## Setup

- [Install necessary prerequisites]($docs/getting-started/development-prerequisites)
- [Clone desktop-starter repo](https://github.com/imodeljs/desktop-starter)

## Create application

- Navigate to [developer.bentley.com](https://developer.bentley.com/register/)
- Sign in
- Configure application
  - Provide application name
  - API associations: "Visualization"
  - Application type: "Desktop/Mobile"
  - Redirect URI: "http://localhost:3000/signin-callback"
  - Post logout redirect URI: "http://localhost:3000"
  - Save
- Click on the name of the client you just created to see the details
- Copy Client ID to your clipboard

## Build

- Open the cloned repo in VS Code
- Edit [./src/backend/main.ts](https://github.com/imodeljs/desktop-starter/blob/master/src/backend/main.ts#L55)
- Replace `REPLACE_WITH_CLIENT_ID` with your Client ID
  - Ex: `const clientId = "native-XXXXXXXXXXXXXXXXXXX";`
- Remove the `assert` on the next line that verifies the Client ID is set
- `npm install`
- `npm run build`

## Run

- `npm run start`

The app will open a pre-packaged offline snapshot iModel. You will likely want to use your own snapshot iModel. Follow the [Create a snapshot iModel]($docs/learning/tutorials/create-test-imodel-offline) tutorial. Then open your snapshot by clicking the Home button and selecting "Open Offline Snapshot". Alternatively, set the absolute path of your snapshot in .env.local prior to running `npm run start`.

Desktop apps can also open cloud hosted iModels. If you do not have access to one, follow one of our tutorials to [create an online iModel]($docs/learning/tutorials/index.md). Then open your online iModel by selecting "Open Online iModel" and logging in. Alternatively, the Context and iModel guids can be set in .env.local prior to running `npm run start`.
