/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "./DragLayer.scss";
import * as React from "react";
import { DragLayerProps } from "@bentley/ui-components";

export class RowDragLayer extends React.Component<DragLayerProps> { // eslint-disable-line deprecation/deprecation
  public override render(): React.ReactNode {
    const args = this.props.args!;
    const pos = args.clientOffset;
    const spos = args.sourceClientOffset || { x: -1000, y: -1000 };
    const width = 150;
    const x = pos.x > spos.x + width ? pos.x - width / 2 : spos.x;
    const y = spos.y;

    const translate = `translate(${x}px, ${y}px)`;

    const data = args.dataObject || {};

    const dragLayerStyle: React.CSSProperties = {
      transform: translate,
      WebkitTransform: translate,
      width,
    };
    return (
      <div className="drag-layer" style={dragLayerStyle}>
        <div className="drag-layer-type tablerow">{data.type}</div>
        <div className="drag-layer-detail label">{data.label}</div>
        <div className="drag-layer-detail description">{data.description}</div>
      </div>
    );
  }
}
