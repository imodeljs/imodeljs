/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./SheetsTab.scss";
import classnames from "classnames";
import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { ViewDefinitionProps } from "@bentley/imodeljs-common";
import { IModelConnection, ViewState } from "@bentley/imodeljs-frontend";
import { LoadingBar, SearchBox, Timer } from "@bentley/ui-core";
import { UiFramework } from "@bentley/ui-framework";
import { ViewsList } from "./ViewsList";

/** @internal */
export interface SheetsProps {
  /** IModelConnection */
  iModelConnection: IModelConnection;
  /** Show sheets or saved views */
  showSheets: boolean;
  /** Callback to add optional header content */
  onAddHeader: (header: React.ReactNode) => void;
  /** Callback to allow switching tabs (not common) */
  onSetCategory: (tab: number) => void;
  /** Callback to display "loading" when entering an imodel */
  onEnter: (viewIds: Id64String[]) => void;
}

interface SheetsState {
  detailsView: boolean;
  filter: string;
  showPrompt: boolean;
  percent: number;
  selectedViews: ViewState[];
  isOpenDisabled: boolean;
}

/**
 * SheetsTab
 * @internal
 */
export class SheetsTab extends React.Component<SheetsProps, SheetsState> {
  private _timer = new Timer(300);
  private static _viewsInitialized: boolean = false;

  constructor(props?: any, context?: any) {
    super(props, context);

    this.state = { detailsView: false, filter: "", showPrompt: false, percent: 0, selectedViews: [], isOpenDisabled: true };
  }

  public override componentDidMount() {
    this._updateHeaderContent();
  }

  public override componentWillUnmount(): void {
    this._timer.stop();
  }

  /** filter the views */
  private async _handleSearchChanged(value: string) {
    this.setState({ filter: value });
  }

  /** show details or thumbnail view */
  private _onChangeView(_detailsView: boolean) {
    this.setState({ detailsView: _detailsView }, () => { this._updateHeaderContent(); });
  }

  /* sheet has been selected */
  private _onSheetViewsSelected(views: ViewState[]) {
    this.setState({ selectedViews: views, isOpenDisabled: views.length === 0 });
  }

  /* open into the iModel */
  private _onOpen = () => {
    this.setState({ isOpenDisabled: true });

    const ids: Id64String[] = [];
    this.state.selectedViews.forEach((view: ViewState) => { ids.push(view.id); });
    this.props.onEnter(ids);
  };

  private _updateHeaderContent() {
    const classThumbnails = classnames("viewtype icon icon-thumbnails", !this.state.detailsView && "active");
    const classDetails = classnames("viewtype icon icon-list", this.state.detailsView && "active");
    this.props.onAddHeader(
      <>
        <SearchBox placeholder="Search Views..." onValueChanged={this._handleSearchChanged.bind(this)} />
        <span className={classDetails} title="List" onClick={this._onChangeView.bind(this, true)} />
        <span className={classThumbnails} title="Thumbnails" onClick={this._onChangeView.bind(this, false)} />
      </>);
  }

  private _onViewsInitialized(views: ViewDefinitionProps[]) {
    if (!SheetsTab._viewsInitialized) {
      if (views.length === 0) {
        this.setState({ showPrompt: true }, () => {
          this._timer.setOnExecute(() => this._updatePercent());
          this._timer.start();
        });
      }
      SheetsTab._viewsInitialized = true;
    }
  }

  private _updatePercent() {
    if (this.state.percent === 100) {
      this.props.onSetCategory(1);
    } else {
      this.setState((prevState) => ({ percent: prevState.percent + 10 }), () => { this._timer.start(); });
    }
  }

  private _onRenderPrompt() {
    return (
      <div className="no-views-alert">
        <span>No saved views were found.</span>
        <br />
        <span>Switching you to the 3D Models tab...</span>
        <LoadingBar style={{ marginTop: "25px" }} barHeight={2} percent={this.state.percent} />
      </div>
    );
  }

  public override render() {
    const label = UiFramework.translate("iModelIndex.enteriModel");
    return (
      <div className="viewstab-container">
        <ViewsList
          iModelConnection={this.props.iModelConnection}
          isMultiSelect={true}
          showiModelViews={true}
          showSheetViews={false}
          showThumbnails={true}
          showHoverIndicator={true}
          detailsView={this.state.detailsView}
          thumbnailViewClassName="imodelindex-thumbnailView"
          detailsViewClassName="imodelindex-detailsView"
          onViewsSelected={this._onSheetViewsSelected.bind(this)}
          filter={this.state.filter}
          onViewsInitialized={this._onViewsInitialized.bind(this)} />
        <button className="open-button" disabled={this.state.isOpenDisabled} type="button" onClick={this._onOpen.bind(this)}>{label}</button>
        {this.state.showPrompt && this._onRenderPrompt()}
      </div>
    );
  }
}
