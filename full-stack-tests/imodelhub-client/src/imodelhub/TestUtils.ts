/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";
import { Base64 } from "js-base64";
import * as path from "path";
import { ClientRequestContext, Config, Guid, GuidString, Id64, Id64String, Logger, WSStatus } from "@bentley/bentleyjs-core";
import { Asset, Project } from "@bentley/context-registry-client";
import {
  Briefcase, BriefcaseQuery, ChangeSet, ChangeSetQuery, CodeState, HubCode, IModelBankClient, IModelBankFileSystemContextClient,
  IModelCloudEnvironment, IModelHubClient, IModelQuery, LargeThumbnail, Lock, LockLevel, LockType, MultiCode, MultiLock, SmallThumbnail, Thumbnail,
  Version, VersionQuery,
} from "@bentley/imodelhub-client";
import { AccessToken, AuthorizedClientRequestContext, ECJsonTypeMap, ProgressInfo, UserInfo, WsgError } from "@bentley/itwin-client";
import { TestUserCredentials } from "@bentley/oidc-signin-tool";
import { RequestType, ResponseBuilder, ScopeType } from "../ResponseBuilder";
import { TestConfig } from "../TestConfig";
import { getIModelBankCloudEnv } from "./IModelBankCloudEnv";
import { TestIModelHubCloudEnv } from "./IModelHubCloudEnv";
import { assetsPath } from "./TestConstants";
import { createFileHandler } from "./FileHandler";
import { HttpRequestHost } from "@bentley/backend-itwin-client";

const loggingCategory = "backend-itwin-client.TestUtils";

const bankProjects: string[] = [];

export const sharedimodelName = "imodeljs-clients Shared iModel";

let testInstanceId: GuidString;
function getTestInstanceId(): GuidString {
  if (!testInstanceId)
    testInstanceId = Guid.createValue();
  return testInstanceId;
}

function configMockSettings() {
  if (!TestConfig.enableMocks)
    return;

  Config.App.set("imjs_imodelhub_url", "https://api.bentley.com/imodelhub");
  Config.App.set("imjs_rbac_url", "https://api.bentley.com/rbac");
  Config.App.set("imjs_buddi_resolve_url_using_region", 0);
  Config.App.set("imjs_url_prefix", "");
  Config.App.set("imjs_test_serviceAccount1_user_name", "test");
  Config.App.set("imjs_test_serviceAccount1_user_password", "test");
  Config.App.set("imjs_test_manager_user_name", "test");
  Config.App.set("imjs_test_manager_user_password", "test");
}

export function getExpectedFileHandlerUrlSchemes(): string[] {
  const handler = Config.App.getString("imjs_test_imodel_bank_file_handler", "url");
  switch (handler.toLowerCase()) {
    case "localhost":
      return ["file://"];
    default:
      return ["https://", "http://"];
  }
}

export function expectMatchesExpectedUrlScheme(url?: string): void {
  chai.expect(url).to.not.undefined;

  const expectedSchemes = getExpectedFileHandlerUrlSchemes();
  for (const scheme of expectedSchemes)
    if (url!.startsWith(scheme))
      return;

  chai.assert.fail(`${url} doesn't use any of the schemes [${expectedSchemes.join(", ")}]`);
}

export function removeFileUrlExpirationTimes(changesets: ChangeSet[]) {
  for (const cs of changesets) {
    cs.downloadUrl = removeFileUrlExpirationTime(cs.downloadUrl);
    cs.uploadUrl = removeFileUrlExpirationTime(cs.uploadUrl);
  }
  return changesets;
}

function removeFileUrlExpirationTime(url?: string) {
  if (!url)
    return url;
  if (url.toLowerCase().startsWith("http")) {
    const index = url.indexOf("?");
    if (index > 0)
      return url.substring(0, index);
  }
  return url;
}

/** Other services */
export class MockAccessToken extends AccessToken {
  public constructor() {
    super("");
  }

  public override getUserInfo(): UserInfo | undefined {
    const id = "596c0d8b-eac2-46a0-aa4a-b590c3314e7c";
    const email = { id: "testuser001@mailinator.com" };
    const profile = { firstName: "test", lastName: "user" };
    const organization = { id: "fefac5b-bcad-488b-aed2-df27bffe5786", name: "Bentley" };
    const featureTracking = { ultimateSite: "1004144426", usageCountryIso: "US" };
    return new UserInfo(id, email, profile, organization, featureTracking);
  }

  public override toTokenString() { return ""; }
}

export type RequestBehaviorOptionsList =
  "DoNotScheduleRenderThumbnailJob" |
  "DisableGlobalEvents" |
  "DisableNotifications";

