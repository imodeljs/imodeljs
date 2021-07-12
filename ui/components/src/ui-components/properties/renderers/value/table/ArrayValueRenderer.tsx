/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import * as React from "react";
import { ArrayValue } from "@bentley/ui-abstract";
import { NonPrimitivePropertyRenderer } from "../../NonPrimitivePropertyRenderer";
import { TableSpecificValueRendererProps, TableNonPrimitiveValueRenderer as TableValueRenderer } from "./NonPrimitiveValueRenderer";

/** A react component which renders array property value as a button with text
 * @public
 */
export class TableArrayValueRenderer extends React.PureComponent<TableSpecificValueRendererProps> {
  private getButtonLabel(props: TableSpecificValueRendererProps) {
    const value = (props.propertyRecord.value as ArrayValue);
    return value.items.length !== 0 ? `${value.itemsTypeName}[${value.items.length}]` : "[]";
  }

  private getDialogContents() {
    return (
      <NonPrimitivePropertyRenderer
        uniqueKey={`table_array_${this.props.propertyRecord.property.name}`}
        orientation={this.props.orientation}
        propertyRecord={this.props.propertyRecord}
      />
    );
  }

  /** @internal */
  public override render() {
    const typeName = (this.props.propertyRecord.value as ArrayValue).itemsTypeName;
    return (
      <TableValueRenderer
        buttonLabel={this.getButtonLabel(this.props)}
        dialogContents={this.getDialogContents()}
        dialogTitle={`Array of type "${typeName}"`}
        onDialogOpen={this.props.onDialogOpen}
      />
    );
  }
}
