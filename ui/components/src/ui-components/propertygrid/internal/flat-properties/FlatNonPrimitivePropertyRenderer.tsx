/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */
import "../../../properties/renderers/NonPrimitivePropertyRenderer.scss";
import _ from "lodash";
import * as React from "react";
import { PropertyValueFormat } from "@bentley/ui-abstract";
import { CommonPropertyRenderer } from "../../../properties/renderers/CommonPropertyRenderer";
import { PrimitiveRendererProps } from "../../../properties/renderers/PrimitivePropertyRenderer";
import { NonPrimitivePropertyLabelRenderer } from "../../../properties/renderers/label/NonPrimitivePropertyLabelRenderer";
import { PropertyView } from "../../../properties/renderers/PropertyView";

/** Properties of [[FlatNonPrimitivePropertyRenderer]] React component
 * @internal
 */
export interface FlatNonPrimitivePropertyRendererProps extends PrimitiveRendererProps {
  isExpanded: boolean;
  onExpandToggled: () => void;
}

/** React Component that renders flat struct and array properties
 * @internal
 */
export class FlatNonPrimitivePropertyRenderer extends React.Component<FlatNonPrimitivePropertyRendererProps> {
  constructor(props: FlatNonPrimitivePropertyRendererProps) {
    super(props);
  }

  private _onExpanded = () => {
    /* istanbul ignore else */
    if (!this.props.isExpanded)
      this.props.onExpandToggled();
  };

  private _onCollapsed = () => {
    /* istanbul ignore else */
    if (this.props.isExpanded)
      this.props.onExpandToggled();
  };

  private getLabel(props: FlatNonPrimitivePropertyRendererProps): React.ReactNode {
    const { orientation, indentation, width, columnRatio, columnInfo } = props;
    const offset = CommonPropertyRenderer.getLabelOffset(indentation, orientation, width, columnRatio, columnInfo?.minLabelWidth);

    let displayLabel = props.propertyRecord.property.displayLabel;
    if (props.propertyRecord.value.valueFormat === PropertyValueFormat.Array)
      displayLabel = `${displayLabel} (${props.propertyRecord.value.items.length})`;

    return (
      <NonPrimitivePropertyLabelRenderer
        isExpanded={props.isExpanded}
        onExpand={this._onExpanded}
        onCollapse={this._onCollapsed}
        offset={offset}
        renderColon={false}
      >
        {displayLabel}
      </NonPrimitivePropertyLabelRenderer>
    );
  }

  /** @internal */
  public override render() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children, indentation, ...props } = this.props;
    return (
      <PropertyView
        labelElement={this.getLabel(this.props)}
        {...props}
      />
    );
  }
}