export class RequestBehaviorOptions {
  private _currentOptions: RequestBehaviorOptionsList[] = this.getDefaultOptions();

  private getDefaultOptions(): RequestBehaviorOptionsList[] {
    return ["DoNotScheduleRenderThumbnailJob", "DisableGlobalEvents", "DisableNotifications"];
  }

  public resetDefaultBehaviorOptions(): void {
    this._currentOptions = this.getDefaultOptions();
  }

  public enableBehaviorOption(option: RequestBehaviorOptionsList) {
    if (!this._currentOptions.find((el) => el === option)) {
      this._currentOptions.push(option);
    }
  }
  public disableBehaviorOption(option: RequestBehaviorOptionsList) {
    const foundIdx: number = this._currentOptions.findIndex((el) => el === option);
    if (-1 < foundIdx) {
      this._currentOptions.splice(foundIdx, 1);
    }
  }

  public toCustomRequestOptions(): { [index: string]: string } {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return { BehaviourOptions: this._currentOptions.join(",") };
  }
}

const requestBehaviorOptions = new RequestBehaviorOptions();

let imodelHubClient: IModelHubClient;
export function getIModelHubClient() {
  if (imodelHubClient !== undefined)
    return imodelHubClient;
  imodelHubClient = new IModelHubClient(createFileHandler());
  if (!TestConfig.enableMocks) {
    imodelHubClient.requestOptions.setCustomOptions(requestBehaviorOptions.toCustomRequestOptions());
  }
  return imodelHubClient;
}

let imodelBankClient: IModelBankClient;

export class IModelHubUrlMock {
  public static getUrl(): string {
    configMockSettings();
    return Config.App.get("imjs_imodelhub_url", "");
  }
}

export class RbacUrlMock {
  public static getUrl(): string {
    configMockSettings();
    return Config.App.get("imjs_rbac_url", "");
  }
}

export function getDefaultClient() {
  return getCloudEnv().isIModelHub ? getIModelHubClient() : imodelBankClient;
}

export function getRequestBehaviorOptionsHandler(): RequestBehaviorOptions {
  return requestBehaviorOptions;
}

/**
 * Generates request URL.
 * @param scope Specifies scope.
 * @param id Specifies scope id.
 * @param className Class name that request is sent to.
 * @param query Request query.
 * @returns Created URL.
 */
