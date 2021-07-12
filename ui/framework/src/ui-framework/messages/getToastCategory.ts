/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import { MessageSeverity } from "@bentley/ui-core";

/** @internal */
export function getToastCategory(severity: MessageSeverity) {
  switch (severity) {
    case MessageSeverity.Information:
      return "informational";
    case MessageSeverity.Warning:
      return "warning";
    case MessageSeverity.Error:
    case MessageSeverity.Fatal:
      return "negative";
    case MessageSeverity.None:
    default:
      return "positive";
  }
}
