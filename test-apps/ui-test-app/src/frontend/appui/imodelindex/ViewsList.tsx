/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ViewsList.scss";
import classnames from "classnames";
import * as React from "react";
import { BeEvent } from "@bentley/bentleyjs-core";
import { IModelReadRpcInterface, ViewDefinitionProps, ViewQueryParams } from "@bentley/imodeljs-common";
import { IModelConnection, ViewState } from "@bentley/imodeljs-frontend";
import { CommonProps, LoadingSpinner } from "@bentley/ui-core";
import ViewItem, { ViewItemProps } from "./ViewItem";

/** Properties for [[ViewsList]] component
 * @internal
 */
export interface ViewsListProps extends CommonProps {
  /** Refresh event: gets called each time the view is changed. Useful to refresh other view-dependent widgets like category and model selector */
  refreshEvent?: BeEvent<(args: any) => void>;
  /** IModelConnection to use to query views */
  iModelConnection?: IModelConnection;
  /** Forced view flags when applying view state, will be spread into the view flags */
  forcedViewFlags?: any;
  /** Show views stored in the iModel */
  showiModelViews?: boolean;
  /** Show sheet views */
  showSheetViews?: boolean;
  /** Show thumbnails on the view items */
  showThumbnails?: boolean;
  /** Show list of thumbnail view */
  detailsView: boolean;
  /** Display errors when doing saved views operations that fail (e.g. creation of a saved view post fails to server). Uses the notification manager */
  displayErrors?: boolean;
  /** Display messages when saved views operations are successful. Uses the notification manager */
  displaySuccess?: boolean;
  /** Apply a filter to the list of views */
  filter: string;
  /** Called when a view is selected */
  onViewsSelected?: (viewState: ViewState[], view: ViewDefinitionProps[]) => void;
  /** Optional class name for the thumbnail in thumbnail view */
  thumbnailViewClassName?: string;
  /** Optional class name for the thumbnail in details view */
  detailsViewClassName?: string;
  /** Show hover indicator in thumbnail view */
  showHoverIndicator?: boolean;
  /** Called after the views have been initialized (loaded) */
  onViewsInitialized: (views: ViewDefinitionProps[]) => void;
  /** Optional content when no views are found */
  noViewsContent?: React.ReactNode;
  /** Multiple or single selection (default) */
  isMultiSelect?: boolean;
}

/** @internal */
interface ViewsListState {
  viewDefinitions: ViewDefinitionProps[];
  filteredViewDefinitions: ViewDefinitionProps[];
  filter: string;
  initialized: boolean;
  detailsView: boolean;
  selectedViews: ViewDefinitionProps[];
}

/** View List Component with functionality to show thumbnails, handle saved view functionality
 * @internal
 */
export class ViewsList extends React.Component<ViewsListProps, ViewsListState> {
  private _viewDefCache: ViewDefinitionProps[] | undefined;

  public static defaultProps: Partial<ViewsListProps> = {
    filter: "",
  };

  /** Sets up initial state */
  constructor(props: ViewsListProps) {
    super(props);

    this.state = {
      viewDefinitions: [],
      filteredViewDefinitions: [],
      filter: "",
      initialized: false,
      detailsView: this.props.detailsView,
      selectedViews: [],
    };
  }

  /** Load views when we mount */
  public override async componentDidMount() {
    if (this.props.iModelConnection) {
      await this.loadViews(this.props.iModelConnection);
    }
  }

  public override async componentDidUpdate(nextProps: ViewsListProps) {
    // if no incoming imodel exists or either the incoming imodel's id or changeset id is different from the current imodel then clear cache
    if (!nextProps.iModelConnection || (this.props.iModelConnection && (this.props.iModelConnection.iModelId !== nextProps.iModelConnection.iModelId || this.props.iModelConnection.changeSetId !== nextProps.iModelConnection.changeSetId))) {
      // Clear cache
      this._viewDefCache = undefined;
      // if incoming imodel exists then load new views
      if (nextProps.iModelConnection) {
        await this.loadViews(nextProps.iModelConnection, true);
      }
    }

    if (nextProps.detailsView !== this.props.detailsView) {
      this.setState({ detailsView: nextProps.detailsView });
    }

    if (nextProps.filter.trim() !== this.props.filter.trim()) {
      await this._setFilter(nextProps.filter.trim());
    }
  }

  /**
   * Check if a view classname is spatial
   * @param classname Classname of the view to check
   */
  public static isSpatial(classname: string): boolean {
    return classname === "BisCore:SpatialViewDefinition" || classname === "BisCore:OrthographicViewDefinition";
  }

  /**
   * Check if a view classname is sheet
   * @param classFullName Classname of the view to check
   */
  public static isSheet(classFullName: string): boolean {
    return classFullName === "BisCore:SheetViewDefinition";
  }

  /**
   * Queries and caches results to get all ViewDefinitionProps in the iModel
   * @param imodel iModel to use for queries
   * @param refresh Force refresh
   */
  public async queryViewProps(imodel: IModelConnection, refresh?: boolean): Promise<ViewDefinitionProps[]> {
    if (!this._viewDefCache || refresh) {
      const params: ViewQueryParams = {};
      params.from = ViewState.classFullName; // use "BisCore.ViewDefinition" as default class name
      params.where = "";
      const viewProps = await IModelReadRpcInterface.getClient().queryElementProps(imodel.getRpcProps(), params);
      this._viewDefCache = viewProps as ViewDefinitionProps[];
    }

    return this._viewDefCache;
  }