export function createRequestUrl(scope: ScopeType, id: string | GuidString, className: string, query?: string): string {
  let requestUrl: string = "/sv1.1/Repositories/";

  switch (scope) {
    case ScopeType.iModel:
      requestUrl += `iModel--${id}/iModelScope/`;
      break;
    case ScopeType.Context:
      requestUrl += `Context--${id}/ContextScope/`;
      break;
    case ScopeType.Global:
      requestUrl += "Global--Global/GlobalScope/";
      break;
  }

  requestUrl += `${className}/`;
  if (query !== undefined) {
    requestUrl += query;
  }

  return requestUrl;
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login(userCredentials?: TestUserCredentials): Promise<AccessToken> {
  if (TestConfig.enableMocks)
    return new MockAccessToken();
  const authorizationClient = getCloudEnv().getAuthorizationClient(undefined, userCredentials);
  const requestContext = new ClientRequestContext();

  await authorizationClient.signIn(requestContext);
  return authorizationClient.getAccessToken(requestContext);
}

export async function bootstrapBankProject(requestContext: AuthorizedClientRequestContext, projectName: string): Promise<void> {
  if (getCloudEnv().isIModelHub || bankProjects.includes(projectName))
    return;

  const bankContext = getCloudEnv().contextMgr as IModelBankFileSystemContextClient;
  let project: Project | undefined;
  try {
    project = await bankContext.queryProjectByName(requestContext, projectName);
  } catch (err) {
    if (err instanceof WsgError && err.errorNumber === WSStatus.InstanceNotFound) {
      project = undefined;
    } else {
      throw err;
    }
  }
  if (!project)
    await bankContext.createContext(requestContext, projectName);

  bankProjects.push(projectName);
}

export async function getAssetId(requestContext: AuthorizedClientRequestContext, assetName?: string): Promise<string> {
  if (TestConfig.enableMocks)
    return Guid.createValue();

  assetName = assetName || TestConfig.assetName;

  await bootstrapBankProject(requestContext, assetName);

  const asset: Asset = await getCloudEnv().contextMgr.queryAssetByName(requestContext, assetName);

  if (!asset || !asset.wsgId)
    throw new Error(`Asset with name ${assetName} doesn't exist.`);

  return asset.wsgId;
}

export async function getProjectId(requestContext: AuthorizedClientRequestContext, projectName?: string): Promise<string> {
  if (TestConfig.enableMocks)
    return Guid.createValue();

  projectName = projectName || TestConfig.projectName;

  await bootstrapBankProject(requestContext, projectName);

  const project: Project = await getCloudEnv().contextMgr.queryProjectByName(requestContext, projectName);

  if (!project || !project.wsgId)
    throw new Error(`Project with name ${TestConfig.projectName} doesn't exist.`);

  return project.wsgId;
}

/** iModels */

// Unique imodel name is used so that multiple instances of this test suite can run in parallel
export function getUniqueIModelName(imodelName: string): string {
  return `${imodelName} - ${getTestInstanceId()}`;
}

export async function deleteIModelByName(requestContext: AuthorizedClientRequestContext, contextId: string, imodelName: string, useUniqueName = true): Promise<void> {
  if (TestConfig.enableMocks)
    return;

  if (useUniqueName)
    imodelName = getUniqueIModelName(imodelName);

  const client = getDefaultClient();
  const imodels = await client.iModels.get(requestContext, contextId, new IModelQuery().byName(imodelName));

  for (const imodel of imodels) {
    await client.iModels.delete(requestContext, contextId, imodel.id!);
  }
}

export async function getIModelId(requestContext: AuthorizedClientRequestContext, imodelName: string, projectId?: string, useUniqueName = true): Promise<GuidString> {
  if (TestConfig.enableMocks)
    return Guid.createValue();

  if (useUniqueName)
    imodelName = getUniqueIModelName(imodelName);

  projectId = projectId ?? await getProjectId(requestContext);

  const client = getDefaultClient();
  const imodels = await client.iModels.get(requestContext, projectId, new IModelQuery().byName(imodelName));

  if (!imodels[0] || !imodels[0].id)
    throw new Error(`iModel with name ${imodelName} doesn't exist.`);

  return imodels[0].id;
}

export function mockFileResponse(times = 1) {
  if (TestConfig.enableMocks)
    ResponseBuilder.mockFileResponse("https://imodelhubqasa01.blob.core.windows.net", "/imodelhubfile", getMockSeedFilePath(), times, getMockFileSize());
}

export function getMockFileSize(): string {
  return fs.statSync(getMockSeedFilePath()).size.toString();
}

export function mockUploadFile(imodelId: GuidString, chunks = 1) {
  for (let i = 0; i < chunks; ++i) {
    const blockId = Base64.encode(i.toString(16).padStart(5, "0"));
    ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Put, `/imodelhub-${imodelId}/123456&comp=block&blockid=${blockId}`);
  }
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Put, `/imodelhub-${imodelId}/123456&comp=blocklist`);
}

/** Briefcases */
export async function getBriefcases(requestContext: AuthorizedClientRequestContext, imodelId: GuidString, count: number): Promise<Briefcase[]> {
  if (TestConfig.enableMocks) {
    let briefcaseId = 2;
    const fileId: GuidString = Guid.createValue();
    return Array(count).fill(0).map(() => {
      const briefcase = new Briefcase();
      briefcase.briefcaseId = briefcaseId++;
      briefcase.fileId = fileId;
      return briefcase;
    });
  }

  const client = getDefaultClient();
  let briefcases = await client.briefcases.get(requestContext, imodelId, new BriefcaseQuery().ownedByMe());
  if (briefcases.length < count) {
    for (let i = 0; i < count - briefcases.length; ++i) {
      await client.briefcases.create(requestContext, imodelId);
    }
    briefcases = await client.briefcases.get(requestContext, imodelId, new BriefcaseQuery().ownedByMe());
  }
  return briefcases;
}

export function generateBriefcase(id: number): Briefcase {
  const briefcase = new Briefcase();
  briefcase.briefcaseId = id;
  briefcase.wsgId = id.toString();
  return briefcase;
}

export function mockGetBriefcase(imodelId: GuidString, ...briefcases: Briefcase[]) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Briefcase");
  const requestResponse = ResponseBuilder.generateGetArrayResponse<Briefcase>(briefcases);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

export function mockCreateBriefcase(imodelId: GuidString, id?: number, briefcase: Briefcase = ResponseBuilder.generateObject<Briefcase>(Briefcase)) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Briefcase");
  const postBody = ResponseBuilder.generatePostBody<Briefcase>(briefcase);

  if (id !== undefined) {
    briefcase.briefcaseId = id;
    briefcase.wsgId = id.toString();
  }
  const requestResponse = ResponseBuilder.generatePostResponse<Briefcase>(briefcase);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

