/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import { Icon, Slider } from "@bentley/ui-core";
import {
  ConfigurableCreateInfo, ConfigurableUiManager, ContentControl, CoreTools, Frontstage, FrontstageManager, FrontstageProps, FrontstageProvider,
  SyncToolSettingsPropertiesEventArgs,
  ToolSettingsEntry, ToolSettingsGrid, ToolUiProvider, Widget, Zone,
} from "../../../ui-framework";
import { ToolInformation } from "../../../ui-framework/zones/toolsettings/ToolInformation";
import TestUtils from "../../TestUtils";
import { DialogItemValue, DialogPropertySyncItem, UiLayoutDataProvider } from "@bentley/ui-abstract";
import { Input } from "@itwin/itwinui-react";

describe("ToolUiProvider", () => {

  function FancySlider() {
    const handleSliderChange = React.useCallback((_values: ReadonlyArray<number>) => {
    }, []);
    const handleFormatTip = React.useCallback((value: number) => Math.round(value).toString(), []);
    return (
      <Slider style={{ minWidth: "160px" }} min={0} max={100} values={[30, 70]} step={5} mode={2}
        showTicks getTickCount={() => 10}
        showTooltip formatTooltip={handleFormatTip}
        onChange={handleSliderChange} />
    );
  }

  function BasicSlider() {
    const handleSliderChange = React.useCallback((_values: ReadonlyArray<number>) => {
    }, []);
    return (
      <Slider style={{ minWidth: "160px" }} min={0} max={100} values={[50]} step={1} showMinMax={true} maxImage={<Icon iconSpec="icon-placeholder" />}
        showTooltip onChange={handleSliderChange} />
    );
  }
  class Tool2UiProvider extends ToolUiProvider {
    constructor(info: ConfigurableCreateInfo, options: any) {
      super(info, options);

      this.toolSettingsNode = <ToolSettingsGrid settings={this.getHorizontalToolSettings()} />;
      this.horizontalToolSettingNodes = this.getHorizontalToolSettings();
    }

    private getHorizontalToolSettings(): ToolSettingsEntry[] | undefined {
      return [
        { labelNode: <label htmlFor="range">Month</label>, editorNode: <input type="month" /> },
        { labelNode: "Number", editorNode: <input type="number" min="10" max="20" /> },
        { labelNode: "Slider", editorNode: <BasicSlider /> },
        { labelNode: "Slider w/ Ticks", editorNode: <FancySlider /> },
        { labelNode: "Input", editorNode: <Input /> },
      ];
    }
  }

  const testToolId = "ToolUiProvider-TestTool";

  before(async () => {
    await TestUtils.initializeUiFramework();

    after(() => {
      TestUtils.terminateUiFramework();
    });

    class Frontstage1 extends FrontstageProvider {
      public get frontstage(): React.ReactElement<FrontstageProps> {
        return (
          <Frontstage
            id="ToolUiProvider-TestFrontstage"
            defaultTool={CoreTools.selectElementCommand}
            defaultLayout="FourQuadrants"
            contentGroup="TestContentGroup1"
            topCenter={
              <Zone
                widgets={[
                  <Widget isToolSettings={true} />, // eslint-disable-line react/jsx-key
                ]}
              />
            }
          />
        );
      }
    }

    const frontstageProvider = new Frontstage1();
    ConfigurableUiManager.addFrontstageProvider(frontstageProvider);

    ConfigurableUiManager.registerControl(testToolId, Tool2UiProvider);
  });

  class TestDataProvider extends UiLayoutDataProvider { }

  it("can set/get uidataprovider", () => {
    const testDataProvider = new TestDataProvider();
    const tool2uiProvider = new Tool2UiProvider(new ConfigurableCreateInfo("test", "test", "test"), undefined);
    tool2uiProvider.dataProvider = testDataProvider;
    expect(tool2uiProvider.dataProvider === testDataProvider);
  });

  it("starting a tool with tool settings", async () => {
    const frontstageDef = FrontstageManager.findFrontstageDef("ToolUiProvider-TestFrontstage");
    expect(frontstageDef).to.not.be.undefined;

    if (frontstageDef) {
      await FrontstageManager.setActiveFrontstageDef(frontstageDef);

      FrontstageManager.ensureToolInformationIsSet(testToolId);
      FrontstageManager.setActiveToolId(testToolId);
      expect(FrontstageManager.activeToolId).to.eq(testToolId);

      const toolInformation = FrontstageManager.activeToolInformation;
      expect(toolInformation).to.not.be.undefined;

      if (toolInformation) {
        const toolUiProvider = toolInformation.toolUiProvider;
        expect(toolUiProvider).to.not.be.undefined;

        if (toolUiProvider) {
          expect(toolUiProvider.toolSettingsNode).to.not.be.undefined;
          // cover syncToolSettingsProperties
          const useLengthValue: DialogItemValue = { value: false };
          const syncItem: DialogPropertySyncItem = { value: useLengthValue, propertyName: "useLengthName", isDisabled: false };
          const syncArgs = { toolId: testToolId, syncProperties: [syncItem] } as SyncToolSettingsPropertiesEventArgs;
          toolUiProvider.syncToolSettingsProperties(syncArgs);
          //    expect(toolUiProvider.dataProvider).to.be.undefined;
        }
      }

      const toolSettingsProvider = FrontstageManager.activeToolSettingsProvider;
      expect(toolSettingsProvider).to.not.be.undefined;

      const toolSettingsNode = FrontstageManager.activeToolSettingsProvider?.toolSettingsNode;
      expect(toolSettingsNode).to.not.be.undefined;

      const horizontalToolSettingsNode = FrontstageManager.activeToolSettingsProvider?.horizontalToolSettingNodes;
      expect(horizontalToolSettingsNode).to.not.be.undefined;
      expect(horizontalToolSettingsNode!.length).to.eq(5);
    }
  });

  class TestContentControl extends ContentControl {
    constructor(info: ConfigurableCreateInfo, options: any) {
      super(info, options);

      this.reactNode = <div />;
    }
  }

  it("ToolInformation with invalid ToolUiProvider should throw Error", () => {
    ConfigurableUiManager.registerControl("ToolTest1", TestContentControl);
    const toolInfo = new ToolInformation("ToolTest1");
    expect(() => toolInfo.toolUiProvider).to.throw(Error);
    ConfigurableUiManager.unregisterControl("ToolTest1");
  });

});
