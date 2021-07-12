/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Picker
 */

import * as React from "react";
import { Id64String, Logger } from "@bentley/bentleyjs-core";
import { IModelApp, IModelConnection, ViewState } from "@bentley/imodeljs-frontend";
import { UiEvent } from "@bentley/ui-core";
import { SupportsViewSelectorChange } from "../content/ContentControl";
import { ContentViewManager } from "../content/ContentViewManager";
import { connectIModelConnection } from "../redux/connectIModel";
import { UiFramework } from "../UiFramework";
import { ViewUtilities } from "../utils/ViewUtilities";
import { ListItem, ListItemType, ListPicker } from "./ListPicker";

// cSpell:ignore Spatials

/** [[ViewSelectorChangedEvent]] Args interface.
 * @beta
 */
export interface ViewSelectorChangedEventArgs {
  iModelConnection: IModelConnection;
  viewDefinitionId: Id64String;
  viewState: ViewState;
  name: string;
}

/** ViewSelector Changed Event class.
 * @beta
 */
export class ViewSelectorChangedEvent extends UiEvent<ViewSelectorChangedEventArgs> { }

/** Properties for the [[ViewSelector]] component
 * @beta
 */
export interface ViewSelectorProps {
  imodel?: IModelConnection;
  listenForShowUpdates?: boolean;

  showSpatials: boolean;
  showDrawings: boolean;
  showSheets: boolean;
  showUnknown: boolean;
}

/** State for the [[ViewSelector]] component
 * @beta
 */
interface ViewSelectorState {
  items: ListItem[];
  title: string;
  initialized: boolean;
  showSpatials: boolean;
  showDrawings: boolean;
  showSheets: boolean;
  showUnknown: boolean;
}

/** Default properties of [[ViewSelector]] component.
 * @beta
 */
export type ViewSelectorDefaultProps = Pick<ViewSelectorProps, "showSpatials" | "showDrawings" | "showSheets" | "showUnknown">;

/** ViewSelector Show Update Event Args interface.
 */
interface ViewSelectorShowUpdateEventArgs {
  showSpatials: boolean;
  showDrawings: boolean;
  showSheets: boolean;
  showUnknown: boolean;
}

/** ViewSelector Show Update Event class.
 */
class ViewSelectorShowUpdateEvent extends UiEvent<ViewSelectorShowUpdateEventArgs> { }

/** View Selector React component
 * @beta
 */
export class ViewSelector extends React.Component<ViewSelectorProps, ViewSelectorState> {

  private static readonly _onViewSelectorShowUpdateEvent = new ViewSelectorShowUpdateEvent();
  private _removeShowUpdateListener?: () => void;
  private _isMounted = false;

  public static readonly defaultProps: ViewSelectorDefaultProps = {
    showSpatials: true,
    showDrawings: true,
    showSheets: true,
    showUnknown: true,
  };

  /** Gets the [[ViewSelectorChangedEvent]] */
  public static readonly onViewSelectorChangedEvent = new ViewSelectorChangedEvent();

  /** Updates the ViewSelector show settings.
   */
  public static updateShowSettings(showSpatials: boolean, showDrawings: boolean, showSheets: boolean, showUnknown: boolean): void {
    ViewSelector._onViewSelectorShowUpdateEvent.emit({ showSpatials, showDrawings, showSheets, showUnknown });
  }

  /** Creates a ViewSelector */
  constructor(props: ViewSelectorProps) {
    super(props);

    this.state = {
      items: new Array<ListItem>(),
      title: UiFramework.translate("savedViews.views"),
      initialized: false,
      showSpatials: props.showSpatials,
      showDrawings: props.showDrawings,
      showSheets: props.showSheets,
      showUnknown: props.showUnknown,
    };
  }

  public override async componentDidMount() {
    this._isMounted = true;
    if (this.props.listenForShowUpdates)
      this._removeShowUpdateListener = ViewSelector._onViewSelectorShowUpdateEvent.addListener(this._handleViewSelectorShowUpdateEvent);

    await this.loadViews();
  }

  public override async componentDidUpdate(prevProps: ViewSelectorProps) {
    if (this.props.imodel !== prevProps.imodel) {
      await this.loadViews();
    }
  }

  public override componentWillUnmount() {
    this._isMounted = false;
    // istanbul ignore else
    if (this._removeShowUpdateListener)
      this._removeShowUpdateListener();
  }

  private _handleViewSelectorShowUpdateEvent = (args: ViewSelectorShowUpdateEventArgs): void => {
    // istanbul ignore next
    if (!this._isMounted)
      return;

    this.setState(args, async () => this.loadViews());
  };