export function mockDeleteAllLocks(imodelId: GuidString, briefcaseId: number) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Lock", `DeleteChunk-${briefcaseId}`);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Delete, requestPath, undefined, 1, undefined, undefined, 200);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Delete, requestPath, ResponseBuilder.generateError("iModelHub.LockChunkDoesNotExist"), 1, undefined, undefined, 404);
}

/** ChangeSets */
export function generateChangeSetId(): string {
  let result = "";
  for (let i = 0; i < 20; ++i) {
    result += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return result;
}

export function generateChangeSet(id?: string): ChangeSet {
  const changeSet = new ChangeSet();
  id = id || generateChangeSetId();
  changeSet.fileName = `${id}.cs`;
  changeSet.wsgId = id;
  return changeSet;
}

export function mockGetChangeSet(imodelId: GuidString, getDownloadUrl: boolean, query?: string, ...changeSets: ChangeSet[]) {
  mockGetChangeSetChunk(imodelId, getDownloadUrl, query, undefined, ...changeSets);
}

export function mockGetChangeSetChunk(imodelId: GuidString, getDownloadUrl: boolean, query?: string, headers?: any, ...changeSets: ChangeSet[]) {
  if (!TestConfig.enableMocks)
    return;

  let i = 1;
  changeSets.forEach((value) => {
    value.wsgId = value.id!;
    value.fileSize = getMockFileSize();
    if (getDownloadUrl) {
      value.downloadUrl = "https://imodelhubqasa01.blob.core.windows.net/imodelhubfile";
    }
    if (!value.index) {
      value.index = `${i++}`;
    }
  });
  if (!query)
    query = "";
  const requestPath = createRequestUrl(ScopeType.iModel, imodelId.toString(), "ChangeSet",
    getDownloadUrl ? `?$select=*,FileAccessKey-forward-AccessKey.DownloadURL${query}` : query);
  const requestResponse = ResponseBuilder.generateGetArrayResponse<ChangeSet>(changeSets);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse, undefined, undefined, headers);
}

/** Codes */
export function randomCodeValue(prefix: string): string {
  return (prefix + Math.floor(Math.random() * Math.pow(2, 30)).toString());
}

export function randomCode(briefcase: number): HubCode {
  const code = new HubCode();
  code.briefcaseId = briefcase;
  code.codeScope = "TestScope";
  code.codeSpecId = Id64.fromString("0XA");
  code.state = CodeState.Reserved;
  code.value = randomCodeValue("TestCode");
  return code;
}

function convertCodesToMultiCodes(codes: HubCode[]): MultiCode[] {
  const map = new Map<string, MultiCode>();
  for (const code of codes) {
    const id: string = `${code.codeScope}-${code.codeSpecId}-${code.state}`;

    if (map.has(id)) {
      map.get(id)!.values!.push(code.value!);
    } else {
      const multiCode = new MultiCode();
      multiCode.changeState = "new";
      multiCode.briefcaseId = code.briefcaseId;
      multiCode.codeScope = code.codeScope;
      multiCode.codeSpecId = code.codeSpecId;
      multiCode.state = code.state;
      multiCode.values = [code.value!];
      map.set(id, multiCode);
    }
  }
  return Array.from(map.values());
}

export function mockGetCodes(imodelId: GuidString, query?: string, ...codes: HubCode[]) {
  if (!TestConfig.enableMocks)
    return;

  if (query === undefined) {
    const requestResponse = ResponseBuilder.generateGetArrayResponse<HubCode>(codes);
    const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Code", "$query");
    ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse);
  } else {
    const requestResponse = ResponseBuilder.generateGetArrayResponse<MultiCode>(convertCodesToMultiCodes(codes));
    const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "MultiCode", query);
    ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
  }
}

export function mockUpdateCodes(imodelId: GuidString, ...codes: HubCode[]) {
  // assumes all have same scope / specId
  if (!TestConfig.enableMocks)
    return;

  const multicodes = convertCodesToMultiCodes(codes);
  const requestPath = `/sv1.1/Repositories/iModel--${imodelId}/$changeset`;
  const requestResponse = ResponseBuilder.generateChangesetResponse<MultiCode>(multicodes);
  const postBody = ResponseBuilder.generateChangesetBody<MultiCode>(multicodes);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

export function mockDeniedCodes(imodelId: GuidString, requestOptions?: object, ...codes: HubCode[]) {
  // assumes all have same scope / specId
  if (!TestConfig.enableMocks)
    return;

  const multicodes = convertCodesToMultiCodes(codes);

  const requestPath = `/sv1.1/Repositories/iModel--${imodelId}/$changeset`;
  const requestResponse = ResponseBuilder.generateError("iModelHub.CodeReservedByAnotherBriefcase", "", "",
    new Map<string, any>([
      ["ConflictingCodes", JSON.stringify(codes.map((value) => {
        const obj = ECJsonTypeMap.toJson<HubCode>("wsg", value);
        return obj.properties;
      }))],
    ]));
  const postBody = ResponseBuilder.generateChangesetBody<MultiCode>(multicodes, requestOptions);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody, undefined, 409);
}

