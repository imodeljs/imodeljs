/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  Breadcrumb, BreadcrumbDetails, BreadcrumbDetailsProps, BreadcrumbMode, BreadcrumbPath, BreadcrumbProps, withBreadcrumbDetailsDragDrop,
  withBreadcrumbDragDrop,
} from "@bentley/ui-components";
import { ConfigurableCreateInfo, ConfigurableUiManager, DragDropLayerManager, UiFramework, WidgetControl } from "@bentley/ui-framework";
import { TableDragTypes } from "./demodataproviders/demoTableDataProvider";
import {
  demoMutableTreeDataProvider, DemoTreeDragDropType, treeDragProps, TreeDragTypes, treeDropProps,
} from "./demodataproviders/demoTreeDataProvider";
import { ChildDragLayer } from "./draglayers/ChildDragLayer";
import { ParentDragLayer } from "./draglayers/ParentDragLayer";

const DragDropBreadcrumb = withBreadcrumbDragDrop<BreadcrumbProps, DemoTreeDragDropType>(Breadcrumb); // eslint-disable-line deprecation/deprecation
const DragDropBreadcrumbDetails = withBreadcrumbDetailsDragDrop<BreadcrumbDetailsProps, DemoTreeDragDropType>(BreadcrumbDetails); // eslint-disable-line deprecation/deprecation

export class BreadcrumbDemoWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    if (UiFramework.getIModelConnection())
      this.reactNode = <BreadcrumbDemoWidget iModelConnection={UiFramework.getIModelConnection()} />;
    else
      this.reactNode = null;
  }
}

interface Props {
  iModelConnection?: IModelConnection;
}

interface State {
  checked: boolean;
}

class BreadcrumbDemoWidget extends React.Component<Props, State> {
  public override readonly state: State = {
    checked: false,
  };
  public override render() {
    const path = new BreadcrumbPath(demoMutableTreeDataProvider);

    DragDropLayerManager.registerTypeLayer(TreeDragTypes.Parent, ParentDragLayer); // eslint-disable-line deprecation/deprecation
    DragDropLayerManager.registerTypeLayer(TreeDragTypes.Child, ChildDragLayer); // eslint-disable-line deprecation/deprecation

    let objectTypes: Array<string | symbol> = [];
    if (treeDropProps.objectTypes) {
      if (typeof treeDropProps.objectTypes !== "function")
        objectTypes = treeDropProps.objectTypes;
      else
        objectTypes = treeDropProps.objectTypes();
    }
    if (this.state.checked)
      objectTypes.push(TableDragTypes.Row);

    const dragProps = treeDragProps;
    const dropProps = {
      ...treeDropProps,
      objectTypes,
    };

    return (
      <div style={{ height: "100%" }}>
        <label htmlFor="receives_row">Can accept rows: </label>
        <input id="receives_row" type="checkbox" onChange={(event) => {
          this.setState({ checked: event.target.checked });
        }} />
        <div style={{ height: "calc(100% - 22px)" }}>
          <DragDropBreadcrumb path={path} dataProvider={demoMutableTreeDataProvider} initialBreadcrumbMode={BreadcrumbMode.Input} delimiter={"\\"}
            dragProps={dragProps} dropProps={dropProps} />
          <DragDropBreadcrumbDetails path={path}
            dragProps={dragProps} dropProps={dropProps} />
        </div>
      </div>
    );
  }
}

ConfigurableUiManager.registerControl("BreadcrumbDemoWidget", BreadcrumbDemoWidgetControl);
