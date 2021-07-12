/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import {
  ContentGroup, ContentLayoutDef, CoreTools, Frontstage, FrontstageDef, FrontstageManager, FrontstageProps, FrontstageProvider, NestedFrontstage,
  ToolWidget, Widget, Zone, ZoneState,
} from "../../ui-framework";
import TestUtils from "../TestUtils";
import { AppStatusBarWidgetControl, TestContentControl, TestFrontstage } from "./FrontstageTestUtils";

class TestNestedFrontstage extends FrontstageProvider {

  public get frontstage(): React.ReactElement<FrontstageProps> {
    const contentLayoutDef: ContentLayoutDef = new ContentLayoutDef(
      {
        id: "SingleContent",
        descriptionKey: "App:ContentLayoutDef.SingleContent",
        priority: 100,
      },
    );

    const myContentGroup: ContentGroup = new ContentGroup(
      {
        contents: [
          {
            classId: TestContentControl,
            applicationData: { label: "Content 1a", bgColor: "black" },
          },
        ],
      },
    );

    return (
      <Frontstage
        id="Test1"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout={contentLayoutDef}
        contentGroup={myContentGroup}
        defaultContentId="defaultContentId"
        isInFooterMode={false}
        applicationData={{ key: "value" }}
        topLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true} applicationData={{ key: "value" }}
            widgets={[
              <Widget isFreeform={true} element={<FrontstageToolWidget />} />, // eslint-disable-line react/jsx-key
            ]}
          />
        }
        topCenter={
          <Zone
            widgets={[
              <Widget isToolSettings={true} />, // eslint-disable-line react/jsx-key
            ]}
          />
        }
        bottomCenter={
          <Zone
            widgets={[
              <Widget id="statusBar" isStatusBar={true} iconSpec="icon-placeholder" labelKey="App:widgets.StatusBar" // eslint-disable-line react/jsx-key
                control={AppStatusBarWidgetControl} applicationData={{ key: "value" }} />,
            ]}
          />
        }
      />
    );
  }
}

class FrontstageToolWidget extends React.Component {
  public override render() {
    return (
      <ToolWidget // eslint-disable-line deprecation/deprecation
        appButton={NestedFrontstage.backToPreviousFrontstageCommand}
      />
    );
  }
}

class TestFrontstageDef extends FrontstageDef {
  protected override _onActivated(): void { }
  protected override _onDeactivated(): void { }
}

describe("NestedFrontstage", () => {

  before(async () => {
    await TestUtils.initializeUiFramework();
    FrontstageManager.clearFrontstageDefs();
  });

  after(() => {
    TestUtils.terminateUiFramework();
  });

  it("activeNestedFrontstage should return undefined if none active", () => {
    expect(FrontstageManager.activeNestedFrontstage).to.be.undefined;
    expect(FrontstageManager.nestedFrontstageCount).to.eq(0);
  });

  it("openNestedFrontstage & closeNestedFrontstage should open/close nested frontstages", async () => {
    const frontstageProvider = new TestFrontstage();
    FrontstageManager.addFrontstageProvider(frontstageProvider);
    await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);

    expect(FrontstageManager.activeFrontstageDef).to.eq(frontstageProvider.frontstageDef);
    expect(FrontstageManager.nestedFrontstageCount).to.eq(0);

    const frontstageDef = new TestFrontstageDef();
    const spyActivated = sinon.spy(frontstageDef, "_onActivated" as any);
    const spyDeactivated = sinon.spy(frontstageDef, "_onDeactivated" as any);

    const nestedFrontstageProvider = new TestNestedFrontstage();
    const nestedFrontstageDef = nestedFrontstageProvider.initializeDef(frontstageDef);
    expect(frontstageDef === nestedFrontstageDef).to.be.true;

    await FrontstageManager.openNestedFrontstage(nestedFrontstageDef);
    expect(FrontstageManager.nestedFrontstageCount).to.eq(1);
    expect(FrontstageManager.activeNestedFrontstage).to.eq(nestedFrontstageDef);
    expect(spyActivated.calledOnce).to.be.true;

    const nestedFrontstageProvider2 = new TestNestedFrontstage();
    const nestedFrontstageDef2 = nestedFrontstageProvider2.initializeDef();
    await FrontstageManager.openNestedFrontstage(nestedFrontstageDef2);
    expect(FrontstageManager.nestedFrontstageCount).to.eq(2);
    expect(FrontstageManager.activeNestedFrontstage).to.eq(nestedFrontstageDef2);
    expect(spyDeactivated.calledOnce).to.be.true;

    NestedFrontstage.backToPreviousFrontstageCommand.execute();
    expect(FrontstageManager.nestedFrontstageCount).to.eq(1);
    expect(spyActivated.calledTwice).to.be.true;

    NestedFrontstage.backToPreviousFrontstageCommand.execute();
    expect(FrontstageManager.nestedFrontstageCount).to.eq(0);
    expect(spyDeactivated.calledTwice).to.be.true;

    expect(FrontstageManager.activeFrontstageDef).to.eq(frontstageProvider.frontstageDef);
  });

});