export function mockDeleteAllCodes(imodelId: GuidString, briefcaseId: number) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Code", `DiscardReservedCodes-${briefcaseId}`);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Delete, requestPath, {});
}

/** Locks */
export function incrementLockObjectId(objectId: Id64String): Id64String {
  let low = Id64.getLowerUint32(objectId) + 1;
  let high = Id64.getUpperUint32(objectId);
  if (low === 0xFFFFFFFF) {
    low = 0;
    high = high + 1;
  }
  return Id64.fromUint32Pair(low, high);
}

export async function getLastLockObjectId(requestContext: AuthorizedClientRequestContext, imodelId: GuidString): Promise<Id64String> {
  if (TestConfig.enableMocks)
    return Id64.fromString("0x0");

  const client = getDefaultClient();
  const locks = await client.locks.get(requestContext, imodelId);

  locks.sort((lock1, lock2) => (parseInt(lock1.objectId!.toString(), 16) > parseInt(lock2.objectId!.toString(), 16) ? -1 : 1));

  return (locks.length === 0 || locks[0].objectId === undefined) ? Id64.fromString("0x0") : locks[0].objectId;
}

export function generateLock(briefcaseId?: number, objectId?: Id64String,
  lockType?: LockType, lockLevel?: LockLevel, _seedFileId?: GuidString,
  releasedWithChangeSet?: string, releasedWithChangeSetIndex?: string): Lock {
  const result = new Lock();
  result.briefcaseId = briefcaseId || 1;
  result.objectId = Id64.fromJSON(objectId || "0x0");
  result.lockLevel = lockLevel || 1;
  result.lockType = lockType || 1;
  result.releasedWithChangeSet = releasedWithChangeSet;
  result.releasedWithChangeSetIndex = releasedWithChangeSetIndex;
  return result;
}

function convertLocksToMultiLocks(locks: Lock[]): MultiLock[] {
  const map = new Map<string, MultiLock>();
  for (const lock of locks) {
    const id: string = `${lock.briefcaseId}-${lock.lockType}-${lock.lockLevel}`;

    if (map.has(id)) {
      map.get(id)!.objectIds!.push(lock.objectId!);
    } else {
      const multiLock = new MultiLock();
      multiLock.changeState = "new";
      multiLock.briefcaseId = lock.briefcaseId;
      multiLock.releasedWithChangeSet = lock.releasedWithChangeSet;
      multiLock.releasedWithChangeSetIndex = lock.releasedWithChangeSetIndex;
      multiLock.lockLevel = lock.lockLevel;
      multiLock.lockType = lock.lockType;
      multiLock.objectIds = [lock.objectId!];
      map.set(id, multiLock);
    }
  }
  return Array.from(map.values());
}

export function mockGetLocks(imodelId: GuidString, query?: string, ...locks: Lock[]) {
  if (!TestConfig.enableMocks)
    return;

  if (query === undefined) {
    const requestResponse = ResponseBuilder.generateGetArrayResponse<Lock>(locks);
    const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "Lock", "$query");
    ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse);
  } else {
    const requestResponse = ResponseBuilder.generateGetArrayResponse<MultiLock>(convertLocksToMultiLocks(locks));
    const requestPath = createRequestUrl(ScopeType.iModel, imodelId, "MultiLock", query);
    ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
  }
}

export function mockUpdateLocks(imodelId: GuidString, locks: Lock[], requestOptions?: object) {
  if (!TestConfig.enableMocks)
    return;

  const multilocks = convertLocksToMultiLocks(locks);
  const requestPath = `/sv1.1/Repositories/iModel--${imodelId}/$changeset`;
  const requestResponse = ResponseBuilder.generateChangesetResponse<MultiLock>(multilocks);
  const postBody = ResponseBuilder.generateChangesetBody<MultiLock>(multilocks, requestOptions);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

export function mockDeniedLocks(imodelId: GuidString, locks: Lock[], requestOptions?: object) {
  if (!TestConfig.enableMocks)
    return;

  const multilocks = convertLocksToMultiLocks(locks);

  const requestPath = `/sv1.1/Repositories/iModel--${imodelId}/$changeset`;
  const requestResponse = ResponseBuilder.generateError("iModelHub.LockOwnedByAnotherBriefcase", "", "",
    new Map<string, any>([
      ["ConflictingLocks", JSON.stringify(locks.map((value) => {
        const obj = ECJsonTypeMap.toJson<Lock>("wsg", value);
        return obj.properties;
      }))],
    ]));
  const postBody = ResponseBuilder.generateChangesetBody<MultiLock>(multilocks, requestOptions);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody, undefined, 409);
}

