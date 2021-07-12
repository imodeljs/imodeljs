/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import * as React from "react";
import { Orientation } from "@bentley/ui-core";
import { HighlightedText } from "../../common/HighlightedText";
import { HighlightingComponentProps } from "../../common/HighlightingComponentProps";
import { CommonPropertyRenderer } from "./CommonPropertyRenderer";
import { PrimitivePropertyLabelRenderer } from "./label/PrimitivePropertyLabelRenderer";
import { SharedRendererProps } from "./PropertyRenderer";
import { PropertyView } from "./PropertyView";

/** Properties of [[PrimitivePropertyRenderer]] React component
 * @public
 */
export interface PrimitiveRendererProps extends SharedRendererProps {
  /** Property value as a React element */
  valueElement?: React.ReactNode;
  /** Render callback for property value. If specified, `valueElement` is ignored. */
  valueElementRenderer?: () => React.ReactNode;
  /** Multiplier of how much the property is indented to the right */
  indentation?: number;
  /** Properties used for highlighting
   * @beta
  */
  highlight?: HighlightingComponentProps;
}

/** React Component that renders primitive properties
 * @public
 */
export class PrimitivePropertyRenderer extends React.Component<PrimitiveRendererProps> {
  constructor(props: PrimitiveRendererProps) {
    super(props);
  }

  /** @internal */
  public override render() {
    const { children, indentation, highlight, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const displayLabel = this.props.propertyRecord.property.displayLabel;
    const offset = CommonPropertyRenderer.getLabelOffset(indentation, props.orientation, props.width, props.columnRatio, props.columnInfo?.minLabelWidth);

    const activeMatchIndex = this.props.propertyRecord.property.name === highlight?.activeHighlight?.highlightedItemIdentifier ? highlight.activeHighlight.highlightIndex : undefined;
    const label = highlight ?
      (HighlightedText({ text: displayLabel, searchText: highlight.highlightedText, activeMatchIndex })) :
      displayLabel;

    return (
      <PropertyView
        {...props}
        labelElement={
          <PrimitivePropertyLabelRenderer offset={offset} renderColon={this.props.orientation === Orientation.Horizontal} tooltip={displayLabel}>
            {label}
          </PrimitivePropertyLabelRenderer>}
      />
    );
  }
}
