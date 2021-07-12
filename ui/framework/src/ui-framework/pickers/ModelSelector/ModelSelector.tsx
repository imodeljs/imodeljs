/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Picker
 */

import "./ModelSelector.scss";
import classnames from "classnames";
import * as _ from "lodash";
import * as React from "react";
import { ModelProps, ModelQueryParams } from "@bentley/imodeljs-common";
import { IModelApp, SpatialModelState, SpatialViewState, Viewport } from "@bentley/imodeljs-frontend";
import { RegisteredRuleset } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import { LoadingSpinner, SpinnerSize } from "@bentley/ui-core";
import { ConfigurableCreateInfo } from "../../configurableui/ConfigurableUiControl";
import { ConfigurableUiManager } from "../../configurableui/ConfigurableUiManager";
import { UiFramework } from "../../UiFramework";
import { WidgetControl } from "../../widgets/WidgetControl";
import { ListItem, ListItemType } from "../ListPicker";
import { Groups, ModelGroup, ModelSelectorDataProvider, ModelSelectorWidgetProps, ModelSelectorWidgetState } from "./ModelSelectorDefinitions";
import { CategoryModelTree } from "./ModelSelectorTree";

/**
 * Model Selector [[WidgetControl]]
 * @internal
 */
// istanbul ignore next
export class ModelSelectorWidgetControl extends WidgetControl {
  /** Creates a ModelSelectorDemoWidget */
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = (
      // eslint-disable-next-line deprecation/deprecation
      <ModelSelectorWidget iModelConnection={options.iModelConnection} />
    );
  }
}

/**
 * Widget that manages category and model visibility via [[CategoryModelTree]]
 * @internal
 * @deprecated - Use [[VisibilityTree]] instead
 */
// istanbul ignore next
export class ModelSelectorWidget extends React.Component<ModelSelectorWidgetProps, ModelSelectorWidgetState> {
  private _groups: ModelGroup[] = [];
  private _modelRuleset?: RegisteredRuleset;
  private _categoryRuleset?: RegisteredRuleset;
  private _isMounted = false;

  /** Creates a ModelSelectorWidget */
  constructor(props: ModelSelectorWidgetProps) {
    super(props);
    this._initState();
  }

