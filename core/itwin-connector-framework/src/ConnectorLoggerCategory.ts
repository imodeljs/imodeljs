/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Logging
 */

/** Logger categories used by this package
 * @note All logger categories in this package start with the `itwin-connector-framework` prefix.
 * @see [Logger]($bentley)
 * @public
 */
export enum ConnectorLoggerCategory {
  /** The logger category used by the following classes:
   * - [[ConnectorSynchronizer]]
   */
  Framework = "itwin-connector.Framework",
}
