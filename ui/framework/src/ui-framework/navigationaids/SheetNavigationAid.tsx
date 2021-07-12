/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import "./SheetNavigationAid.scss";
import classnames from "classnames";
import * as React from "react";
import { IModelApp, IModelConnection, ScreenViewport, SelectedViewportChangedArgs } from "@bentley/imodeljs-frontend";
import { UiComponents, ViewIdChangedEventArgs, ViewportComponentEvents } from "@bentley/ui-components";
import { CommonProps } from "@bentley/ui-core";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { FrontstageManager, ModalFrontstageInfo } from "../frontstage/FrontstageManager";
import { UiFramework } from "../UiFramework";
import { ViewUtilities } from "../utils/ViewUtilities";
import { NavigationAidControl } from "./NavigationAidControl";
import { CardContainer, CardSelectedEventArgs, SheetsModalFrontstage } from "./SheetsModalFrontstage";
import { ProgressRadial } from "@itwin/itwinui-react";

/** A Sheet Navigation Aid control.
 * @alpha
 */
export class SheetNavigationAidControl extends NavigationAidControl {
  public static navigationAidId = "SheetNavigationAid";

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this.reactNode = <SheetNavigationAid iModelConnection={options.imodel} />;
  }

  public override getSize(): string | undefined { return "96px"; }
}

/** Data displayed about sheet
 * @alpha
 */
export interface SheetData {
  name: string;
  viewId: string;
}

/** Properties for the [[SheetNavigationAid]] component
 * @alpha
 */
export interface SheetNavigationProps extends CommonProps {
  iModelConnection: IModelConnection;
}

/** @internal */
interface SheetNavigationState {
  index: number;
  sheetData: SheetData[];
}

/** A Sheet Navigation Aid.
 * @alpha
 */
export class SheetNavigationAid extends React.Component<SheetNavigationProps, SheetNavigationState> {
  private _isMounted = false;

  /** @internal */
  public override readonly state: Readonly<SheetNavigationState> = {
    index: 0,
    sheetData: [],
  };

  private _viewport: ScreenViewport | undefined;

  constructor(props: SheetNavigationProps) {
    super(props);

    this._viewport = IModelApp.viewManager.selectedView;
  }

  /** Adds listeners when components mounts */
  public override async componentDidMount() {
    this._isMounted = true;

    CardContainer.onCardSelectedEvent.addListener(this._handleCardSelected);
    ViewportComponentEvents.onViewIdChangedEvent.addListener(this._handleViewIdChanged);

    IModelApp.viewManager.onSelectedViewportChanged.addListener(this._handleSelectedViewportChanged);

    const stateData = await this._setupSheets();

    if (this._isMounted)
      this.setState(stateData);
  }

  /** Removes listeners when component will unmount */
  public override componentWillUnmount() {
    this._isMounted = false;

    CardContainer.onCardSelectedEvent.removeListener(this._handleCardSelected);
    ViewportComponentEvents.onViewIdChangedEvent.removeListener(this._handleViewIdChanged);

    IModelApp.viewManager.onSelectedViewportChanged.removeListener(this._handleSelectedViewportChanged);
  }

  /** Queries for sheet info and sets as sheetData */
  private async _setupSheets(): Promise<SheetNavigationState> {
    const stateData: SheetNavigationState = {
      index: 0,
      sheetData: [],
    };

    // istanbul ignore else
    if (!this.props.iModelConnection || !this.props.iModelConnection.views.getViewList)
      return stateData;

    // istanbul ignore next
    let viewId = "";
    // istanbul ignore next
    if (this._viewport) {
      viewId = this._viewport.view.id.toString();
    }

    // istanbul ignore next
    const sheets = await this.props.iModelConnection.views.getViewList({ from: "BisCore.SheetViewDefinition" });
    // istanbul ignore next
    sheets.forEach((viewSpec: IModelConnection.ViewSpec, index: number) => {
      stateData.sheetData.push({ name: viewSpec.name, viewId: viewSpec.id });
      if (viewSpec.id === viewId)
        stateData.index = index;
    });

    // istanbul ignore next
    return stateData;
  }

