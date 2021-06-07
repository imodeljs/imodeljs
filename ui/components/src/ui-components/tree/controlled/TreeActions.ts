/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { CheckBoxState } from "@bentley/ui-core";

/**
 * Tree actions that can be performed on tree.
 * @public
 */
export interface TreeActions {
  onNodeCheckboxClicked: (nodeId: string, newState: CheckBoxState) => void;
  onNodeExpanded: (nodeId: string) => void;
  onNodeCollapsed: (nodeId: string) => void;
  onNodeClicked: (nodeId: string, event: React.MouseEvent) => void;
  onNodeMouseDown: (nodeId: string) => void;
  onNodeMouseMove: (nodeId: string) => void;
  onNodeEditorActivated: (nodeId: string) => void;
  onTreeKeyDown: (event: React.KeyboardEvent) => void;
  onTreeKeyUp: (event: React.KeyboardEvent) => void;
}
