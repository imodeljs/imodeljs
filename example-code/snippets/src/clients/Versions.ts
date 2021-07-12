/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { ChangeSet, IModelHubClient, Version, VersionQuery } from "@bentley/imodelhub-client";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";

class MockAccessToken extends AccessToken {
  public constructor() { super(""); }
  public override toTokenString() { return ""; }
}

const imodelHubClient: IModelHubClient = new IModelHubClient();
const accessToken: AccessToken = new MockAccessToken();
const authorizedRequestContext = new AuthorizedClientRequestContext(accessToken, "b0f0808d-e76f-4615-acf4-95aa1b78eba5");
const imodelId: GuidString = Guid.createValue();

// enclosing function avoids compile errors and code analysis report.
export async function test1() {
  // __PUBLISH_EXTRACT_START__ VersionHandler.create.example-code
  // Query all ChangeSets
  const changeSets: ChangeSet[] = await imodelHubClient.changeSets.get(authorizedRequestContext, imodelId);
  // Select one of the resulting ChangeSets
  const changeSetId: string = changeSets[0].id!;
  // Create a Named Version for that ChangeSet
  const createdVersion: Version = await imodelHubClient.versions.create(authorizedRequestContext, imodelId, changeSetId, "Version name", "Version description");
  // __PUBLISH_EXTRACT_END__
  if (!createdVersion)
    return;
}

// enclosing function avoids compile errors and code analysis report.
export async function test2() {
  // __PUBLISH_EXTRACT_START__ VersionHandler.get.example-code
  // Query all Named Versions
  const allVersions: Version[] = await imodelHubClient.versions.get(authorizedRequestContext, imodelId);
  // Query a single Named Version by its name
  const queryByName: VersionQuery = new VersionQuery().byName("Version name");
  const versionByName: Version[] = await imodelHubClient.versions.get(authorizedRequestContext, imodelId, queryByName);
  // __PUBLISH_EXTRACT_END__

  if (!allVersions || !versionByName)
    return;
}
