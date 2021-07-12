/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { usePresentationTreeNodeLoader, useUnifiedSelectionTreeEventHandler } from "@bentley/presentation-components";
import { ControlledTree, SelectionMode, useVisibleTreeNodes } from "@bentley/ui-components";
import { ConfigurableCreateInfo, ConfigurableUiManager, WidgetControl } from "@bentley/ui-framework";

export class NavigationTreeWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    if (options && options.iModelConnection && options.rulesetId)
      this.reactNode = <NavigationTreeWidget iModelConnection={options.iModelConnection} />;
    else
      this.reactNode = <NavigationTreeWidget />;
  }
}

interface NavigationTreeWidgetProps {
  iModelConnection?: IModelConnection;
  rulesetId?: string;
}

class NavigationTreeWidget extends React.Component<NavigationTreeWidgetProps> {
  private renderVariousControls() {
    return (
      <div>
        <table>
          <tbody>
            <tr>
              <th>Type</th>
              <th>Input</th>
            </tr>
            <tr>
              <td>iModel Name</td>
              <td>{this.props.iModelConnection ? this.props.iModelConnection.name : ""}</td>
            </tr>
            <tr>
              <td><label htmlFor="demo-month">{IModelApp.i18n.translate("SampleApp:zone6.month")}</label></td>
              <td> <input type="month" id="demo-month" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-number">{IModelApp.i18n.translate("SampleApp:zone6.number")}</label></td>
              <td> <input type="number" id="demo-number" min="10" max="20" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-password">{IModelApp.i18n.translate("SampleApp:zone6.password")}</label></td>
              <td> <input type="password" id="demo-password" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-radio">{IModelApp.i18n.translate("SampleApp:zone6.radio")}</label></td>
              <td> <input type="radio" id="demo-radio" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-range">{IModelApp.i18n.translate("SampleApp:zone6.range")}</label></td>
              <td> <input type="range" id="demo-range" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-search">{IModelApp.i18n.translate("SampleApp:zone6.search")}</label></td>
              <td> <input type="search" id="demo-search" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-tel">{IModelApp.i18n.translate("SampleApp:zone6.Tel")}</label></td>
              <td> <input type="tel" id="demo-tel" /> </td>
            </tr>
            <tr>
              <td><label htmlFor="demo-text">{IModelApp.i18n.translate("SampleApp:zone6.Text")}</label></td>
              <td> <input type="text" id="demo-text" /> </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  public override render(): React.ReactNode {
    if (this.props.iModelConnection && this.props.rulesetId)
      return <NavigationTree iModelConnection={this.props.iModelConnection} rulesetId={this.props.rulesetId} />;
    else
      return this.renderVariousControls();
  }
}

interface NavigationTreeProps {
  iModelConnection: IModelConnection;
  rulesetId: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const NavigationTree: React.FC<NavigationTreeProps> = (props: NavigationTreeProps) => {
  const { nodeLoader } = usePresentationTreeNodeLoader({
    imodel: props.iModelConnection,
    ruleset: props.rulesetId,
    pagingSize: 20,
  });
  const modelSource = nodeLoader.modelSource;
  const eventHandler = useUnifiedSelectionTreeEventHandler({ nodeLoader, collapsedChildrenDisposalEnabled: true });
  const visibleNodes = useVisibleTreeNodes(modelSource);
  return (
    <ControlledTree
      visibleNodes={visibleNodes}
      nodeLoader={nodeLoader}
      selectionMode={SelectionMode.Single}
      treeEvents={eventHandler}
    />
  );
};

ConfigurableUiManager.registerControl("NavigationTreeWidget", NavigationTreeWidgetControl);
