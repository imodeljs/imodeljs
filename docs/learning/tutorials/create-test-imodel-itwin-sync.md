# Getting started with iTwin.js using your own data via the Free Trial service

This tutorial will describe steps to get started with iTwin.js, using the free trial test environment. We will outline creating a Bentley user account, creating a starter iModel, then loading the starter iModel with data from source files on your desktop. At the end of the tutorial, you should have an iModel containing your own data that you will be able to view either on the web, with in a localhost web application, or with a local Electron app.

You should have a basic understanding of [iModels]($docs/learning/imodels.md), [iModelHub]($docs/learning/imodelhub/index.md), [iModel Connectors]($docs/learning/imodel-connectors.md), but don't worry if any of those concepts aren't entirely clear.

## Create iModel

Before you create an iModel, you must first have an iTwin project that will contain the iModel. The "[Create sample iModel](https://developer.bentley.com/create-imodel/)" page provides a way for users to create an iModel for development testing purposes.

- Go to the "[Create sample iModel](https://developer.bentley.com/create-imodel/)" page
- Give your test iModel a name
- Select the iTwin Synchronizer option
  - Add the email addresses of anyone else you would like to grant access to the iModel
  - Any other users will also have to have a Bentley account
- Click Submit

A iTwin project containing an empty iModel will be created for you.

## Download iTwin synchronizer

Download and familiarize yourself with the [iTwin Synchronizer](https://www.bentley.com/en/Products/Product-Line/Digital-Twins/iTwin-Synchronizer), a free tool for synchronizing data in CAD/BIM files on your desktop and an iModel.

## Run iTwin synchronizer

Review the [documentation for iTwin Synchronizer](https://docs.bentley.com/LiveContent/web/iModel%20Bridge%20Administrator-v1/en/GUID-FD43F789-A531-4315-AD77-BFF1CCAC6F1C.html) and follow the instructions.

- [Create a job definition](https://docs.bentley.com/LiveContent/web/iModel%20Bridge%20Administrator-v1/en/GUID-1893788F-6EBC-4855-8D5E-962A8D76F733.html)
  - Select the newly created test iModel
- [Synchronize changes](https://docs.bentley.com/LiveContent/web/iModel%20Bridge%20Administrator-v1/en/GUID-71AA981F-27A5-411F-A7E1-071326FF9283.html)
- Create a Named Version

Creating a named version is required to view the iModel on iModelHub.

## Modify and synchronize

Edit one of the source files with its native design tool, save, and sync the changes with iModelHub using the iTwin Synchronizer. Review the evolving timeline of the iModel. When you get to a point you want others to see, create a new Named Version.

Build and run the [query-agent](https://github.com/imodeljs/imodeljs-samples/tree/master/agent-app/query-agent) which will listen to changesets pushed to iModelHub. Pull the changeset information, and parse useful details contained in them. Take a specific action if the changeset meets certain criteria.

---

<br/>
<br/>

> _Note: Test iModels should not be used to host sensitive data. The uploaded data is administered by Bentley and should only be used for the purpose of testing. It is not subject to the same data privacy, security policies, and access controls that apply to Bentley’s iTwin offerings. It is subject to data size and other usage limitations, and will be purged after 90 days, if not renewed._ _If you need help or have questions, please contact us on [Github](https://github.com/imodeljs/imodeljs/issues)._

<style>
    a#getting-started---explore-imodel {
        display: none;
    }
</style>