/** Named versions */
export function generateVersion(name?: string, changesetId?: string, addInstanceId: boolean = true, smallThumbnailId?: GuidString, largeThumbnailId?: GuidString, hidden?: boolean): Version {
  const result = new Version();
  if (addInstanceId) {
    result.id = Guid.createValue();
    result.wsgId = result.id;
  }
  result.changeSetId = changesetId === undefined || changesetId === null ? generateChangeSetId() : changesetId;
  result.name = name || `TestVersion-${result.changeSetId}`;
  // eslint-disable-next-line deprecation/deprecation
  result.smallThumbnailId = smallThumbnailId;
  // eslint-disable-next-line deprecation/deprecation
  result.largeThumbnailId = largeThumbnailId;
  result.hidden = hidden;
  return result;
}

export function mockGetVersions(imodelId: GuidString, query?: string, ...versions: Version[]) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId.toString(), "Version", query);
  const requestResponse = ResponseBuilder.generateGetArrayResponse<Version>(versions);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

export function mockGetVersionById(imodelId: GuidString, version: Version) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId.toString(), "Version", version.wsgId);
  const requestResponse = ResponseBuilder.generateGetResponse<Version>(version);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

export function mockCreateVersion(imodelId: GuidString, name?: string, changesetId?: string) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId.toString(), "Version");
  const postBodyObject: Partial<Version> = generateVersion(name, changesetId, false);
  delete (postBodyObject.wsgId);
  const postBody = ResponseBuilder.generatePostBody<Version>(postBodyObject as Version);
  const requestResponse = ResponseBuilder.generatePostResponse<Version>(generateVersion(name, changesetId, true));
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

export function mockUpdateVersion(imodelId: GuidString, version: Version) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId.toString(), "Version", version.wsgId);
  const postBody = ResponseBuilder.generatePostBody<Version>(version);
  const requestResponse = ResponseBuilder.generatePostResponse<Version>(version);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Post, requestPath, requestResponse, 1, postBody);
}

/** Thumbnails */
export function generateThumbnail(size: "Small" | "Large"): Thumbnail {
  const result = size === "Small" ? new SmallThumbnail() : new LargeThumbnail();
  result.id = Guid.createValue();
  result.wsgId = result.id;
  return result;
}

function mockThumbnailResponse(requestPath: string, size: "Small" | "Large", ...thumbnails: Thumbnail[]) {
  const requestResponse = size === "Small" ?
    ResponseBuilder.generateGetArrayResponse<SmallThumbnail>(thumbnails) :
    ResponseBuilder.generateGetArrayResponse<LargeThumbnail>(thumbnails);
  ResponseBuilder.mockResponse(IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

export function mockGetThumbnails(imodelId: GuidString, size: "Small" | "Large", ...thumbnails: Thumbnail[]) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, `${size}Thumbnail`);
  mockThumbnailResponse(requestPath, size, ...thumbnails);
}

export function mockGetThumbnailById(imodelId: GuidString, size: "Small" | "Large", thumbnail: Thumbnail) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, `${size}Thumbnail`, thumbnail.wsgId);
  mockThumbnailResponse(requestPath, size, thumbnail);
}

export function mockGetThumbnailsByVersionId(imodelId: GuidString, size: "Small" | "Large", versionId: GuidString, ...thumbnails: Thumbnail[]) {
  if (!TestConfig.enableMocks)
    return;

  const requestPath = createRequestUrl(ScopeType.iModel, imodelId, `${size}Thumbnail`, `?$filter=HasThumbnail-backward-Version.Id+eq+%27${versionId}%27`);
  mockThumbnailResponse(requestPath, size, ...thumbnails);
}

/** Integration utilities */
export function getMockSeedFilePath() {
  const dir = path.join(assetsPath, "SeedFile");
  return path.join(dir, fs.readdirSync(dir).find((value) => value.endsWith(".bim"))!);
}

