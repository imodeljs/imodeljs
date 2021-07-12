/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./Common.scss";
import "./IModelViewPicker.scss";
import classnames from "classnames";
import * as React from "react";
import { ViewDefinitionProps, ViewQueryParams } from "@bentley/imodeljs-common";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { IModelInfo, UiFramework } from "@bentley/ui-framework";
import { Button, ProgressRadial } from "@itwin/itwinui-react";

interface ViewCardProps {
  view: ViewDefinitionProps;
  onClick?: () => any;
}

interface ViewCardState {
  isSelected: boolean;
}

class ViewCard extends React.Component<ViewCardProps, ViewCardState> {

  constructor(props?: any, context?: any) {
    super(props, context);

    this.state = { isSelected: false };
  }

  private _onClicked = (_event: React.MouseEvent<HTMLElement>) => {
    this.setState(
      (prevState) => ({ isSelected: !prevState.isSelected }),
      () => {
        if (this.props.onClick)
          this.props.onClick();
      },
    );
  };

  public override render() {
    let name: string | undefined = this.props.view.code.value;
    if (!name)
      return undefined;
    let lastIndex: number;
    if ((name.length > 30) && (-1 !== (lastIndex = name.lastIndexOf("\\"))))
      name = name.substring(lastIndex + 1);
    const cardClassName = classnames("view-card", this.state.isSelected && "isActive");
    return (
      <div className={cardClassName} onClick={this._onClicked}>
        <div className="view-card-content">
          <img className="view-card-thumbnail" src="https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg" alt="" />
          <div className="view-card-name">{name}</div>
        </div>
      </div>
    );
  }
}

/** Properties for the [[IModelViewPicker]] component */
export interface ViewsProps {
  iModelInfo?: IModelInfo;
  iModelConnection?: IModelConnection;
  onViewsSelected?: (views: ViewDefinitionProps[]) => void;
  onClose: () => void;
}

interface ViewsState {
  views?: ViewDefinitionProps[];
  selectedViews: ViewDefinitionProps[];
  waitingForViews: boolean;
}

/**
 * Dialog showing a list of views
 */
export class IModelViewPicker extends React.Component<ViewsProps, ViewsState> {
  private _iModelConnection?: IModelConnection;

  constructor(props?: any, context?: any) {
    super(props, context);
    // start spinning
    this.state = { waitingForViews: true, selectedViews: [] };
  }

  // called when this component is first loaded
  public override async componentDidMount() {
    this.startRetrieveViews(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  private _onClose = () => {
    if (this.props.onClose)
      this.props.onClose();
  };

  private _onViewClick = (view: ViewDefinitionProps) => {
    const views = [...this.state.selectedViews];
    const index = views.findIndex((currentView) => currentView.id === view.id);
    if (index === -1)
      views.push(view); // selected, add the view
    else
      views.splice(index, 1); // unselected, remove the view
    this.setState({ selectedViews: views });
  };

  private _onOKPressed = () => {
    if (this.props.onViewsSelected && this.state.views)
      this.props.onViewsSelected(this.state.selectedViews);
  };

  private async startRetrieveViews() {
    if (this.props.iModelInfo) {
      const projectInfo = this.props.iModelInfo.projectInfo;
      const iModelWsgId = this.props.iModelInfo.wsgId;

      // this.setState({ waitingForViews: true });
      this._iModelConnection = await UiFramework.iModelServices.openIModel(projectInfo.wsgId, iModelWsgId);
    } else if (this.props.iModelConnection) {
      this._iModelConnection = this.props.iModelConnection;
    } else {
      throw Error("IModelViewPicker: Either iModelInfo or iModelConnection must be passed as Props");
    }

    const viewQueryParams: ViewQueryParams = { wantPrivate: false };
    let viewProps: ViewDefinitionProps[] = [];
    try {
      viewProps = await this._iModelConnection.views.queryProps(viewQueryParams);
      this.setState({ views: viewProps, waitingForViews: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log("error getting views", e);
    }
  }

  private renderViews() {
    if (this.state.waitingForViews) {
      return (
        <div className="loading">
          <ProgressRadial size="large" indeterminate />
        </div>
      );
    } else if (this.state.views && this.state.views.length > 0) {
      return (
        <div className="views-list" tabIndex={0}>
          {this.state.views.map((view: ViewDefinitionProps, i: number) => (
            <ViewCard key={i} view={view} onClick={this._onViewClick.bind(this, view)} />
          ))}
        </div>
      );
    } else {
      return (
        <div className="views-empty">
          There are no views defined.
        </div>
      );
    }
  }

  public override render() {
    let iModelName = "";
    if (this.props.iModelInfo)
      iModelName = this.props.iModelInfo.name;
    else if (this.props.iModelConnection)
      iModelName = this.props.iModelConnection.name;

    return (
      <div className="modal-background fade-in-fast">
        <div className="views animate">
          <div className="views-header">
            <h3>Select Views - {iModelName}</h3>
            <span onClick={this._onClose} className="close icon icon-close" title="Close" />
          </div>
          {this.renderViews()}
          <div className="views-footer">
            <Button styleType="high-visibility" data-tg-on={this.state.selectedViews.length} disabled={this.state.selectedViews.length === 0} onClick={this._onOKPressed}>Open</Button>
          </div>
        </div>
      </div>
    );
  }
}
