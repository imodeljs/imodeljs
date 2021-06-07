/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { Field } from "@bentley/presentation-common";
import {
  IPresentationPropertyDataProvider, PresentationPropertyDataProvider, usePropertyDataProviderWithUnifiedSelection,
} from "@bentley/presentation-components";
import { FavoritePropertiesScope, Presentation } from "@bentley/presentation-frontend";
import {
  ActionButtonRendererProps, PropertyGridContextMenuArgs, useAsyncValue, VirtualizedPropertyGridWithDataProvider,
  VirtualizedPropertyGridWithDataProviderProps,
} from "@bentley/ui-components";
import { ContextMenuItem, ContextMenuItemProps, FillCentered, GlobalContextMenu, Icon, Orientation } from "@bentley/ui-core";
import { ConfigurableCreateInfo, FrameworkVersionSwitch, UiFramework, WidgetControl } from "@bentley/ui-framework";
import { ExtensionUiItemsProvider } from "../ExtensionUiItemsProvider";

interface PresentationPropertyGridWidgetProps {
  iModelConnection: IModelConnection | (() => IModelConnection | undefined);
}

export type ContextMenuItemInfo = ContextMenuItemProps & React.Attributes & { label: string };

export interface State {
  dataProvider?: PresentationPropertyDataProvider;
  contextMenu?: PropertyGridContextMenuArgs;
  contextMenuItemInfos?: ContextMenuItemInfo[];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function PresentationPropertyGrid(props: VirtualizedPropertyGridWithDataProviderProps & { dataProvider: IPresentationPropertyDataProvider }) {
  const { isOverLimit } = usePropertyDataProviderWithUnifiedSelection({ dataProvider: props.dataProvider });
  if (isOverLimit) {
    return (<FillCentered>{ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.too-many-elements-selected")}</FillCentered>);
  }
  return <VirtualizedPropertyGridWithDataProvider {...props} />;
}

export class PresentationPropertyGridWidget extends React.Component<PresentationPropertyGridWidgetProps, State> {
  constructor(props: PresentationPropertyGridWidgetProps) {
    super(props);
    const imodel = (typeof this.props.iModelConnection === "function") ? this.props.iModelConnection() : this.props.iModelConnection;
    if (imodel) {
      this.state = {
        dataProvider: createDataProvider(imodel),
      };
    }
  }

  private _onAddFavorite = async (propertyField: Field) => {
    const imodel = (typeof this.props.iModelConnection === "function") ? this.props.iModelConnection() : this.props.iModelConnection;
    if (imodel)
      await Presentation.favoriteProperties.add(propertyField, imodel, FavoritePropertiesScope.IModel);
    this.setState({ contextMenu: undefined });
  };
  private _onRemoveFavorite = async (propertyField: Field) => {
    const imodel = (typeof this.props.iModelConnection === "function") ? this.props.iModelConnection() : this.props.iModelConnection;
    if (imodel)
      await Presentation.favoriteProperties.remove(propertyField, imodel, FavoritePropertiesScope.IModel);
    this.setState({ contextMenu: undefined });
  };

  private _onPropertyContextMenu = (args: PropertyGridContextMenuArgs) => {
    args.event.persist();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.buildContextMenu(args);
  };

  private _onContextMenuOutsideClick = () => {
    this.setState({ contextMenu: undefined });
  };

  private _onContextMenuEsc = () => {
    this.setState({ contextMenu: undefined });
  };

  private async buildContextMenu(args: PropertyGridContextMenuArgs) {
    const imodel = (typeof this.props.iModelConnection === "function") ? this.props.iModelConnection() : this.props.iModelConnection;
    if (this.state.dataProvider && imodel) {
      const field = await this.state.dataProvider.getFieldByPropertyRecord(args.propertyRecord);
      const items: ContextMenuItemInfo[] = [];
      if (field !== undefined) {
        if (Presentation.favoriteProperties.has(field, imodel, FavoritePropertiesScope.IModel)) {
          items.push({
            key: "remove-favorite",
            icon: "icon-remove-2",
            onSelect: async () => this._onRemoveFavorite(field),
            title: ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.context-menu.remove-favorite.description"),
            label: ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.context-menu.remove-favorite.label"),
          });
        } else {
          items.push({
            key: "add-favorite",
            icon: "icon-add",
            onSelect: async () => this._onAddFavorite(field),
            title: ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.context-menu.add-favorite.description"),
            label: ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.context-menu.add-favorite.label"),
          });
        }
      }

      this.setState({ contextMenu: args, contextMenuItemInfos: items.length > 0 ? items : undefined });
    }
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
        identifier="PropertiesWidget"
        x={this.state.contextMenu.event.clientX}
        y={this.state.contextMenu.event.clientY}
      >
        {items}
      </GlobalContextMenu>
    );
  }

  private _favoriteActionButtonRenderer = (props: ActionButtonRendererProps) => {
    const { dataProvider } = this.state;
    const imodel = (typeof this.props.iModelConnection === "function") ? this.props.iModelConnection() : this.props.iModelConnection;
    if (imodel && dataProvider) {
      const { property } = props;
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const field = useAsyncValue(React.useMemo(async () => dataProvider.getFieldByPropertyRecord(property), [dataProvider, property]));

      return (
        <div>
          {
            field &&
            (Presentation.favoriteProperties.has(field, imodel, FavoritePropertiesScope.IModel) || props.isPropertyHovered) &&
            <FavoriteActionButton
              field={field}
              imodel={imodel} />
          }
        </div>
      );
    }
    return null;
  };

  public render() {
    if (!this.state.dataProvider)
      return null;

    const actionButtonRenderers = [this._favoriteActionButtonRenderer];
    if (this.props.iModelConnection) {
      const element = <>
        <PresentationPropertyGrid
          dataProvider={this.state.dataProvider}
          orientation={Orientation.Horizontal}
          isPropertyHoverEnabled={true}
          onPropertyContextMenu={this._onPropertyContextMenu}
          actionButtonRenderers={actionButtonRenderers}
        />
        {this.renderContextMenu()}
      </>;
      return (
        <FrameworkVersionSwitch
          v1={<div data-component-id="uifw-v1-container" style={{ height: "100%" }}>{element}</div>}
          v2={<div data-component-id="uifw-v2-container" style={{ height: "100%", width: "100%", position: "absolute" }}>{element}</div>}
        />
      );
    }

    return null;
  }
}

function createDataProvider(imodel: IModelConnection): PresentationPropertyDataProvider {
  const provider = new PresentationPropertyDataProvider({ imodel });
  provider.isNestedPropertyCategoryGroupingEnabled = true;
  return provider;
}

interface FavoriteActionButtonProps {
  field: Field;
  imodel: IModelConnection;
}

class FavoriteActionButton extends React.Component<FavoriteActionButtonProps> {

  private _isMounted = false;

  public componentDidMount() {
    this._isMounted = true;
  }

  public componentWillUnmount() {
    this._isMounted = false;
  }

  public render() {
    return (
      <div onClick={this._onActionButtonClicked}>
        {this.isFavorite() ?
          <Icon iconSpec="icon-star" /> :
          <Icon iconSpec="icon-star" />}
      </div>
    );
  }

  private _onActionButtonClicked = () => {
    this.toggleFavoriteProperty(); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private async toggleFavoriteProperty() {
    if (this.isFavorite())
      await Presentation.favoriteProperties.remove(this.props.field, this.props.imodel, FavoritePropertiesScope.IModel);
    else
      await Presentation.favoriteProperties.add(this.props.field, this.props.imodel, FavoritePropertiesScope.IModel);
    if (this._isMounted)
      this.setState({ isFavorite: this.isFavorite() });
  }

  private isFavorite(): boolean {
    return Presentation.favoriteProperties.has(this.props.field, this.props.imodel, FavoritePropertiesScope.IModel);
  }
}

/** PresentationPropertyGridWidgetControl provides a widget that shows properties returned from Presentation System
 * based of the active element selection. To use in a frontstage use the following in the frontstageDef.
 * ``` tsx
 *  <Widget id={PresentationPropertyGridWidgetControl.id} label={PresentationPropertyGridWidgetControl.label} control={PresentationPropertyGridWidgetControl}
 *    iconSpec={PresentationPropertyGridWidgetControl.iconSpec} />,
 * ```
 */
export class PresentationPropertyGridWidgetControl extends WidgetControl {
  public static id = "uiTestExtension:PresentationPropertyGridWidget";
  public static iconSpec = "icon-info";
  public static get label(): string {
    return ExtensionUiItemsProvider.i18n.translate("uiTestExtension:properties.widget-label");
  }

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <PresentationPropertyGridWidget iModelConnection={UiFramework.getIModelConnection} />;
  }
}