export async function createIModel(requestContext: AuthorizedClientRequestContext, name: string, contextId?: string, useUniqueName = true, deleteIfExists = false, fromSeedFile = false) {
  if (TestConfig.enableMocks)
    return;

  if (TestConfig.enableIModelBank)
    deleteIfExists = true;

  if (useUniqueName)
    name = getUniqueIModelName(name);

  contextId = contextId || await getProjectId(requestContext, TestConfig.projectName);

  const client = getDefaultClient();

  const imodels = await client.iModels.get(requestContext, contextId, new IModelQuery().byName(name));

  if (imodels.length > 0) {
    if (deleteIfExists) {
      await client.iModels.delete(requestContext, contextId, imodels[0].id!);
    } else {
      return;
    }
  }

  const pathName = fromSeedFile && !TestConfig.enableIModelBank ? getMockSeedFilePath() : undefined;
  return client.iModels.create(requestContext, contextId, name,
    { path: pathName, timeOutInMilliseconds: TestConfig.initializeiModelTimeout });
}

/**
 * Java style hash code function
 */
function hashCode(value: string) {
  let hash: number = 0;
  for (let i = 0; i < value.length; i++)
    hash = (((hash << 5) - hash) + value.charCodeAt(i)) | 0;

  return hash;
}

export function getMockChangeSets(briefcase: Briefcase): ChangeSet[] {
  const dir = path.join(assetsPath, "SeedFile");
  const files = fs.readdirSync(dir);
  let parentId = "";
  const matchingFileMap = new Map<number, RegExpMatchArray>();
  return files.filter((value) => {
    const fileMatch = value.match(/(^\d+)_([a-f0-9]{40})\.cs/);
    if (fileMatch)
      matchingFileMap.set(hashCode(value), fileMatch);
    return fileMatch;
  }).sort((left: string, right: string) => {
    const leftMatch = matchingFileMap.get(hashCode(left));
    const rightMatch = matchingFileMap.get(hashCode(right));

    const leftId = parseInt(leftMatch![1], 10);
    const rightId = parseInt(rightMatch![1], 10);
    return leftId - rightId;
  }).map((file) => {
    const result = new ChangeSet();
    const regexMatchValue = matchingFileMap.get(hashCode(file))!;
    result.id = regexMatchValue[2]; // second regex group contains ChangeSet id
    result.index = regexMatchValue[1]; // first regex group contains file index
    result.fileSize = fs.statSync(path.join(dir, file)).size.toString();
    result.briefcaseId = briefcase.briefcaseId;
    result.parentId = parentId;
    result.fileName = `${result.id}.cs`;
    parentId = result.id;
    return result;
  });
}

export function generateBridgeProperties(userCount: number, changedFileCount: number): BridgeProperties {
  const generatedBridgeProperties = new BridgeProperties();
  generatedBridgeProperties.jobId = Guid.createValue();
  if (userCount > 0) {
    generatedBridgeProperties.users = new Set();
    for (let i: number = 0; i < userCount; i++) {
      generatedBridgeProperties.users.add(`TestGeneratedUser_${i}`);
    }
  }
  if (changedFileCount > 0) {
    generatedBridgeProperties.changedFiles = new Set();
    for (let i: number = 0; i < changedFileCount; i++) {
      generatedBridgeProperties.changedFiles.add(`TestGeneratedChangedFile_${i}.ext`);
    }
  }

  return generatedBridgeProperties;
}

export function getMockChangeSetPath(index: number, changeSetId: string) {
  return path.join(assetsPath, "SeedFile", `${index}_${changeSetId}.cs`);
}

export async function createChangeSets(requestContext: AuthorizedClientRequestContext, imodelId: GuidString, briefcase: Briefcase,
  startingId = 0, count = 1, atLeastOneChangeSetWithBridgeProperties = false): Promise<ChangeSet[]> {
  if (TestConfig.enableMocks)
    return getMockChangeSets(briefcase).slice(startingId, startingId + count);

  const maxCount = 17;

  if (startingId + count > maxCount)
    throw Error(`Only have ${maxCount} changesets generated`);

  const client = getDefaultClient();

  let bridgePropertiesExist: boolean = false;
  const changeSetQuery: ChangeSetQuery = new ChangeSetQuery();
  if (atLeastOneChangeSetWithBridgeProperties)
    changeSetQuery.selectBridgeProperties();

  const existingChangeSets: ChangeSet[] = await client.changeSets.get(requestContext, imodelId, changeSetQuery);
  const result: ChangeSet[] = existingChangeSets.slice(startingId);

  if (atLeastOneChangeSetWithBridgeProperties && existingChangeSets.length >= startingId + count) {
    // Requested to generate at least one ChangeSet with bridge properties set.
    // No no new changesets will be generated if requested ChangeSet count (startingId + count) is less than already exists on the server.
    existingChangeSets.forEach((existingChangeset: ChangeSet) => {
      if (undefined !== existingChangeset.bridgeJobId) // need to check if iModel contains ChangeSets with bridge properties
        bridgePropertiesExist = true;
    });

    // Last check - if existing ChangeSets do not contain bridge properties check if it is possible to create additional ChangeSet.
    if (!bridgePropertiesExist && existingChangeSets.length + 1 > maxCount)
      throw Error(`Not enough prepared ChangeSets to create additional one with bridge properties.`);
    else if (!bridgePropertiesExist)
      count++; // Create an extra ChangeSet with generated bridge properties.
  }

  const changeSets = getMockChangeSets(briefcase);

  for (let i = existingChangeSets.length; i < startingId + count; ++i) {
    const changeSetPath = getMockChangeSetPath(i, changeSets[i].id!);
    if (atLeastOneChangeSetWithBridgeProperties) {
      const generatedBridgeProperties = generateBridgeProperties(i + 1, i * 2 + 1);
      changeSets[i].bridgeJobId = generatedBridgeProperties.jobId;
      changeSets[i].bridgeUsers = Array.from(generatedBridgeProperties.users!.values());
      changeSets[i].bridgeChangedFiles = Array.from(generatedBridgeProperties.changedFiles!.values());
      bridgePropertiesExist = true;
    }
    const changeSet = await client.changeSets.create(requestContext, imodelId, changeSets[i], changeSetPath);
    result.push(changeSet);
  }

  return result;
}

