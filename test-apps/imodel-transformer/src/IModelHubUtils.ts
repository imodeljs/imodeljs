/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cspell:words buddi urlps

import { assert, Config, GuidString } from "@bentley/bentleyjs-core";
import { ElectronAuthorizationBackend } from "@bentley/electron-manager/lib/ElectronBackend";
import { BriefcaseQuery, Version } from "@bentley/imodelhub-client";
import {
  BriefcaseDb, BriefcaseManager, ChangesetProps, IModelHost, IModelHubBackend, IModelJsFs, NativeHost, RequestNewBriefcaseArg,
} from "@bentley/imodeljs-backend";
import { BriefcaseIdValue, IModelVersion } from "@bentley/imodeljs-common";
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

  /** Call the specified function for each changeSet of the specified iModel. */
  export async function forEachChangeSet(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, func: (c: ChangesetProps) => void): Promise<void> {
    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId });
    for (const changeSet of changeSets) {
      func(changeSet);
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
    let briefcaseQuery = new BriefcaseQuery().ownedByMe();
    if (briefcaseArg.briefcaseId) {
      briefcaseQuery = briefcaseQuery.filter(`BriefcaseId+eq+${briefcaseArg.briefcaseId}`);
    }
    const briefcases = await IModelHubBackend.iModelClient.briefcases.get(requestContext, briefcaseArg.iModelId, briefcaseQuery);
    if (0 === briefcases.length) {
      const briefcaseProps = await BriefcaseManager.downloadBriefcase(requestContext, briefcaseArg);
      return BriefcaseDb.open(requestContext, {
        fileName: briefcaseProps.fileName,
        readonly: briefcaseArg.briefcaseId ? briefcaseArg.briefcaseId === BriefcaseIdValue.Unassigned : false,
      });
    }

    let briefcaseFileName: string | undefined;
    for (const briefcase of briefcases) {
      assert(briefcase.briefcaseId !== undefined);
      briefcaseFileName = BriefcaseManager.getFileName({
        iModelId: briefcaseArg.iModelId,
        briefcaseId: briefcase.briefcaseId,
      });
      if (IModelJsFs.existsSync(briefcaseFileName)) {
        break;
      }
    }

    if (undefined === briefcaseFileName) {
      throw new Error();
    }

    const briefcaseDb = await BriefcaseDb.open(requestContext, {
      fileName: briefcaseFileName,
      readonly: briefcaseArg.briefcaseId ? briefcaseArg.briefcaseId === BriefcaseIdValue.Unassigned : undefined,
    });
    const asOf = briefcaseArg.asOf?.afterChangeSetId ? IModelVersion.asOfChangeSet(briefcaseArg.asOf.afterChangeSetId) : IModelVersion.latest();
    await briefcaseDb.pullAndMergeChanges(requestContext, asOf);
    return briefcaseDb;
  }
}