  /** @internal */
  public override async componentDidMount() {
    this._isMounted = true;
    await this.initialize();
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  private async initialize() {
    await this._initModelState();
    await this._initCategoryState();
    this._initGroups();

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        activeGroup: this._groups[0],
        activeRuleset: this._modelRuleset,
      });
  }

  /** Initializes category/model groups and contents */
  private _initGroups = () => {
    this._groups.push(this._getDefaultModelGroup());
    this._groups.push(this._getDefaultCategoryGroup());
  };

  /** Initializes state to default values */
  private _initState = () => {
    this.state = { // eslint-disable-line react/no-direct-mutation-state
      activeView: (this.props.activeView ||
        IModelApp.viewManager.getFirstOpenView())!,
    };
  };

  /** Initialize models */
  private _initModelState = async () => {
    const ruleset = await Presentation.presentation
      .rulesets()
      .add(require("../../../../rulesets/Models.json")); // eslint-disable-line @typescript-eslint/no-var-requires

    this._modelRuleset = ruleset;

    await this._setViewType(ruleset);
    this._updateModelsWithViewport(this.state.activeView); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  /** Initialize categories */
  private _initCategoryState = async () => {
    const ruleset = await Presentation.presentation
      .rulesets()
      .add(require("../../../../rulesets/Categories.json")); // eslint-disable-line @typescript-eslint/no-var-requires
    this._categoryRuleset = ruleset;

    await this._setViewType(ruleset);
    this._updateCategoriesWithViewport(this.state.activeView); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  /**
   * Sets provided ruleset as new ruleset for tree.
   * @param ruleset Ruleset to provide to tree.
   */
  private _setViewType = async (ruleset: RegisteredRuleset) => {
    if (!IModelApp.viewManager || !this.state.activeView) return;

    const view = this.state.activeView.view as SpatialViewState;
    const viewType = view.is3d() ? "3d" : "2d";
    await Presentation.presentation
      .vars(ruleset.id)
      .setString("ViewType", viewType); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  /**
   * Creates initial model group
   * @returns Initialized model group
   */
  private _getDefaultModelGroup = () => {
    return {
      id: Groups.Models,
      ruleset: this._modelRuleset!,
      dataProvider: new ModelSelectorDataProvider(
        this.props.iModelConnection,
        this._modelRuleset!.id,
      ),
      label: UiFramework.translate("categoriesModels.models"),
      items: [],
      setEnabled: this._onModelsChecked,
    };
  };

  private async _updateModelsWithViewport(vp?: Viewport) {
    // Query models and add them to state
    if (!vp || !(vp.view instanceof SpatialViewState)) return;

    const modelQueryParams: ModelQueryParams = {
      from: SpatialModelState.classFullName,
      wantPrivate: false,
    };
    let curModelProps: ModelProps[] = new Array<ModelProps>();

    if (this.props.iModelConnection)
      curModelProps = await this.props.iModelConnection.models.queryProps(
        modelQueryParams,
      );

    const models: ListItem[] = [];
    for (const modelProps of curModelProps) {
      const model: ListItem = {
        key: modelProps.id ? modelProps.id.toString() : "",
        name: modelProps.name ? modelProps.name : "",
        enabled: modelProps.id
          ? vp.view.modelSelector.has(modelProps.id)
          : false,
        type: ListItemType.Item,
      };
      models.push(model);
    }

    this._groups[0].items = models;

    this.forceUpdate();
  }

  /** Modify viewport to display checked models */
  private _onModelsChecked = (items: ListItem[], checked: boolean) => {
    if (!IModelApp.viewManager) return;

    for (const vp of IModelApp.viewManager) {
      if (!(vp.view instanceof SpatialViewState)) continue;

      const modelIds = items.map((item) => {
        item.enabled = checked;
        return item.key;
      });

      if (checked) {
        vp.addViewedModels(modelIds); // eslint-disable-line @typescript-eslint/no-floating-promises
      } else {
        vp.changeModelDisplay(modelIds, checked);
      }
    }
  };

  /**
   * Creates initial category group
   * @returns Initialized category group
   */
  private _getDefaultCategoryGroup = () => {
    return {
      id: Groups.Categories,
      ruleset: this._categoryRuleset!,
      dataProvider: new ModelSelectorDataProvider(
        this.props.iModelConnection,
        this._categoryRuleset!.id,
      ),
      label: UiFramework.translate("categoriesModels.categories"),
      items: [],
      setEnabled: this._onCategoriesChecked,
    };
  };

  /** Modify viewport to display checked categories */
  private _onCategoriesChecked = (items: ListItem[], checked: boolean) => {
    if (!IModelApp.viewManager || !IModelApp.viewManager.selectedView) return;

    const keys: string[] = [];
    items.forEach((item) => {
      item.enabled = checked;
      keys.push(item.key);
    });

    const updateViewport = (vp: Viewport) => {
      // Only act on viewports that are both 3D or both 2D. Important if we have multiple viewports opened and we
      // are using 'allViewports' property
      if (
        IModelApp.viewManager.selectedView &&
        IModelApp.viewManager.selectedView.view.is3d() === vp.view.is3d()
      ) {
        vp.changeCategoryDisplay(keys, checked);
      }
    };

    // This property let us act on all viewports or just on the selected one, configurable by the app
    if (this.props.allViewports) {
      for (const viewport of IModelApp.viewManager) {
        updateViewport(viewport);
      }
    } else if (IModelApp.viewManager.selectedView) {
      updateViewport(IModelApp.viewManager.selectedView);
    }

    // this._updateCategoriesWithViewport(IModelApp.viewManager.selectedView); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private async _updateCategoriesWithViewport(vp?: Viewport) {
    if (!vp) return;

    // Query categories and add them to state
    const selectUsedSpatialCategoryIds =
      "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
    const selectUsedDrawingCategoryIds =
      "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement2d WHERE Model.Id=? AND Category.Id IN (SELECT ECInstanceId from BisCore.DrawingCategory)";
    const ecsql = vp.view.is3d()
      ? selectUsedSpatialCategoryIds
      : selectUsedDrawingCategoryIds;
    const ecsql2 =
      // eslint-disable-next-line prefer-template
      "SELECT ECInstanceId as id, UserLabel as label, CodeValue as code FROM " +
      (vp.view.is3d() ? "BisCore.SpatialCategory" : "BisCore.DrawingCategory") +
      " WHERE ECInstanceId IN (" +
      ecsql +
      ")";
    const rows = [];

    if (this.props.iModelConnection) {
      const rowIterator = this.props.iModelConnection.query(ecsql2);
      for await (const row of rowIterator) {
        rows.push(row);
      }
    }

    const categories: ListItem[] = [];
    for (const row of rows) {
      const category: ListItem = {
        key: row.id as string,
        enabled: vp.view.categorySelector.has(row.id as string),
        type: ListItemType.Item,
      };
      categories.push(category);
    }

    this._groups[1].items = categories;

    this.forceUpdate();
  }

  /** @internal */
  public override render() {
    return (
      <div className="uifw-widget-picker" data-testid="model-selector-widget">
        {!this.state.activeRuleset && (
          <LoadingSpinner size={SpinnerSize.Medium} />
        )}
        {this.state.activeRuleset && (
          <>
            {this._getGroupTabs()}
            {this._getTabContent()}
          </>
        )}
      </div>
    );
  }

  private _getGroupTabs = () => {
    const activeClassName = classnames(
      this.state.activeGroup!.label && "active",
    );
    return (
      <div>
        <ul className="uifw-category-model-horizontal-tabs" role="tablist">
          {this._groups.map((group: any) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={group.id}
              className={
                group.label === this.state.activeGroup!.label
                  ? activeClassName
                  : ""
              }
              onClick={this._onExpand.bind(this, group)}
              role="tab"
            >
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a>{group.label}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  private _onExpand = async (group: ModelGroup) => {
    if (this._isMounted) this.setState({ activeGroup: group });
  };

  private _getTabContent = () => {
    return (
      <CategoryModelTree // eslint-disable-line deprecation/deprecation
        key={this.state.activeGroup!.id}
        iModelConnection={this.props.iModelConnection}
        activeGroup={this.state.activeGroup!}
        activeView={this.state.activeView}
      />
    );
  };
}

ConfigurableUiManager.registerControl(
  "ModelSelectorWidget",
  ModelSelectorWidgetControl,
);
