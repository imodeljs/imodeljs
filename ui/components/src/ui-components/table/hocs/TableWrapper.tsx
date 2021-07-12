/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import * as React from "react";
import { WithDropTargetProps } from "../../dragdrop/withDropTarget";

/** @internal */
export interface TableWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  isOver?: boolean;
  canDrop?: boolean;
  item?: any;
  type?: string | symbol;
}

/** @internal */
export class TableWrapper extends React.Component<TableWrapperProps> {
  public override render(): React.ReactNode {
    const { isOver, canDrop, item, type, ...props } = this.props as WithDropTargetProps; // eslint-disable-line @typescript-eslint/no-unused-vars, deprecation/deprecation
    return (<div className="react-data-grid-wrapper" style={{ height: "100%" }} {...props} />);
  }
}
