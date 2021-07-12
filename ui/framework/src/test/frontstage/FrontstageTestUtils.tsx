/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { WidgetState } from "@bentley/ui-abstract";
import {
  ConfigurableCreateInfo, ContentControl, ContentGroup, ContentLayoutDef, CoreTools, Frontstage, FrontstageProps, FrontstageProvider,
  MessageCenterField, StatusBarWidgetControl, StatusBarWidgetControlArgs, Widget, WidgetControl, Zone, ZoneLocation, ZoneState,
} from "../../ui-framework";
import { ToolItemDef } from "../../ui-framework/shared/ToolItemDef";

/* eslint-disable react/jsx-key */

/** @internal */
export class TestContentControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <div />;
  }
}

/** @internal */
export class TestWidget extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <TestWidgetElement />;
  }
}

/** @internal */
export class TestWidgetElement extends React.Component {
  public override componentDidMount() {
  }

  public override componentWillUnmount() {
  }

  public override render() {
    return <div />;
  }
}

/** @internal */
export class AppStatusBarWidgetControl extends StatusBarWidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
  }

  public getReactNode({ isInFooterMode, onOpenWidget, openWidget }: StatusBarWidgetControlArgs): React.ReactNode {
    return (
      <>
        <MessageCenterField isInFooterMode={isInFooterMode} onOpenWidget={onOpenWidget} openWidget={openWidget} />
      </>
    );
  }
}

/** @internal */
export class TestFrontstage extends FrontstageProvider {

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
        id="TestFrontstage"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout={contentLayoutDef}
        contentGroup={myContentGroup}
        defaultContentId="defaultContentId"
        isInFooterMode={false}
        applicationData={{ key: "value" }}
        usage="MyUsage"
        topLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true} applicationData={{ key: "value" }}
            widgets={[
              <Widget isFreeform={true} element={<div />} />,
            ]}
          />
        }
        topCenter={
          <Zone
            widgets={[
              <Widget isToolSettings={true} />,
            ]}
          />
        }
        centerLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget id="widget3" defaultState={WidgetState.Open} control={TestWidget}
                onWidgetStateChanged={() => { }}
                saveTransientState={() => { }}
                restoreTransientState={() => false} />,
            ]}
          />
        }
        centerRight={
          <Zone defaultState={ZoneState.Open}
            widgets={[
              <Widget id="widget1" defaultState={WidgetState.Open} element={<div />} />,
              <Widget id="widget6_2" element={<div />} />,
            ]}
          />
        }
        bottomLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget id="widget4" defaultState={WidgetState.Open} control={TestWidget} />,
            ]}
          />
        }
        bottomCenter={
          <Zone
            widgets={[
              <Widget id="statusBar" isStatusBar={true} iconSpec="icon-placeholder" labelKey="App:widgets.StatusBar"
                control={AppStatusBarWidgetControl} applicationData={{ key: "value" }} />,
            ]}
          />
        }
        bottomRight={
          <Zone defaultState={ZoneState.Open} mergeWithZone={ZoneLocation.CenterRight}
            widgets={[
              <Widget id="widget1" defaultState={WidgetState.Open} element={<div />} />,
              <Widget id="widget2" defaultState={WidgetState.Hidden} element={<div />} />,
            ]}
          />
        }
      />
    );
  }
}

/** @internal */
export class TestFrontstage2 extends FrontstageProvider {

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
        id="TestFrontstage2"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout={contentLayoutDef}
        contentGroup={myContentGroup}
        defaultContentId="defaultContentId"
        isInFooterMode={false}
        applicationData={{ key: "value" }}
        usage="MyUsage"
        contentManipulationTools={
          <Zone defaultState={ZoneState.Open} allowsMerging={true} applicationData={{ key: "value" }}
            widgets={[
              <Widget isFreeform={true} element={<div />} />,
            ]}
          />
        }
        toolSettings={
          <Zone
            widgets={[
              <Widget isToolSettings={true} />,
            ]}
          />
        }
        centerLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget id="widget3" defaultState={WidgetState.Open} control={TestWidget}
                onWidgetStateChanged={() => { }}
                saveTransientState={() => { }}
                restoreTransientState={() => false} />,
            ]}
          />
        }
        centerRight={
          <Zone defaultState={ZoneState.Open}
            widgets={[
              <Widget id="widget1" defaultState={WidgetState.Open} element={<div />} />,
              <Widget id="widget6_2" element={<div />} />,
            ]}
          />
        }
        bottomLeft={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget id="widget4" defaultState={WidgetState.Open} control={TestWidget} />,
            ]}
          />
        }
        statusBar={
          <Zone
            widgets={[
              <Widget id="statusBar" isStatusBar={true} iconSpec="icon-placeholder" labelKey="App:widgets.StatusBar"
                control={AppStatusBarWidgetControl} applicationData={{ key: "value" }} />,
            ]}
          />
        }
        bottomRight={
          <Zone defaultState={ZoneState.Open} mergeWithZone={ZoneLocation.CenterRight}
            widgets={[
              <Widget id="widget1" defaultState={WidgetState.Open} element={<div />} />,
              <Widget id="widget2" defaultState={WidgetState.Hidden} element={<div />} />,
            ]}
          />
        }
      />
    );
  }
}

/** @internal */
export class TestFrontstage3 extends FrontstageProvider {

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
          },
        ],
      },
    );

    return (
      <Frontstage
        id="TestFrontstage3"
        defaultTool={new ToolItemDef({ toolId: "test" })}
        defaultLayout={contentLayoutDef}
        contentGroup={myContentGroup}
        defaultContentId="defaultContentId"
        isInFooterMode={false}
      />
    );
  }
}
