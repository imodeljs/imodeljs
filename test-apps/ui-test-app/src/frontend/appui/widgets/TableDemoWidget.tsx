/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { Table, TableProps, withTableDragDrop } from "@bentley/ui-components";
import { ConfigurableCreateInfo, DragDropLayerManager, UiFramework, WidgetControl } from "@bentley/ui-framework";
import {
  demoMutableTableDataProvider, DemoTableDragDropType, tableDragProps, TableDragTypes, tableDropProps,
} from "./demodataproviders/demoTableDataProvider";
import { TreeDragTypes } from "./demodataproviders/demoTreeDataProvider";
import { RowDragLayer } from "./draglayers/RowDragLayer";
import { Checkbox } from "@bentley/ui-core";

export class TableDemoWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    if (UiFramework.getIModelConnection())
      this.reactNode = <TableDemoWidget iModelConnection={UiFramework.getIModelConnection()} />;
    else
      this.reactNode = null;
  }
}

const DragDropTable = withTableDragDrop<TableProps, DemoTableDragDropType>(Table); // eslint-disable-line deprecation/deprecation

interface Props {
  iModelConnection?: IModelConnection;
}

interface State {
  checked: boolean;
}

export class TableDemoWidget extends React.Component<Props, State> {
  public override readonly state: State = {
    checked: false,
  };
  public override render() {
    DragDropLayerManager.registerTypeLayer(TableDragTypes.Row, RowDragLayer); // eslint-disable-line deprecation/deprecation

    let objectTypes: Array<string | symbol> = [];
    if (tableDropProps.objectTypes) {
      if (typeof tableDropProps.objectTypes !== "function")
        objectTypes = tableDropProps.objectTypes;
      else
        objectTypes = tableDropProps.objectTypes();
    }
    if (this.state.checked)
      objectTypes.push(TreeDragTypes.Parent, TreeDragTypes.Child);

    const dragProps = tableDragProps;
    const dropProps = {
      ...tableDropProps,
      objectTypes,
    };

    return (
      <div style={{ height: "100%" }}>
        <label htmlFor="receives_tree">Can accept tree nodes: </label>
        <Checkbox id="receives_tree" onChange={(event) => {
          this.setState({ checked: event.target.checked });
        }} />
        <div style={{ height: "calc(100% - 20px)" }}>
          <DragDropTable
            dataProvider={demoMutableTableDataProvider}
            dragProps={dragProps}
            dropProps={dropProps}
            reorderableColumns={true}
            showHideColumns={true}
            settingsIdentifier="Test"
          />
        </div>
      </div >
    );
  }
}
