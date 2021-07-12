/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { PresentationTableDataProvider, tableWithUnifiedSelection } from "@bentley/presentation-components";
import { Table, TableCellContextMenuArgs } from "@bentley/ui-components";
import { ContextMenuItem, GlobalContextMenu } from "@bentley/ui-core";
import { ConfigurableCreateInfo, ConfigurableUiManager, WidgetControl } from "@bentley/ui-framework";
import { ContextMenuItemInfo } from "./UnifiedSelectionPropertyGridWidget";

// create a HOC property grid component that supports unified selection
// eslint-disable-next-line @typescript-eslint/naming-convention
const UnifiedSelectionTable = tableWithUnifiedSelection(Table);

export class UnifiedSelectionTableWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    if (options && options.iModelConnection && options.rulesetId)
      this.reactNode = <UnifiedSelectionTableWidget iModelConnection={options.iModelConnection} />;
  }
}

interface UnifiedSelectionTableWidgetProps {
  iModelConnection?: IModelConnection;
  rulesetId?: string;
}

interface UnifiedSelectionTableWidgetState {
  dataProvider: PresentationTableDataProvider;
  contextMenu?: TableCellContextMenuArgs;
  contextMenuItemInfos?: ContextMenuItemInfo[];
}

class UnifiedSelectionTableWidget extends React.PureComponent<UnifiedSelectionTableWidgetProps, UnifiedSelectionTableWidgetState> {
  constructor(props: UnifiedSelectionTableWidgetProps, context?: any) {
    super(props, context);
    this.state = { dataProvider: createDataProviderFromProps(props) };
  }

  public static getDerivedStateFromProps(props: UnifiedSelectionTableWidgetProps, state: UnifiedSelectionTableWidgetState): UnifiedSelectionTableWidgetState | null {
    const needsDataProviderRecreated = (props.iModelConnection !== state.dataProvider.imodel || props.rulesetId !== state.dataProvider.rulesetId);
    if (needsDataProviderRecreated)
      state.dataProvider = createDataProviderFromProps(props);
    return state;
  }

  public override componentWillUnmount() {
    this.state.dataProvider.dispose();
  }

  public override componentDidUpdate(_prevProps: UnifiedSelectionTableWidgetProps, prevState: UnifiedSelectionTableWidgetState) {
    if (this.state.dataProvider !== prevState.dataProvider)
      prevState.dataProvider.dispose();
  }

  private _onCellContextMenu = (args: TableCellContextMenuArgs) => {
    args.event.persist();
    this.buildContextMenu(args);
  };

  private _onContextMenuOutsideClick = () => {
    this.setState({ contextMenu: undefined });
  };

  private _onContextMenuEsc = () => {
    this.setState({ contextMenu: undefined });
  };

  private _onSampleItem = () => {
    this.setState(
      { contextMenu: undefined },
      () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Menu item clicked")),
    );
  };

  private buildContextMenu(args: TableCellContextMenuArgs) {
    const items: ContextMenuItemInfo[] = [];
    items.push({
      key: "example-menu-item",
      icon: "icon-placeholder",
      onSelect: this._onSampleItem,
      title: IModelApp.i18n.translate("SampleApp:table.context-menu.sample-item.description"),
      label: IModelApp.i18n.translate("SampleApp:table.context-menu.sample-item.label"),
    });

    this.setState({ contextMenu: args, contextMenuItemInfos: items.length > 0 ? items : undefined });
  }

  private renderContextMenu() {
    if (!this.state.contextMenu || !this.state.contextMenuItemInfos)
      return undefined;

    const items: React.ReactNode[] = [];
    this.state.contextMenuItemInfos.forEach((info: ContextMenuItemInfo) => (
      items.push(
        <ContextMenuItem
          key={info.key}
          onSelect={info.onSelect}
          title={info.title}
          icon={info.icon}
        >
          {info.label}
        </ContextMenuItem>,
      )
    ));

    return (
      <GlobalContextMenu
        opened={true}
        onOutsideClick={this._onContextMenuOutsideClick}
        onEsc={this._onContextMenuEsc}
        identifier="TableWidget"
        x={this.state.contextMenu.event.clientX}
        y={this.state.contextMenu.event.clientY}
      >
        {items}
      </GlobalContextMenu>
    );
  }
  public override render() {
    if (this.props.iModelConnection && this.props.rulesetId) {
      return (
        <div style={{ height: "100%" }}>
          <UnifiedSelectionTable dataProvider={this.state.dataProvider} onCellContextMenu={this._onCellContextMenu} />
          {this.renderContextMenu()}
        </div>
      );
    }
    return null;
  }
}

const createDataProviderFromProps = (props: UnifiedSelectionTableWidgetProps) =>
  new PresentationTableDataProvider({ imodel: props.iModelConnection!, ruleset: props.rulesetId! });

ConfigurableUiManager.registerControl("UnifiedSelectionTableDemoWidget", UnifiedSelectionTableWidgetControl);
