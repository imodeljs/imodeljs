/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import classnames from "classnames";
import * as React from "react";
import { DragLayerProps } from "../../dragdrop/DragDropDef";

/**
 * React component used to portray a column being dragged during Table column reordering.
 * @public
 * @deprecated
 */
export class ColumnDragLayer extends React.Component<DragLayerProps> { // eslint-disable-line deprecation/deprecation
  constructor(props: DragLayerProps) { // eslint-disable-line deprecation/deprecation
    super(props);
  }

  public override render(): React.ReactNode {
    if (this.props.args === undefined)
      return null;

    const args = this.props.args;
    const spos = args.sourceClientOffset || { x: -1000, y: -1000 };
    const ispos = args.initialSourceClientOffset || { x: -1000, y: -1000 };

    const data = args.dataObject || /* istanbul ignore next */ {};
    const column = data.column || {};
    const width = column.width || {};

    const x = spos.x + (column && column.left);
    const y = ispos.y;

    const translate = `translate(${x}px, ${y}px)`;

    const dragLayerStyle: React.CSSProperties = {
      transform: translate,
      WebkitTransform: translate,
      width,
      ...this.props.style,
    };
    return (
      <div className={classnames("components-column-drag-layer", this.props.className)} style={dragLayerStyle}>
        {column.name}
      </div>
    );
  }
}
