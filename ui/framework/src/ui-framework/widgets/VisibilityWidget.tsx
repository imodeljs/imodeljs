/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./VisibilityWidget.scss";
import * as React from "react";
import { BeUiEvent } from "@bentley/bentleyjs-core";
import hierarchyTreeSvg from "@bentley/icons-generic/icons/hierarchy-tree.svg?sprite";
import { IModelApp, IModelConnection, SelectedViewportChangedArgs, Viewport } from "@bentley/imodeljs-frontend";
import { IconSpecUtilities, RelativePosition } from "@bentley/ui-abstract";
import { ContextMenu, ContextMenuItem, SelectionMode } from "@bentley/ui-components";
import { ScrollPositionMaintainer } from "@bentley/ui-core";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { CategoryTreeWithSearchBox } from "../imodel-components/category-tree/CategoriesTreeWithSearchBox";
import { ClassGroupingOption } from "../imodel-components/Common";
import { ModelsTree } from "../imodel-components/models-tree/ModelsTree";
import { ModelsTreeSelectionPredicate } from "../imodel-components/models-tree/ModelsVisibilityHandler";
import { SpatialContainmentTree } from "../imodel-components/spatial-tree/SpatialContainmentTree";
import { connectIModelConnection } from "../redux/connectIModel";
import { UiFramework } from "../UiFramework";
import { WidgetControl } from "../widgets/WidgetControl";
import { Select, SelectOption } from "@itwin/itwinui-react";

// cspell:ignore modeltree
/* eslint-disable deprecation/deprecation */

/**
 * Types of hierarchies displayed in the `VisibilityComponent`
 * @public
 * @deprecated
 */
export enum VisibilityComponentHierarchy {
  Models = "models",
  Categories = "categories",
  SpatialContainment = "spatial-containment",
}

/**
 * Data structure that describes visibility component configuration
 * @beta
 * @deprecated
 */
export interface VisibilityComponentConfig {
  modelsTree?: {
    selectionMode?: SelectionMode;
    selectionPredicate?: ModelsTreeSelectionPredicate;
    enableElementsClassGrouping?: ClassGroupingOption;
    enableHierarchyAutoUpdate?: boolean;
  };
  spatialContainmentTree?: {
    enableElementsClassGrouping?: ClassGroupingOption;
  };
}

/**
 * Props for `VisibilityComponent`
 * @beta
 * @deprecated
 */
export interface VisibilityComponentProps {
  /** iModel whose data should be displayed in the component */
  iModelConnection: IModelConnection;
  /** Viewport to use for controlling display */
  activeViewport?: Viewport;
  /** `React.Ref` to the root HTML element  */
  activeTreeRef?: React.Ref<HTMLDivElement>;
  /** Start pre-loading specified hierarchies as soon as user picks one for display. */
  enableHierarchiesPreloading?: VisibilityComponentHierarchy[];
  /** Configuration parameters */
  config?: VisibilityComponentConfig;
}

interface VisibilityTreeState {
  activeTree: VisibilityComponentHierarchy;
  showOptions: boolean;
  showSearchBox: boolean;
  viewport?: Viewport;
  showAll: BeUiEvent<void>;
  hideAll: BeUiEvent<void>;
}

/** VisibilityComponent React component.
 * @beta
 * @deprecated
 */
// istanbul ignore next
export class VisibilityComponent extends React.Component<VisibilityComponentProps, VisibilityTreeState> {
  private _optionsElement: HTMLElement | null = null;

  constructor(props: any) {
    super(props);
    this.state = {
      activeTree: VisibilityComponentHierarchy.Models, showOptions: false, showSearchBox: false,
      viewport: this.props.activeViewport, showAll: new BeUiEvent<void>(), hideAll: new BeUiEvent<void>(),
    };
  }
  public override async componentDidMount() {
    IModelApp.viewManager.onSelectedViewportChanged.addListener(this._onViewportChangedHandler);
  }

  /** Remove listeners */
  public override componentWillUnmount() {
    IModelApp.viewManager.onSelectedViewportChanged.removeListener(this._onViewportChangedHandler);
  }

  private _onViewportChangedHandler = async (args: SelectedViewportChangedArgs) => {
    if (args.current) {
      this.setState({ viewport: args.current });
    }
  };

  private _onShowOptions = () => {
    this.setState((state) => ({
      showOptions: !state.showOptions,
    }));
  };

  private _onCloseOptions = () => {
    this.setState({ showOptions: false });
  };

  private _onShowTree = (newValue: VisibilityComponentHierarchy) => {
    const activeTree = newValue;
    this.setState({ activeTree, showSearchBox: false });
  };

  private _onSetEnableAll = () => {
    this._onCloseOptions();
    this.state.showAll.emit();
  };

  private _onClearAll = () => {
    this._onCloseOptions();
    this.state.hideAll.emit();
  };

  private _onToggleSearchBox = () => {
    this.setState((prevState) => ({ showSearchBox: !prevState.showSearchBox }));
  };

  private shouldEnablePreloading(hierarchy: VisibilityComponentHierarchy) {
    return this.props.enableHierarchiesPreloading
      && - 1 !== this.props.enableHierarchiesPreloading.indexOf(hierarchy);
  }

  private _renderModelsTree() {
    const { iModelConnection, config } = this.props;
    const { viewport } = this.state;
    return <ModelsTree
      iModel={iModelConnection}
      activeView={viewport}
      rootElementRef={this.props.activeTreeRef}
      enablePreloading={this.shouldEnablePreloading(VisibilityComponentHierarchy.Models)}
      {...config?.modelsTree}
    />;
  }

