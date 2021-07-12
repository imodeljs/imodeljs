/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./App.css";
import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
import * as React from "react";
import { Geometry } from "@bentley/geometry-core";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { DefaultContentDisplayTypes, PresentationUnitSystem } from "@bentley/presentation-common";
import {
  DataProvidersFactory, IPresentationPropertyDataProvider, IPresentationTableDataProvider, UnifiedSelectionContextProvider,
} from "@bentley/presentation-components";
import { Presentation, SelectionChangeEventArgs } from "@bentley/presentation-frontend";
import { PropertyRecord } from "@bentley/ui-abstract";
import { ElementSeparator, Orientation, RatioChangeResult } from "@bentley/ui-core";
import { MyAppFrontend, MyAppSettings } from "../../api/MyAppFrontend";
import FindSimilarWidget from "../find-similar-widget/FindSimilarWidget";
import { GridWidget } from "../grid-widget/GridWidget";
import { IModelSelector } from "../imodel-selector/IModelSelector";
import { PropertiesWidget } from "../properties-widget/PropertiesWidget";
import { RulesetSelector } from "../ruleset-selector/RulesetSelector";
import { TreeWidget } from "../tree-widget/TreeWidget";
import { UnitSystemSelector } from "../unit-system-selector/UnitSystemSelector";
import ViewportContentControl from "../viewport/ViewportContentControl";
import { ToggleSwitch } from "@itwin/itwinui-react";

export interface State {
  imodel?: IModelConnection;
  imodelPath?: string;
  currentRulesetId?: string;
  rightPaneRatio: number;
  rightPaneHeight?: number;
  contentRatio: number;
  contentWidth?: number;
  similarInstancesProvider?: IPresentationTableDataProvider;
  activeUnitSystem?: PresentationUnitSystem;
  persistSettings: boolean;
}

export default class App extends React.Component<{}, State> {
  private readonly _minRightPaneRatio = 0.3;
  private readonly _maxRightPaneRatio = 0.7;
  private readonly _minContentRatio = 0.2;
  private readonly _maxContentRatio = 0.9;
  private _rightPaneRef = React.createRef<HTMLDivElement>();
  private _contentRef = React.createRef<HTMLDivElement>();
  private _selectionListener!: () => void;

  constructor() {
    super({});
    this.state = {
      activeUnitSystem: Presentation.presentation.activeUnitSystem,
      rightPaneRatio: 0.5,
      contentRatio: 0.7,
      persistSettings: MyAppFrontend.settings.persistSettings,
    };
  }

  private updateAppSettings() {
    const settings: MyAppSettings = {
      persistSettings: this.state.persistSettings,
    };
    if (this.state.persistSettings) {
      settings.imodelPath = this.state.imodelPath;
      settings.rulesetId = this.state.currentRulesetId;
      settings.unitSystem = this.state.activeUnitSystem;
    }
    MyAppFrontend.settings = settings;
  }

