/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./IModelCard.scss";
import * as React from "react";
import { IModelInfo, UiFramework } from "@bentley/ui-framework";
import { ProgressRadial } from "@itwin/itwinui-react";

// import { IModelViewPicker } from "./IModelViewPicker";

/** Properties for the [[IModelCard]] component */
export interface IModelCardProps {
  showDescription?: boolean;
  iModel: IModelInfo;
  onSelectIModel?: (iModelInfo: IModelInfo) => void;
}

interface IModelCardState {
  waitingForThumbnail: boolean;
  showOptions: boolean;
}

/**
 * Card representing a single IModel
 */
export class IModelCard extends React.Component<IModelCardProps, IModelCardState> {

  constructor(props: IModelCardProps, context?: any) {
    super(props, context);
    this.state = { waitingForThumbnail: false, showOptions: false };
  }

  public static defaultProps: Partial<IModelCardProps> = {
    showDescription: true,
  };

  // called when this component is first loaded
  public override async componentDidMount() {
    // we don't get the thumbnail until it's needed.
    if (!this.props.iModel.thumbnail)
      this.startRetrieveThumbnail(this.props.iModel); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  // retrieves the IModels for a Project. Called when first mounted and when a new Project is selected.
  private async startRetrieveThumbnail(thisIModel: IModelInfo) {
    this.setState({ waitingForThumbnail: true });
    thisIModel.thumbnail = await UiFramework.iModelServices.getThumbnail(thisIModel.projectInfo.wsgId, thisIModel.wsgId);
    this.setState({ waitingForThumbnail: false });
  }

  private _onCardClicked = () => {
    if (this.props.onSelectIModel)
      this.props.onSelectIModel(this.props.iModel);
  };

  private renderDescription() {
    if (this.props.iModel.description && this.props.iModel.description.length > 0) {
      return (
        <span className="imodel-card-description">{this.props.iModel.description}</span>
      );
    } else {
      return (
        <span className="imodel-card-description" style={{ fontStyle: "italic" }}>No description</span>
      );
    }
  }

  public renderThumbnail() {
    if (this.state.waitingForThumbnail) {
      return (
        <div className="preview-loader">
          <ProgressRadial size="large" indeterminate />
        </div>
      );
    } else if (this.props.iModel.thumbnail) {
      return (
        <div className="preview-container">
          <img className="thumbnail" id="base64image" src={this.props.iModel.thumbnail} alt="" />
          <span className="open">Open</span>
        </div>
      );
    } else {
      return (
        <div className="preview-container">
          <span className="icon icon-placeholder" />
          <span className="open">Open</span>
        </div>
      );
    }
  }

  public override render() {
    return (
      <div className="imodel-card" >
        <div className="imodel-card-content" >
          <div className="imodel-card-preview" onClick={this._onCardClicked}>
            {this.renderThumbnail()}
          </div>
          <div className="imodel-card-name">
            <span className="text">{this.props.iModel.name}</span>
          </div>
          {this.props.showDescription && this.renderDescription()}
        </div>
      </div>
    );
  }
}
