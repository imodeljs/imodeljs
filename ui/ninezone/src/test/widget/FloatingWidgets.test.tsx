/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { addFloatingWidget, addPanelWidget, addTab, createNineZoneState, FloatingWidgetHomeState, FloatingWidgets, floatWidget, getAnimateStartPoint, NineZoneDispatch, PanelStateContext, PanelWidget } from "../../ui-ninezone";
import { NineZoneProvider } from "../Providers";
import { Rectangle } from "@bentley/ui-core";
import { defaultProps } from "./PanelWidget.test";
import sinon = require("sinon");

describe("FloatingWidgets", () => {
  it("should render", () => {
    let nineZone = createNineZoneState();
    nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
    nineZone = addTab(nineZone, "t1");
    const { container } = render(
      <NineZoneProvider
        state={nineZone}
      >
        <FloatingWidgets />
      </NineZoneProvider>,
    );
    container.firstChild!.should.matchSnapshot();
  });
  it("floatWidget should render minimized", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });

    state = addFloatingWidget(state, "fw1", ["t1"], undefined, { minimized: true });
    state = addTab(state, "t1");
    const { container } = render(
      <NineZoneProvider
        state={state}
      >
        <FloatingWidgets />
      </NineZoneProvider>,
    );
    container.firstChild!.should.matchSnapshot();
  });

  const bounds = new Rectangle(0, 0, 1200, 800);

  it("should calculate for right start", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:0, widgetId:"w1", side:"right"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(1200);
    startPoint.y.should.eq(0);
  });
  it("should calculate for right middle", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:1, widgetId:"w1", side:"right"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(1200);
    startPoint.y.should.eq(400);
  });
  it("should calculate for right end", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:2, widgetId:"w1", side:"right"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(1200);
    startPoint.y.should.eq(800);
  });
  it("should calculate for top start", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:0, widgetId:"w1", side:"top"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(0);
    startPoint.y.should.eq(0);
  });
  it("should calculate for top middle", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:1, widgetId:"w1", side:"top"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(600);
    startPoint.y.should.eq(0);
  });
  it("should calculate for top end", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:2, widgetId:"w1", side:"top"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(1200);
    startPoint.y.should.eq(0);
  });
  it("should calculate for left start", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:0, widgetId:"w1", side:"left"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(0);
    startPoint.y.should.eq(0);
  });
  it("should calculate for left middle", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:1, widgetId:"w1", side:"left"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(0);
    startPoint.y.should.eq(400);
  });
  it("should calculate for left end", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:2, widgetId:"w1", side:"left"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(0);
    startPoint.y.should.eq(800);
  });
  it("should calculate for bottom start", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:0, widgetId:"w1", side:"bottom"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(0);
    startPoint.y.should.eq(800);
  });
  it("should calculate for bottom middle", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:1, widgetId:"w1", side:"bottom"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(600);
    startPoint.y.should.eq(800);
  });
  it("should calculate for bottom end", () =>{
    const widgetHome: FloatingWidgetHomeState = { widgetIndex:2, widgetId:"w1", side:"bottom"};

    const startPoint = getAnimateStartPoint(widgetHome, bounds);

    startPoint.x.should.eq(1200);
    startPoint.y.should.eq(800);
  });
  it("floatWidget should set animate in FloatingWidgetState", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });

    state = addPanelWidget(state, "right", "rightStart", ["t1", "t2", "t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    state = addTab(state, "t3");

    const newState = floatWidget(state, "t1", { x: 55, y: 105 }, { height: 200, width: 200 }, true);
    (newState === undefined).should.not.be.true;
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].animateTransition.should.eq(true);
    render(
      <NineZoneProvider
        state={newState}
      >
        <PanelStateContext.Provider value={state.panels.right}>
          <PanelWidget widgetId="rightStart" {...defaultProps} />
        </PanelStateContext.Provider>
        <FloatingWidgets />
      </NineZoneProvider>,
    );
  });
  it("should dispatch FLOATING_WIDGET_SET_ANIMATE_TRANSITION", () => {
    const dispatch = sinon.stub<NineZoneDispatch>();
    let nineZone = createNineZoneState();
    nineZone = addPanelWidget(nineZone, "left", "w1", ["t1", "t2"]);
    nineZone = addTab(nineZone, "t1");
    nineZone = addTab(nineZone, "t2");

    const newState = floatWidget(nineZone, "t1", { x: 55, y: 105 }, { height: 200, width: 200 }, true);
    (newState === undefined).should.not.be.true;
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    const { container } = render(
      <NineZoneProvider
        state={newState}
        dispatch={dispatch}
      >
        <PanelStateContext.Provider value={newState!.panels.right}>
          <PanelWidget widgetId="w1" {...defaultProps} />
        </PanelStateContext.Provider>
        <FloatingWidgets />
      </NineZoneProvider>,
    );

    const sendBackButton = container.getElementsByClassName("nz-widget-sendBack")[0];
    fireEvent.click(sendBackButton);

    dispatch.calledWithExactly({
      type: "FLOATING_WIDGET_SET_ANIMATE_TRANSITION",
      id: floatingWidgetContainerId,
      animateTransition: true,
    }).should.true;
  });
});