  /** @internal */
  public override render(): React.ReactNode {
    const name = (this.state.sheetData.length > 0) ? /* istanbul ignore next */ this.state.sheetData[this.state.index].name : "";
    const sheet = UiFramework.translate("general.sheet");
    const ofStr = UiComponents.translate("general.of");
    const leftIndex = this.state.index === 0 ? this.state.sheetData.length - 1 : /* istanbul ignore next */ this.state.index - 1;
    const rightIndex = this.state.index >= this.state.sheetData.length - 1 ? 0 : /* istanbul ignore next */this.state.index + 1;
    const leftTitle = this.state.sheetData[leftIndex] ? /* istanbul ignore next */ this.state.sheetData[leftIndex].name : undefined;
    const rightTitle = this.state.sheetData[rightIndex] ? /* istanbul ignore next */ this.state.sheetData[rightIndex].name : undefined;

    let content: React.ReactNode;
    // istanbul ignore if
    if (this.state.sheetData.length > 0) {
      content = (
        <>
          <div className="sheet-title">{sheet}</div>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <div className="sheet-name" title={name} onClick={this._handleOnClickSheetName}
            role="button" tabIndex={-1}>
            {name}
          </div>
          <div className="sheet-container">
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div className="sheet-caret icon icon-caret-left" onClick={this._handleOnClickLeftArrow}
              role="button" tabIndex={-1} title={leftTitle} />
            <div>{this.state.index + 1} {ofStr} {this.state.sheetData.length}</div>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div className="sheet-caret icon icon-caret-right" onClick={this._handleOnClickRightArrow}
              role="button" tabIndex={-1} title={rightTitle} />
          </div>
        </>
      );
    } else {
      content = <ProgressRadial size="x-small" indeterminate />;
    }

    return (
      <div className={classnames("uifw-sheet-navigation", this.props.className)} style={this.props.style}>
        <div className="gradient"></div>
        {content}
      </div>
    );
  }

  /** Sets index of newly selected card */
  private _handleCardSelected = (event: CardSelectedEventArgs) => {
    event && this.setState({
      index: event.index,
    });
  };

  /** Updates view to the next lowest index in sheetData */
  // istanbul ignore next
  private _handleOnClickLeftArrow = () => {
    this.setState(
      (prevState) => ({ index: prevState.index <= 0 ? prevState.sheetData.length - 1 : prevState.index - 1 }),
      async () => this._updateView());
  };

  /** Updates view to next highest index in sheetData */
  // istanbul ignore next
  private _handleOnClickRightArrow = () => {
    this.setState(
      (prevState) => ({ index: (prevState.index + 1) % prevState.sheetData.length }),
      async () => this._updateView());
  };

  /** Handles a Viewport change & synchs the index */
  // istanbul ignore next
  private _handleSelectedViewportChanged = (args: SelectedViewportChangedArgs) => {
    if (args.current) {
      this._handleViewportChanged(args.current);
    }
  };

  // istanbul ignore next
  private _handleViewIdChanged = (args: ViewIdChangedEventArgs) => {
    if (this._viewport === args.viewport)
      this._handleViewportChanged(args.viewport as ScreenViewport);
  };

  /** Handles a Viewport change & synchs the index */
  // istanbul ignore next
  private _handleViewportChanged = (viewport: ScreenViewport) => {
    const className = ViewUtilities.getBisBaseClass(viewport.view.classFullName);

    if (ViewUtilities.isSheet(className)) {
      this._viewport = viewport;

      const viewId = this._viewport.view.id.toString();

      const index = this.state.sheetData.findIndex((sheetData: SheetData) => {
        return (viewId === sheetData.viewId);
      });

      if (index >= 0)
        this.setState({ index });
    }
  };

  /** Updates view to currently set sheet */
  // istanbul ignore next
  private async _updateView() {
    const viewState = await this.props.iModelConnection.views.load(this.state.sheetData[this.state.index].viewId);
    if (this._viewport)
      this._viewport.changeView(viewState);
  }

  /** Creates a new SheetsModalFrontstage */
  // istanbul ignore next
  private modalFrontstage(): ModalFrontstageInfo {
    return new SheetsModalFrontstage(this.state.sheetData, this.props.iModelConnection, this.state.index);
  }

  /** Opens a new SheetsModelFrontstage on sheetName click */
  // istanbul ignore next
  private _handleOnClickSheetName = () => {
    FrontstageManager.openModalFrontstage(this.modalFrontstage());
  };
}
