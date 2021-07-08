/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cspell:words buddi urlps

import { Config, GuidString } from "@bentley/bentleyjs-core";
import { ElectronAuthorizationBackend } from "@bentley/electron-manager/lib/ElectronBackend";
import { Version } from "@bentley/imodelhub-client";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelHubBackend, NativeHost, RequestNewBriefcaseArg } from "@bentley/imodeljs-backend";
import { BriefcaseIdValue, ChangesetId, ChangesetIndex, ChangesetProps } from "@bentley/imodeljs-common";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";

export namespace IModelHubUtils {

  export async function getAuthorizedClientRequestContext(): Promise<AuthorizedClientRequestContext> {
    const accessToken = await signIn();
    return new AuthorizedClientRequestContext(accessToken);
  }

  async function signIn(): Promise<AccessToken> {
    const client = new ElectronAuthorizationBackend();
    await client.initialize({
      clientId: "imodeljs-electron-test",
      redirectUri: "http://localhost:3000/signin-callback",
      scope: "openid email profile organization imodelhub context-registry-service:read-only reality-data:read product-settings-service projectwise-share urlps-third-party imodel-extension-service-api offline_access",
    });
    return new Promise<AccessToken>((resolve, reject) => {
      NativeHost.onUserStateChanged.addListener((token) => {
        if (token !== undefined) {
          resolve(token);
        } else {
          reject(new Error("Failed to sign in"));
        }
      });
      client.signIn().catch((error: Error) => reject(error));
    });
  }

  export function setHubEnvironment(arg?: string): void {
    let value = "0";
    if ("qa" === arg) {
      value = "102";
    } else if ("dev" === arg) {
      value = "103";
    }
    Config.App.set("imjs_buddi_resolve_url_using_region", value);
  }

  export async function queryIModelId(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string): Promise<GuidString | undefined> {
    return IModelHost.hubAccess.queryIModelByName({ requestContext, contextId, iModelName });
  }

  /** Temporarily needed to convert from the now preferred ChangesetIndex to the legacy ChangesetId.
   * @note This function should be removed when full support for ChangesetIndex is in place.
   */
  export async function queryChangesetId(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changesetIndex: ChangesetIndex): Promise<ChangesetId> {
    return (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId, changeset: { index: changesetIndex } })).id;
  }

  /** Temporarily needed to convert from the legacy ChangesetId to the now preferred ChangeSetIndex.
   * @note This function should be removed when full support for ChangesetIndex is in place.
   */
  export async function queryChangesetIndex(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changesetId: ChangesetId): Promise<ChangesetIndex> {
    return (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId, changeset: { id: changesetId } })).index;
  }

  /** Call the specified function for each changeset of the specified iModel. */
  export async function forEachChangeset(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, func: (c: ChangesetProps) => void): Promise<void> {
    const changesets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId });
    for (const changeset of changesets) {
      func(changeset);
    }
  }

  /** Call the specified function for each (named) Version of the specified iModel. */
  export async function forEachNamedVersion(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, func: (v: Version) => void): Promise<void> {
    const namedVersions = await IModelHubBackend.iModelClient.versions.get(requestContext, iModelId);
    for (const namedVersion of namedVersions) {
      func(namedVersion);
    }
  }

  export async function downloadAndOpenBriefcase(requestContext: AuthorizedClientRequestContext, briefcaseArg: RequestNewBriefcaseArg): Promise<BriefcaseDb> {
    const briefcaseProps = await BriefcaseManager.downloadBriefcase(requestContext, briefcaseArg);
    return BriefcaseDb.open(requestContext, {
      fileName: briefcaseProps.fileName,
      readonly: briefcaseArg.briefcaseId ? briefcaseArg.briefcaseId === BriefcaseIdValue.Unassigned : false,
    });
  }
}
