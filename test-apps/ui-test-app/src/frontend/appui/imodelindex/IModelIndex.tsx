/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./IModelIndex.scss";
import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { IModelClient, IModelHubClient, IModelQuery, Version, VersionQuery } from "@bentley/imodelhub-client";
import { AuthorizedFrontendRequestContext, IModelConnection } from "@bentley/imodeljs-frontend";
import { LoadingSpinner } from "@bentley/ui-core";
import { UiFramework } from "@bentley/ui-framework";
import { ModelsTab } from "./ModelsTab";
import { SheetsTab } from "./SheetsTab";
import { Tab, Tabs } from "./Tabs";

/* represents a tab item on the IModelIndex page */
interface Category {
  label: string;
  render(): JSX.Element | undefined;
}

/** Properties for the [[IModelIndex]] component
 * @beta
 */
export interface IModelIndexProps {
  /** IModelConnection */
  iModelConnection: IModelConnection;
  /* Open function */
  onOpen?: (viewIds: Id64String[]) => void;
}

interface IModelIndexState {
  iModelName?: string;
  versionName: string;
  versionUserName: string;
  versionDate: string;
  currentCategory: number;
  thumbnail: string | undefined;
  upToDate: boolean;
  checkingUpToDate: boolean;
  header: React.ReactNode | undefined;
  showWaiting: boolean;
}

/**
 * IModelIndex React component
 * @beta
 */
export class IModelIndex extends React.Component<IModelIndexProps, IModelIndexState> {
  private static _categories: Category[] = [];

  constructor(props?: any, context?: any) {
    super(props, context);

    // TODO: registering categories is application specific, move this to Navigator source.
    IModelIndex.RegisterCategory(UiFramework.translate("iModelIndex.views"), this._renderSheets);
    IModelIndex.RegisterCategory(UiFramework.translate("iModelIndex.3dModels"), this._render3dModels);

    this.state = {
      currentCategory: 0, thumbnail: undefined, upToDate: false, header: undefined,
      versionName: "", versionUserName: "", versionDate: "", checkingUpToDate: false, showWaiting: false,
    };
  }

  /* retrieve imodel thumbnail and version information on mount */
  public override async componentDidMount() {
    const projectId = this.props.iModelConnection.contextId!;
    const iModelId = this.props.iModelConnection.iModelId!;

    await this.startRetrieveThumbnail(projectId, iModelId);
    await this.startRetrieveIModelInfo();
  }

  public override componentWillUnmount() {
    // TODO: an application should not have to unregister categories/tabs.
    IModelIndex.UnregisterCategory(UiFramework.translate("iModelIndex.views"));
    IModelIndex.UnregisterCategory(UiFramework.translate("iModelIndex.3dModels"));
  }

  /* register a category (tab) */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public static RegisterCategory(_label: string, _render: () => JSX.Element | undefined) {
    IModelIndex._categories.push({ label: _label, render: _render });
  }

  /* unregister a category (tab) */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public static UnregisterCategory(_label: string) {
    IModelIndex._categories = IModelIndex._categories.filter((_category: Category) => _category.label !== _label);
  }

  /* retrieves the iModel thumbnail. */
  private async startRetrieveThumbnail(projectId: string, iModelId: string) {
    const _thumbnail = await UiFramework.iModelServices.getThumbnail(projectId, iModelId);
    this.setState({ thumbnail: _thumbnail });
  }

  /* retrieve version information */
  private async startRetrieveIModelInfo() {
    const hubClient: IModelClient = new IModelHubClient();
    const requestContext: AuthorizedFrontendRequestContext = await AuthorizedFrontendRequestContext.create();
    const contextId = this.props.iModelConnection.contextId!;
    const iModelId = this.props.iModelConnection.iModelId!;

    /* get the iModel name */
    const imodels = await hubClient.iModels.get(requestContext, contextId, new IModelQuery().byId(iModelId));

    /* get the top named version */
    const _versions: Version[] = await hubClient.versions.get(requestContext, iModelId, new VersionQuery().top(1));

    /* determine if the version is up-to-date */
    const changeSetId = this.props.iModelConnection.changeSetId!;
    const _upToDate = (_versions.length > 0 && _versions[0].changeSetId === changeSetId);

    /* get the version name */
    let currentVersions: Version[] = [];
    let _versionName = "";
    try {
      currentVersions = await hubClient.versions.get(requestContext, iModelId, new VersionQuery().byChangeSet(changeSetId));
      _versionName = (currentVersions.length === 1) ? currentVersions[0].name! : "Version name not found!";
    } catch (e) { }

    this.setState({
      upToDate: _upToDate, checkingUpToDate: false, iModelName: imodels[0].name, versionName: _versionName,
      versionDate: (currentVersions.length === 1) ? this._getReadableDate(currentVersions[0].createdDate) : "",
    });
  }