  /** Create props for the view item from our properties */
  private _createViewItemProps(_viewProps: ViewDefinitionProps) {
    const props: ViewItemProps = {
      iModelConnection: this.props.iModelConnection,
      viewProps: _viewProps,
      isSelected: (this.state.selectedViews.indexOf(_viewProps) !== -1),
      detailsView: this.state.detailsView,
      showHoverIndicator: this.props.showHoverIndicator,
      onClick: this._handleViewSelected.bind(this),
      showThumbnail: this.props.showThumbnails,
      className: (this.state.detailsView) ? this.props.detailsViewClassName : this.props.thumbnailViewClassName,
    };
    return props;
  }

  /**
   * Loads the view UI items
   * @param refresh Force refresh (e.g. query all views in the file and in BIM Review Share)
   */
  public async loadViews(iModelConnection: IModelConnection, refresh?: boolean) {
    // Query views and add them to state
    const _viewDefProps3d: ViewDefinitionProps[] = [];

    if (this.props.showiModelViews) {
      const viewDefProps = await this.queryViewProps(iModelConnection, refresh);

      viewDefProps.forEach((viewProp: ViewDefinitionProps) => {
        // TODO: We may need to change this code to use the base class somehow since that property was deleted.
        if (this.props.showSheetViews) {
          if (ViewsList.isSheet(viewProp.classFullName)) {
            _viewDefProps3d.push(viewProp);
          }
        } else {
          // TODO: We may need to change this code to use the base class somehow since that property was deleted.
          // if (ViewsList.isSpatial(viewProp.classFullName!)) {
          _viewDefProps3d.push(viewProp);
          // }
        }
      });
    }

    if (this.props.onViewsInitialized)
      this.props.onViewsInitialized(_viewDefProps3d);

    // Set new state with JSX Elements and the view definition props
    this.setState({ viewDefinitions: _viewDefProps3d, filteredViewDefinitions: [], initialized: true, selectedViews: [] });
  }

  /** Handle selecting views by changing it in the selected viewport */
  private _handleViewSelected = async (view: ViewDefinitionProps) => {
    if (!view.id)
      return;

    const selectedViews = [...this.state.selectedViews];
    const index = selectedViews.findIndex((currentView: ViewDefinitionProps) => currentView.id === view.id);

    if (index === -1) {
      if (!this.props.isMultiSelect)
        selectedViews.length = 0;
      selectedViews.push(view); // selected, add the view
    } else {
      selectedViews.splice(index, 1); // unselected, remove the view
    }

    this.setState({ selectedViews });

    if (this.props.onViewsSelected) {
      const viewStates: ViewState[] = [];
      for (const currrentView of selectedViews) {
        const viewState = await this.props.iModelConnection!.views.load(currrentView.id!);
        viewStates.push(viewState);
      }
      this.props.onViewsSelected(viewStates, selectedViews);
    }
  };

  private async _setFilter(_value: string) {
    if (_value === "") {
      this.setState({ filter: _value, filteredViewDefinitions: [] });
    } else {
      // Filter the definitions by user label
      const filteredDefinitions = this.state.viewDefinitions.filter((viewProps: ViewDefinitionProps) => {
        if (viewProps.userLabel)
          return (viewProps.userLabel.toLowerCase().indexOf(_value.toLowerCase()) >= 0);
        else if (viewProps.code && viewProps.code.value)
          return (viewProps.code.value.toLowerCase().indexOf(_value.toLowerCase()) >= 0);

        return false;
      });

      this.setState({ filter: _value, filteredViewDefinitions: filteredDefinitions });
    }
  }

  private renderLoading() {
    return (
      <div className="view-loading">
        <LoadingSpinner />
      </div>
    );
  }

  /** Render the view defs and/or the saved views */
  private renderViews() {
    const views: JSX.Element[] = [];
    let index: number = 0;
    const isFiltering: boolean = this.state.filter.trim().length !== 0;

    const viewDefs = isFiltering ? this.state.filteredViewDefinitions : this.state.viewDefinitions;
    viewDefs.forEach((viewProp: ViewDefinitionProps) => {
      views.push(ViewItem.createItem(this._createViewItemProps(viewProp), index++));
    });

    if (isFiltering && views.length === 0) {
      const message = `No views matching '${this.state.filter}'.`;
      return (
        <div className="view-list-nosearchresults" style={{ fontStyle: "italic" }}>{message}</div>
      );
    }

    if (!isFiltering && views.length === 0) {
      return (
        <div className="view-list-nosearchresults">
          {this.props.noViewsContent && this.props.noViewsContent}
          {!this.props.noViewsContent && <span className="default-prompt">No views found.</span>}
        </div>
      );
    }

    const className = classnames("fade-in", this.state.detailsView ? "view-container-listview" : "view-container-thumbnailview");
    return (
      <div className={className}>{views}</div>
    );
  }

  /** Render list of views */
  public override render() {
    const className = classnames("vl-content", this.props.className);
    return (
      <div className={className}>
        {!this.state.initialized && this.renderLoading()}
        {this.state.initialized && this.renderViews()}
      </div>
    );
  }
}
