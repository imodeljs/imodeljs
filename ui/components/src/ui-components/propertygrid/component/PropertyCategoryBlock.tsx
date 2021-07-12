/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { ExpandableBlock } from "@itwin/itwinui-react";
import { HighlightedText } from "../../common/HighlightedText";
import { HighlightingComponentProps } from "../../common/HighlightingComponentProps";
import { PropertyCategory } from "../PropertyDataProvider";

/**
 * Properties for the [[PropertyCategoryBlock]] React component
 * @public
 */
export interface PropertyCategoryBlockProps extends CommonProps {
  /** Category of the properties */
  category: PropertyCategory;
  /** Callback to when PropertyCategoryBlock gets expended or collapsed */
  onExpansionToggled?: (categoryName: string) => void;
  /** Properties used for highlighting
  * @beta
  */
  highlight?: HighlightingComponentProps;
}

/**
 * PropertyCategoryBlock React component
 * @public
 */
export class PropertyCategoryBlock extends React.Component<PropertyCategoryBlockProps> {
  constructor(props: PropertyCategoryBlockProps) {
    super(props);
  }

  private toggleExpansion() {
    if (this.props.onExpansionToggled)
      this.props.onExpansionToggled(this.props.category.name);
  }

  private _handleToggle = (_isExpanding: boolean): void => {
    this.toggleExpansion();
  };

  /** @internal */
  public override render() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { highlight, category, children, onExpansionToggled, ...props } = this.props;
    const activeMatchIndex = this.props.category.name === highlight?.activeHighlight?.highlightedItemIdentifier ? highlight.activeHighlight.highlightIndex : undefined;
    const label = highlight ?
      (<HighlightedText text={category.label} activeMatchIndex={activeMatchIndex} searchText={highlight.highlightedText} />) :
      category.label;
    return (
      <ExpandableBlock
        isExpanded={category.expand}
        onToggle={this._handleToggle}
        title={label}
        {...props}
      >
        {children}
      </ExpandableBlock>
    );
  }
}
