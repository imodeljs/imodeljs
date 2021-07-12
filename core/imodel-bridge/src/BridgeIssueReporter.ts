/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Generic issue reporter
 * @beta
 */
export interface BridgeIssueReporter {
  recordIgnoredElements: (repositoryLinkId: string, ignoredElementIdList: string) => void;
  reportIssue: (ecInstanceId: string, sourceId: string, level: string, category: string, message: string, type: string) => void;
  recordSourceFileInfo: (srcId: string, name: string, uniqueName: string, itemType: string, dataSource: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByBridge: boolean, downloadUrl?: string) => void;
  recordReferenceFileInfo: (srcId: string, name: string, uniqueName: string, itemType: string, dataSource: string, downloadUrl: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByBridge: boolean) => void;
  publishReport: () => void;
}