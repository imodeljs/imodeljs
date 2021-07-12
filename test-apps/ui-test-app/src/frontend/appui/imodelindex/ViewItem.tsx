/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ViewItem.scss";
import classnames from "classnames";
import * as React from "react";
import { ThumbnailProps, ViewDefinitionProps } from "@bentley/imodeljs-common";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { CommonProps, LoadingSpinner } from "@bentley/ui-core";

class ThumbnailCache {
  private static _thumbnails: Map<string, ThumbnailProps | undefined> = new Map<string, ThumbnailProps>();

  /** Caches thumbnails */
  public static async getThumbnail(iModelConnection: IModelConnection | undefined, viewProps: ViewDefinitionProps) {
    const viewId = viewProps.id!;
    // eslint-disable-next-line no-console
    console.log(`Retrieving thumbnail for iModel=${iModelConnection!.name} view=${viewId}`);

    if (ThumbnailCache._thumbnails.has(viewId.toString()))
      return ThumbnailCache._thumbnails.get(viewId.toString());
    else if (iModelConnection) {
      let thumbnail: ThumbnailProps | undefined;
      try {
        thumbnail = await iModelConnection.views.getThumbnail(viewProps.id!);
      } catch {
        if (!thumbnail) {
          // eslint-disable-next-line no-console
          console.log("Failed to obtain a thumbnail from the iModel");
        }
      }

      // There are cases where the file may not have a thumbnail for the view
      // Set even if undefined so that we avoid querying over and over again
      ThumbnailCache._thumbnails.set(viewId.toString(), thumbnail);
      return thumbnail;
    }
    return undefined;
  }
}

/** Properties for [[ViewItem]] component
 * @internal
 */
export interface ViewItemProps extends CommonProps {
  /** View definition */
  viewProps: ViewDefinitionProps;
  /** IModelConnection to retrieve the thumbnail */
  iModelConnection: IModelConnection | undefined;
  /** Show thumbnails on the view items */
  showThumbnail?: boolean;
  /** Create view item in either details or thumbnail view */
  detailsView?: boolean;
  /** Determine if view is selected or not */
  isSelected?: boolean;
  /** Show hover indicator */
  showHoverIndicator?: boolean;
  /** Called when the view is clicked */
  onClick: (viewProps: ViewDefinitionProps) => void;
}

/** @internal */
interface ViewItemState {
  thumbnail: any;
  waitingForThumbnail: boolean;
}

/** Button containing thumbnail and view name
 * @internal
 */
export default class ViewItem extends React.Component<ViewItemProps, ViewItemState> {

  constructor(props: ViewItemProps) {
    super(props);

    this.state = { thumbnail: undefined, waitingForThumbnail: true };
  }

  /** Load thumbnail from the iModelConnection if necessary */
  public override async componentDidMount() {
    if (this.props.showThumbnail) {
      const thumbnail = await ThumbnailCache.getThumbnail(this.props.iModelConnection, this.props.viewProps);
      if (thumbnail) {
        const blob = new Blob([thumbnail.image], { type: `image/${thumbnail.format}` });
        // Load thumbnails
        this.setState({ thumbnail: URL.createObjectURL(blob) });
      }
    }
    this.setState({ waitingForThumbnail: false });
  }

  public get viewDefinition(): ViewDefinitionProps {
    return this.props.viewProps;
  }

  public static createItem(props: ViewItemProps, _key: any) {
    return <ViewItem {...props} key={_key} />;
  }

  private _onClick = () => {
    this.props.onClick(this.props.viewProps);
  };

  public renderThumbnail() {
    if (this.state.waitingForThumbnail) {
      return (
        <LoadingSpinner />
      );
    } else if (this.state.thumbnail === undefined) {
      return (
        <svg className="no-thumbnail" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enableBackground="new 0 0 16 16"><g><path d="M10.3 5.9 7.7 9.3 6 7.6 3 11 13 11z" /><circle cx="4.4" cy="5.9" r="1.3" /><path d="M0,2v12h16V2H0z M14,12H2V4h12V12z" /></g></svg>
      );
    } else {
      return (
        <>
          <img src={this.state.thumbnail} alt="" />
          {this.props.showHoverIndicator && <span className="open">Open</span>}
        </>
      );
    }
  }

  public override render() {
    const label = this.props.viewProps.userLabel ? this.props.viewProps.userLabel : this.props.viewProps.code.value;
    return (
      <>
        {this.props.detailsView &&
          <div className={classnames("view-list-item", this.props.isSelected && "selected", this.props.className)} style={this.props.style} onClick={this._onClick}>
            <div className="view-item-thumbnail-container thumbnail-container-small">
              {this.renderThumbnail()}
            </div>
            <span title={label}>{label}</span>
          </div>
        }
        {!this.props.detailsView &&
          <div className={classnames("view-list-item-thumbnail", this.props.isSelected && "selected", this.props.className)} style={this.props.style} onClick={this._onClick}>
            <div className="view-item-thumbnail-container">
              {this.renderThumbnail()}
            </div>
            <div className="view-item-label-thumbnail" title={label}>
              <span>{label}</span>
            </div>
          </div>
        }
      </>
    );
  }
}
