/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import * as React from "react";
import { PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { Orientation } from "@bentley/ui-core";
import { HighlightingComponentProps } from "../../../common/HighlightingComponentProps";
import { EditorContainer, PropertyUpdatedArgs } from "../../../editors/EditorContainer";
import { CommonPropertyRenderer } from "../../../properties/renderers/CommonPropertyRenderer";
import { PrimitivePropertyRenderer, PrimitiveRendererProps } from "../../../properties/renderers/PrimitivePropertyRenderer";
import { SharedRendererProps } from "../../../properties/renderers/PropertyRenderer";
import { PropertyValueRendererManager } from "../../../properties/ValueRendererManager";
import { PropertyCategory } from "../../PropertyDataProvider";
import { FlatNonPrimitivePropertyRenderer } from "./FlatNonPrimitivePropertyRenderer";

/** Properties of [[FlatPropertyRenderer]] React component
 * @internal
 */
export interface FlatPropertyRendererProps extends SharedRendererProps {
  category?: PropertyCategory;
  /** Custom value renderer */
  propertyValueRendererManager?: PropertyValueRendererManager;
  /** Multiplier of how much the property is indented to the right */
  indentation?: number;
  /** Indicates property is being edited
   * @beta */
  isEditing?: boolean;
  /** Called when property edit is committed.
   * @beta */
  onEditCommit?: (args: PropertyUpdatedArgs, category: PropertyCategory) => void;
  /** Called when property edit is cancelled.
   * @beta */
  onEditCancel?: () => void;
  /** Whether property value is displayed in expanded state. */
  isExpanded: boolean;
  /** Called when toggling between expanded and collapsed property value display state. */
  onExpansionToggled: () => void;
  /** Reports property height changes. */
  onHeightChanged?: (newHeight: number) => void;

  highlight?: HighlightingComponentProps & { applyOnLabel: boolean, applyOnValue: boolean };

  children?: never;
}

/**  A React component that renders flat properties
 * @internal
 */
export const FlatPropertyRenderer: React.FC<FlatPropertyRendererProps> = (props) => {
  const {
    category,
    propertyValueRendererManager,
    isEditing,
    onEditCommit,
    onEditCancel,
    onHeightChanged,
    highlight,
    ...passthroughProps
  } = props;

  const valueElementRenderer = () => (
    <DisplayValue
      propertyRecord={passthroughProps.propertyRecord}
      orientation={passthroughProps.orientation}
      columnRatio={passthroughProps.columnRatio}
      width={passthroughProps.width}
      category={category}
      propertyValueRendererManager={propertyValueRendererManager}
      isEditing={isEditing}
      onEditCommit={onEditCommit}
      onEditCancel={onEditCancel}
      isExpanded={passthroughProps.isExpanded}
      onExpansionToggled={passthroughProps.onExpansionToggled}
      onHeightChanged={onHeightChanged}
      highlight={highlight}
    />
  );

  const primitiveRendererProps: PrimitiveRendererProps = {
    ...passthroughProps,
    valueElementRenderer,
    indentation: props.indentation,
  };
  switch (props.propertyRecord.value.valueFormat) {
    case PropertyValueFormat.Primitive:
      return (<PrimitivePropertyRenderer highlight={highlight?.applyOnLabel ? highlight : undefined} {...primitiveRendererProps} />);

    case PropertyValueFormat.Array:
      // If array is empty, render it as a primitive property
      if (props.propertyRecord.value.items.length === 0)
        return (<PrimitivePropertyRenderer highlight={highlight?.applyOnLabel ? highlight : undefined} {...primitiveRendererProps} />);

    // eslint-disable-next-line no-fallthrough
    case PropertyValueFormat.Struct:
      return (
        <FlatNonPrimitivePropertyRenderer
          isExpanded={props.isExpanded}
          onExpandToggled={props.onExpansionToggled}
          {...primitiveRendererProps}
        />
      );
  }
};

interface DisplayValueProps {
  isEditing?: boolean;
  propertyRecord: PropertyRecord;

  orientation: Orientation;
  columnRatio?: number;
  /** Pass width to rerender component as property grid width changes */
  width?: number;
  indentation?: number;
  propertyValueRendererManager?: PropertyValueRendererManager;
  isExpanded?: boolean;
  onExpansionToggled?: () => void;
  onHeightChanged?: (newHeight: number) => void;

  category?: PropertyCategory;
  onEditCancel?: () => void;
  onEditCommit?: (args: PropertyUpdatedArgs, category: PropertyCategory) => void;

  highlight?: HighlightingComponentProps & { applyOnLabel: boolean, applyOnValue: boolean };
}

const DisplayValue: React.FC<DisplayValueProps> = (props) => {
  useResetHeightOnEdit(props.isEditing, props.onHeightChanged);

  if (props.isEditing) {
    const _onEditCommit = (args: PropertyUpdatedArgs) => {
      /* istanbul ignore else */
      if (props.category)
        props.onEditCommit?.(args, props.category);
    };

    return (
      <EditorContainer
        propertyRecord={props.propertyRecord}
        onCommit={_onEditCommit}
        onCancel={props.onEditCancel ?? (/* istanbul ignore next */() => { })}
        setFocus={true}
      />
    );
  }

  return (
    <>
      {
        CommonPropertyRenderer.createNewDisplayValue(
          props.orientation,
          props.propertyRecord,
          props.indentation,
          props.propertyValueRendererManager,
          props.isExpanded,
          props.onExpansionToggled,
          props.onHeightChanged,
          props.highlight
        )
      }
    </>
  );
};

function useResetHeightOnEdit(isEditing?: boolean, onHeightChanged?: (newHeight: number) => void) {
  const previousEditingStatusRef = React.useRef(isEditing);
  React.useEffect(() => {
    if (!previousEditingStatusRef.current && isEditing) {
      onHeightChanged?.(27);
    }

    previousEditingStatusRef.current = isEditing;
  });
}