  private _renderSpatialTree() {
    const { iModelConnection, config } = this.props;
    return <SpatialContainmentTree
      iModel={iModelConnection}
      enablePreloading={this.shouldEnablePreloading(VisibilityComponentHierarchy.SpatialContainment)}
      {...config?.spatialContainmentTree}
    />;
  }

  private _renderCategoriesTree() {
    const { iModelConnection } = this.props;
    const { viewport, showSearchBox, showAll, hideAll } = this.state;
    return <CategoryTreeWithSearchBox // eslint-disable-line deprecation/deprecation
      iModel={iModelConnection}
      activeView={viewport}
      showSearchBox={showSearchBox}
      enablePreloading={this.shouldEnablePreloading(VisibilityComponentHierarchy.Categories)}
      showAll={showAll}
      hideAll={hideAll}
    />;
  }

  private _renderTree() {
    const { activeTree } = this.state;
    return (<div className="uifw-visibility-tree-wrapper">
      {activeTree === VisibilityComponentHierarchy.Models && this._renderModelsTree()}
      {activeTree === VisibilityComponentHierarchy.Categories && this._renderCategoriesTree()}
      {activeTree === VisibilityComponentHierarchy.SpatialContainment && this._renderSpatialTree()}
    </div>);
  }

  public override render() {
    const { iModelConnection } = this.props;
    if (!iModelConnection)
      return (<span>{UiFramework.translate("visibilityWidget.noImodelConnection")}</span>);

    const { activeTree } = this.state;
    const showCategories = true;
    const showContainment = true;
    const searchStyle: React.CSSProperties = {
      opacity: (activeTree === VisibilityComponentHierarchy.Categories) ? 1 : 0,
      visibility: (activeTree === VisibilityComponentHierarchy.Categories) ? "visible" : "hidden",
    };
    const selectOptions: SelectOption<VisibilityComponentHierarchy>[] = [];
    selectOptions.push({ value: VisibilityComponentHierarchy.Models, label: UiFramework.translate("visibilityWidget.modeltree") });
    if (showCategories)
      selectOptions.push({ value: VisibilityComponentHierarchy.Categories, label: UiFramework.translate("visibilityWidget.categories") });
    if (showContainment)
      selectOptions.push({ value: VisibilityComponentHierarchy.SpatialContainment, label: UiFramework.translate("visibilityWidget.containment") });

    return (<div className="uifw-visibility-tree">
      <div className="uifw-visibility-tree-header">
        {/* eslint-disable-next-line jsx-a11y/no-onchange */}
        <Select className="uifw-visibility-tree-select" value={this.state.activeTree} options={selectOptions} onChange={this._onShowTree} />
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <span className="icon icon-search" style={searchStyle} onClick={this._onToggleSearchBox} role="button" tabIndex={-1} />
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <span className="uifw-visibility-tree-options icon icon-more-vertical-2" style={searchStyle} title={UiFramework.translate("visibilityWidget.options")}
          ref={(element) => { this._optionsElement = element; }} onClick={this._onShowOptions.bind(this)} role="button" tabIndex={-1} />
        <ContextMenu parent={this._optionsElement} isOpened={this.state.showOptions} onClickOutside={this._onCloseOptions.bind(this)} position={RelativePosition.BottomRight}>
          <ContextMenuItem key={0} icon="icon-visibility" onClick={this._onSetEnableAll} name={UiFramework.translate("pickerButtons.showAll")} />
          <ContextMenuItem key={1} icon="icon-visibility-hide-2" onClick={this._onClearAll} name={UiFramework.translate("pickerButtons.hideAll")} />
        </ContextMenu>
      </div>
      {this._renderTree()}
    </div>);
  }
}

/** VisibilityComponent that is connected to the IModelConnection property in the Redux store. The application must set up the Redux store and include the FrameworkReducer.
 * @beta
 * @deprecated
 */
export const IModelConnectedVisibilityComponent = connectIModelConnection(null, null)(VisibilityComponent); // eslint-disable-line @typescript-eslint/naming-convention

/** VisibilityWidget React component.
 * @beta
 * @deprecated
 */
// istanbul ignore next
export class VisibilityWidget extends WidgetControl {
  private _activeTreeRef = React.createRef<HTMLDivElement>();
  private _maintainScrollPosition?: ScrollPositionMaintainer;

  public static get iconSpec() {
    return IconSpecUtilities.createSvgIconSpec(hierarchyTreeSvg);
  }

  public static get label() {
    return UiFramework.translate("visibilityWidget.visibilityTree");
  }

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    if (options && options.iModelConnection)
      this.reactNode = <VisibilityComponent iModelConnection={options.iModelConnection} activeViewport={IModelApp.viewManager.selectedView} activeTreeRef={this._activeTreeRef} enableHierarchiesPreloading={options.enableHierarchiesPreloading} config={options.config} />;
    else  // use the connection from redux
      this.reactNode = <IModelConnectedVisibilityComponent activeViewport={IModelApp.viewManager.selectedView} activeTreeRef={this._activeTreeRef} enableHierarchiesPreloading={options.enableHierarchiesPreloading} config={options.config} />;
  }

  public override saveTransientState(): void {
    if (this._activeTreeRef.current)
      this._maintainScrollPosition = new ScrollPositionMaintainer(this._activeTreeRef.current);
  }

  public override restoreTransientState(): boolean {
    if (this._maintainScrollPosition) {
      this._maintainScrollPosition.dispose();
      this._maintainScrollPosition = undefined;
    }
    return true;
  }
}