  private loadAppSettings() {
    const settings = MyAppFrontend.settings;
    const update: Partial<State> = {
      persistSettings: settings.persistSettings,
    };
    if (settings.persistSettings) {
      update.imodelPath = settings.imodelPath;
      update.currentRulesetId = settings.rulesetId;
      update.activeUnitSystem = settings.unitSystem;
    }
    this.setState(update as State);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onIModelSelected = async (imodel: IModelConnection | undefined, path?: string) => {
    this.setState({ imodel, imodelPath: path }, () => this.updateAppSettings());
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onRulesetSelected = (rulesetId: string | undefined) => {
    if (this.state.imodel)
      Presentation.selection.clearSelection("onRulesetChanged", this.state.imodel, 0);

    this.setState({ currentRulesetId: rulesetId }, () => this.updateAppSettings());
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onUnitSystemSelected = (unitSystem: PresentationUnitSystem | undefined) => {
    Presentation.presentation.activeUnitSystem = unitSystem;
    this.setState({ activeUnitSystem: unitSystem }, () => this.updateAppSettings());
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onPersistSettingsValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ persistSettings: e.target.checked }, () => this.updateAppSettings());
  };

  private _onTreePaneRatioChanged = (ratio: number): RatioChangeResult => {
    ratio = Geometry.clamp(ratio, this._minRightPaneRatio, this._maxRightPaneRatio);
    if (this.state.rightPaneRatio === ratio)
      return { ratio };

    this.setState({ rightPaneRatio: ratio });
    return { ratio };
  };

  private _onContentRatioChanged = (ratio: number): RatioChangeResult => {
    ratio = Geometry.clamp(ratio, this._minContentRatio, this._maxContentRatio);
    if (this.state.contentRatio === ratio)
      return { ratio };

    this.setState({ contentRatio: ratio });
    return { ratio };
  };

  private _selectAllInstances = async (provider: IPresentationTableDataProvider) => {
    const size = await provider.getRowsCount();
    const rowPromises = [];
    for (let i = 0; i < size; ++i)
      rowPromises.push(provider.getRow(i));
    const rows = await Promise.all(rowPromises);
    const keys = rows.map((r) => provider.getRowKey(r));
    Presentation.selection.addToSelection("app", provider.imodel, keys);
  };

  private _onFindSimilar = async (provider: IPresentationPropertyDataProvider, record: PropertyRecord) => {
    try {
      const factory = new DataProvidersFactory();
      const similarInstancesProvider = await factory.createSimilarInstancesTableDataProvider(provider,
        record, { displayType: DefaultContentDisplayTypes.List });
      await this._selectAllInstances(similarInstancesProvider);
      this.setState({ similarInstancesProvider });
    } catch (e) {
      console.log(e); // eslint-disable-line no-console
      alert(`Can't find similar instances for the selected property`);
      this.setState({ similarInstancesProvider: undefined });
    }
  };

  private _onSimilarInstancesResultsDismissed = () => {
    this.setState({ similarInstancesProvider: undefined });
  };

  private _onSelectionChanged = async (args: SelectionChangeEventArgs) => {
    if (!IModelApp.viewManager.selectedView) {
      // no viewport to zoom in
      return;
    }

    if (args.source === "Tool") {
      // selection originated from the viewport - don't change what it's displaying by zooming in
      return;
    }

    // determine what the viewport is hiliting
    const hiliteSet = await Presentation.selection.getHiliteSet(args.imodel);
    if (hiliteSet.elements) {
      // note: the hilite list may contain models and subcategories as well - we don't
      // care about them at this moment
      await IModelApp.viewManager.selectedView.zoomToElements(hiliteSet.elements);
    }
  };

  private renderIModelComponents(imodel: IModelConnection, rulesetId?: string) {
    return (
      <div
        className="app-content"
        ref={this._contentRef}
        style={{
          gridTemplateColumns: `${this.state.contentRatio * 100}% 1px calc(${(1 - this.state.contentRatio) * 100}% - 1px)`,
        }}>
        <UnifiedSelectionContextProvider imodel={imodel} selectionLevel={0}>
          <div className="app-content-left">
            <div className="app-content-left-top">
              <ViewportContentControl imodel={imodel} />
            </div>
            <div className="app-content-left-bottom">
              {
                <GridWidget imodel={imodel} rulesetId={rulesetId} />
              }
              {
                this.state.similarInstancesProvider ?
                  <FindSimilarWidget dataProvider={this.state.similarInstancesProvider} onDismissed={this._onSimilarInstancesResultsDismissed} />
                  : undefined
              }
            </div>
          </div>
          <ElementSeparator
            orientation={Orientation.Horizontal}
            ratio={this.state.contentRatio}
            movableArea={this.state.contentWidth}
            separatorSize={10}
            onRatioChanged={this._onContentRatioChanged}
          />
          <div
            ref={this._rightPaneRef}
            className="app-content-right"
            style={{
              gridTemplateRows: `${this.state.rightPaneRatio * 100}% 30px calc(${(1 - this.state.rightPaneRatio) * 100}% - 30px)`,
            }}>
            <TreeWidget imodel={imodel} rulesetId={rulesetId} />
            <div className="app-content-right-separator">
              <hr />
              <ElementSeparator
                orientation={Orientation.Vertical}
                ratio={this.state.rightPaneRatio}
                movableArea={this.state.rightPaneHeight}
                onRatioChanged={this._onTreePaneRatioChanged} />
            </div>
            <PropertiesWidget imodel={imodel} rulesetId={rulesetId} onFindSimilar={this._onFindSimilar} />
          </div>
        </UnifiedSelectionContextProvider>
      </div>
    );
  }

  private afterRender() {
    if (this._rightPaneRef.current) {
      const height = this._rightPaneRef.current.getBoundingClientRect().height;
      if (height !== this.state.rightPaneHeight)
        this.setState({ rightPaneHeight: height });
    }
    if (this._contentRef.current) {
      const width = this._contentRef.current.getBoundingClientRect().width;
      if (width !== this.state.contentWidth)
        this.setState({ contentWidth: width });
    }
  }

  public override componentDidMount() {
    this.loadAppSettings();
    this.afterRender();
    this._selectionListener = Presentation.selection.selectionChange.addListener(this._onSelectionChanged);
  }

  public override componentDidUpdate() {
    this.afterRender();
  }

  public override componentWillUnmount() {
    Presentation.selection.selectionChange.removeListener(this._selectionListener);
  }

  public override render() {
    let imodelComponents = null;
    if (this.state.imodel)
      imodelComponents = this.renderIModelComponents(this.state.imodel, this.state.currentRulesetId);

    return (
      <div className="app">
        <div className="app-header">
          <h2>{IModelApp.i18n.translate("Sample:welcome-message")}</h2>
        </div>
        <div className="app-pickers">
          <IModelSelector onIModelSelected={this.onIModelSelected} activeIModelPath={this.state.imodelPath} />
          <RulesetSelector onRulesetSelected={this.onRulesetSelected} activeRulesetId={this.state.currentRulesetId} />
          <UnitSystemSelector selectedUnitSystem={this.state.activeUnitSystem} onUnitSystemSelected={this.onUnitSystemSelected} />
          <ToggleSwitch label="Persist settings" labelPosition="right" checked={this.state.persistSettings} onChange={this.onPersistSettingsValueChange} />
        </div>
        {imodelComponents}
      </div>
    );
  }
}