export async function createLocks(requestContext: AuthorizedClientRequestContext, imodelId: GuidString, briefcase: Briefcase, count = 1,
  lockType: LockType = 1, lockLevel: LockLevel = 1, releasedWithChangeSet?: string, releasedWithChangeSetIndex?: string) {
  if (TestConfig.enableMocks)
    return;

  const client = getDefaultClient();
  let lastObjectId: Id64String = await getLastLockObjectId(requestContext, imodelId);
  const generatedLocks: Lock[] = [];

  for (let i = 0; i < count; i++) {
    lastObjectId = incrementLockObjectId(lastObjectId);
    generatedLocks.push(generateLock(briefcase.briefcaseId,
      lastObjectId, lockType, lockLevel, briefcase.fileId,
      releasedWithChangeSet, releasedWithChangeSetIndex));
  }

  await client.locks.update(requestContext, imodelId, generatedLocks);
}

export async function createVersions(requestContext: AuthorizedClientRequestContext, imodelId: GuidString, changesetIds: string[], versionNames: string[]) {
  if (TestConfig.enableMocks)
    return;

  const client = getDefaultClient();
  for (let i = 0; i < changesetIds.length; i++) {
    // check if changeset does not have version
    const version = await client.versions.get(requestContext, imodelId, new VersionQuery().byChangeSet(changesetIds[i]));
    if (!version || version.length === 0) {
      await client.versions.create(requestContext, imodelId, changesetIds[i], versionNames[i]);
    }
  }
}

export class BridgeProperties {
  public jobId?: string;
  public users?: Set<string>;
  public changedFiles?: Set<string>;
}

export class ProgressTracker {
  private _loaded: number = 0;
  private _total: number = 0;
  private _count: number = 0;

  public track() {
    return (progress: ProgressInfo) => {
      this._loaded = progress.loaded;
      this._total = progress.total!;
      this._count++;
    };
  }

  public check(expectCalled: boolean = true) {
    if (expectCalled) {
      chai.expect(this._count).to.be.greaterThan(0);
      chai.expect(this._loaded).to.be.greaterThan(0);
      chai.expect(this._loaded).to.be.equal(this._total);
    } else {
      chai.expect(this._count).to.be.eq(0);
      chai.expect(this._loaded).to.be.eq(0);
      chai.expect(this._loaded).to.be.eq(0);
    }
  }
}

let cloudEnv: IModelCloudEnvironment | undefined;

// TRICKY! All of the "describe" functions are called first. Many of them call getCloudEnv,
//  but they don't try to use it.

export function getCloudEnv(): IModelCloudEnvironment {
  return cloudEnv!;
}

// TRICKY! After all describe functions are called, the following global before function is called
// before any test suite's before function is called. So, we do have a chance to wait for the
// iModel server to finish starting up.

before(async () => {
  await HttpRequestHost.initialize();

  if (!TestConfig.enableIModelBank || TestConfig.enableMocks) {
    cloudEnv = new TestIModelHubCloudEnv();
  } else {
    cloudEnv = getIModelBankCloudEnv();
    imodelBankClient = cloudEnv.imodelClient as IModelBankClient;
  }

  Logger.logInfo(loggingCategory, "Waiting for cloudEnv to startup...");
  await cloudEnv.startup();
  Logger.logInfo(loggingCategory, "cloudEnv started.");
});

after(async () => {
  if (cloudEnv !== undefined)
    await cloudEnv.shutdown();
});