  /* convert the date to a readable date */
  private _getReadableDate(date?: string) {
    return date ? new Date(date).toDateString() : "";
  }

  /* tab changed */
  private _onTabChanged = (tabIndex: number) => {
    this.setState({ currentCategory: tabIndex, header: undefined });
  };

  // /* header callback - allows the category tabs to render content in the header */
  private _onAddHeader = (_header: React.ReactNode) => {
    this.setState({ header: _header });
  };

  private _onEnter = (viewIds: Id64String[]) => {
    this.setState(
      { showWaiting: true },
      () => {
        if (this.props.onOpen)
          this.props.onOpen(viewIds);
      });
  };

  private _onSetCategory = (category: number) => {
    this.setState({ currentCategory: category, header: undefined });
  };

  /* render the Sheets tab */
  private _renderSheets = () => {
    return (
      <SheetsTab key={1} iModelConnection={this.props.iModelConnection}
        showSheets={true} onAddHeader={this._onAddHeader} onSetCategory={this._onSetCategory}
        onEnter={this._onEnter} />
    );
  };

  /* render the 3d Models tab */
  private _render3dModels = () => {
    return (<ModelsTab key={2} iModelConnection={this.props.iModelConnection}
      showFlatList={true} onEnter={this._onEnter} showToast={false} />);
  };

  private _renderWaiting() {
    return (
      <div className="imodelindex-waiting fade-in">
        <div className="entering-imodel">
          <LoadingSpinner message={UiFramework.translate("iModelIndex.enteriModeling")} />
        </div>
      </div>
    );
  }
  public override render() {
    const statusText = (this.state.upToDate) ? UiFramework.translate("iModelIndex.upToDate") :
      UiFramework.translate("iModelIndex.updatesAvailable");
    return (
      <div className="imodelindex fade-in">
        <div className="imodelindex-header">
          <div className="thumbnail">
            {this.state.thumbnail && <img id="base64image" src={this.state.thumbnail} alt="" />}
            {!this.state.thumbnail && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enableBackground="new 0 0 16 16"><g><path d="M10.3 5.9 7.7 9.3 6 7.6 3 11 13 11z" /><circle cx="4.4" cy="5.9" r="1.3" /><path d="M0,2v12h16V2H0z M14,12H2V4h12V12z" /></g></svg>}
          </div>
          <div className="details">
            <span>{this.state.iModelName}</span>
            <span>{this.state.versionName}</span>
            <span>{this.state.versionDate}</span>
          </div>
          <div className="version">
            {this.state.checkingUpToDate && <span className="checking-updates">Checking for updates...</span>}
            {(!this.state.checkingUpToDate && this.state.upToDate) &&
              <svg className="checkmark success" viewBox="0 0 52 52">
                <circle className="checkmark-circle success" fill="none" cx="26" cy="26" r="25" />
                <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            }
            {(!this.state.checkingUpToDate && !this.state.upToDate) &&
              <svg className="checkmark warning" viewBox="0 0 52 52">
                <circle className="checkmark-circle warning" fill="none" cx="26" cy="26" r="25" />
                <line className="checkmark-check" x1="26" y1="10" x2="26" y2="32" />
                <circle cx="26" cy="38" r="1" />
              </svg>
            }
            {!this.state.checkingUpToDate && <span className="header-version-status">{statusText}</span>}
          </div>
        </div>
        <div className="imodelindex-container">
          <div className="imodelindex-tabheader">
            <Tabs defaultTab={this.state.currentCategory} onClick={this._onTabChanged}>
              {IModelIndex._categories.map((category: Category, i: number) => (
                <Tab key={i} label={category.label} />
              ))}
            </Tabs>
            <div className="header-content">
              {this.state.header}
            </div>
          </div>
          <div className="imodelindex-separator" />
          <div className="imodelindex-tab-content">
            {IModelIndex._categories.length > 0 && IModelIndex._categories[this.state.currentCategory].render()}
          </div>
          {this.state.showWaiting && this._renderWaiting()}
        </div>
      </div>
    );
  }
}