  private setStateContainers(views3d: ListItem[], views2d: ListItem[], sheets: ListItem[], unknown?: ListItem[]) {
    const views3dContainer: ListItem = {
      key: "views3dContainer",
      name: UiFramework.translate("savedViews.spatialViews"),
      enabled: false,
      type: ListItemType.Container,
      children: views3d,
    };

    const views2dContainer: ListItem = {
      key: "views2dContainer",
      name: UiFramework.translate("savedViews.drawings"),
      enabled: false,
      type: ListItemType.Container,
      children: views2d,
    };

    const sheetContainer: ListItem = {
      key: "sheetContainer",
      name: UiFramework.translate("savedViews.sheets"),
      enabled: false,
      type: ListItemType.Container,
      children: sheets,
    };

    const containers = [views3dContainer, views2dContainer, sheetContainer];

    // istanbul ignore if
    if (unknown && unknown.length > 0) {
      // This should never show, but just in case we missed a type of view state
      const unknownContainer: ListItem = {
        key: "unknownContainer",
        name: UiFramework.translate("savedViews.others"),
        enabled: false,
        type: ListItemType.Container,
        children: unknown,
      };

      if (unknown.length !== 0)
        containers.push(unknownContainer);
    }

    // istanbul ignore next
    if (!this._isMounted)
      return;

    this.setState({
      items: containers,
      title: UiFramework.translate("savedViews.views"),
      initialized: true,
    });
  }
  /**
   * Query the views and set the initial state with the iModel's views.
   */
  public async loadViews(): Promise<void> {
    // Query views and add them to state
    const views3d: ListItem[] = [];
    const views2d: ListItem[] = [];
    const sheets: ListItem[] = [];
    const unknown: ListItem[] = [];

    // istanbul ignore if
    if (this.props.imodel && this.props.imodel.views.getViewList) {
      const query = { wantPrivate: false };
      const specs = await this.props.imodel.views.getViewList(query);

      specs.forEach((spec: IModelConnection.ViewSpec) => {
        const viewItem: ListItem = {
          key: spec.id,
          name: spec.name,
          enabled: false,
          type: ListItemType.Item,
        };

        const className = ViewUtilities.getBisBaseClass(spec.class);

        if (ViewUtilities.isSpatial(className) && this.state.showSpatials)
          views3d.push(viewItem);
        else if (ViewUtilities.isDrawing(className) && this.state.showDrawings)
          views2d.push(viewItem);
        else if (ViewUtilities.isSheet(className) && this.state.showSheets)
          sheets.push(viewItem);
        else if (this.state.showUnknown)
          unknown.push(viewItem);
      });
    }

    this.setStateContainers(views3d, views2d, sheets, unknown);
  }

  /**
   * Update state of the entries in the widget.
   * @param viewId Identifier for the relevant view
   */
  // istanbul ignore next
  public async updateState(viewId?: any): Promise<void> {
    // Wait for initialization finished
    if (!this.state.initialized)
      return;

    // Query views and add them to state
    const views3d: ListItem[] = this.state.items[0].children!;
    const views2d: ListItem[] = this.state.items[1].children!;
    const sheets: ListItem[] = this.state.items[2].children!;
    const unknown: ListItem[] = this.state.items.length > 3 ? this.state.items[3].children! : [];

    const updateChildren = (item: ListItem) => {
      if (item.key === viewId)
        return { ...item, enabled: true };
      else
        return { ...item, enabled: false };
    };

    this.setStateContainers(views3d.map(updateChildren), views2d.map(updateChildren), sheets.map(updateChildren), unknown.map(updateChildren));
  }

  // enable/disable the models
  // istanbul ignore next
  private _setEnabled = async (item: ListItem, _enabled: boolean) => {
    const activeContentControl = ContentViewManager.getActiveContentControl() as unknown as SupportsViewSelectorChange;
    if (!activeContentControl || !activeContentControl.supportsViewSelectorChange) {
      Logger.logError(UiFramework.loggerCategory(this), `No active ContentControl for ViewSelector change`);
      return;
    }

    // Enable the item temporarily to let user see that their click was registered
    // while we query for view state and change the current view which may take a bit
    if (_enabled && item.type !== ListItemType.Container) {
      // This itemMapper simply looks through all the list items and their nested children and enables the one
      // that we have registered to enable
      // Also disable all other items
      const itemMapper: (tempItem: ListItem) => ListItem = (tempItem: ListItem) => {
        if (tempItem.type === ListItemType.Container) {
          return { ...tempItem, children: tempItem.children!.map(itemMapper) };
        } else if (tempItem.key === item.key) {
          return { ...tempItem, enabled: true };
        } else {
          return { ...tempItem, enabled: false };
        }
      };

      // Create the new array with the current item enabled
      const itemsWithEnabled = this.state.items.map(itemMapper);

      // istanbul ignore next
      if (!this._isMounted)
        return;

      // Update the state so that we show the user it was enabled while we work in the background
      this.setState({ items: itemsWithEnabled });
    }

    // Load the view state using the viewSpec's ID
    const viewState = await this.props.imodel!.views.load(item.key);

    // Let activeContentControl process the ViewSelector change
    await activeContentControl.processViewSelectorChange(this.props.imodel!, item.key, viewState, item.name!);

    // Emit a change event
    ViewSelector.onViewSelectorChangedEvent.emit({
      iModelConnection: this.props.imodel!,
      viewDefinitionId: item.key,
      viewState,
      name: item.name!,
    });

    // Set state to show enabled the view that got selected
    this.updateState(item.key); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  // Hook on the category selector being expanded so that we may initialize if needed
  // istanbul ignore next
  private _onExpanded = (expand: boolean) => {
    if (expand)
      this.updateState(IModelApp.viewManager.selectedView ? IModelApp.viewManager.selectedView.view.id : undefined); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  /**
   *  Renders ViewSelector component
   */
  public override render() {
    if (!this.state.initialized)
      return null;

    const { imodel, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars

    return (
      <ListPicker
        {...props}
        title={this.state.title}
        setEnabled={this._setEnabled}
        items={this.state.items}
        iconSpec={"icon-saved-view"}
        onExpanded={this._onExpanded}
      />
    );
  }
}

/** ViewSelector that is connected to the IModelConnection property in the Redux store. The application must set up the Redux store and include the FrameworkReducer.
 * @beta
 */
export const IModelConnectedViewSelector = connectIModelConnection(null, null)(ViewSelector); // eslint-disable-line @typescript-eslint/naming-convention
