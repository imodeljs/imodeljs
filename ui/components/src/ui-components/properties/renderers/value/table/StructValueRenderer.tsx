/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import * as React from "react";
import { NonPrimitivePropertyRenderer } from "../../NonPrimitivePropertyRenderer";
import { TableSpecificValueRendererProps, TableNonPrimitiveValueRenderer as TableValueRenderer } from "./NonPrimitiveValueRenderer";

/** A react component which renders struct property value as a button with text
 * @public
 */
export class TableStructValueRenderer extends React.PureComponent<TableSpecificValueRendererProps> {
  private getButtonLabel(props: TableSpecificValueRendererProps) {
    return `{${props.propertyRecord.property.typename}}`;
  }

  private getDialogContents() {
    return (
      <NonPrimitivePropertyRenderer
        uniqueKey={`table_struct_${this.props.propertyRecord.property.name}`}
        orientation={this.props.orientation}
        propertyRecord={this.props.propertyRecord}
      />
    );
  }

  /** @internal */
  public override render() {
    return (
      <TableValueRenderer
        buttonLabel={this.getButtonLabel(this.props)}
        dialogTitle={`Struct of type "${this.props.propertyRecord.property.typename}"`}
        dialogContents={this.getDialogContents()}
        onDialogOpen={this.props.onDialogOpen}
      />
    );
  }
}
