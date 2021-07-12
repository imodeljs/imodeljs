/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { AnalysisStyle } from "@bentley/imodeljs-common";
import { ScreenViewport } from "../Viewport";
import { IModelApp } from "../IModelApp";
import { openBlankViewport } from "./openBlankViewport";

describe("Viewport", () => {
  let viewport: ScreenViewport;

  before(async () => IModelApp.startup());
  after(async () => IModelApp.shutdown());
  beforeEach(() => viewport = openBlankViewport());
  afterEach(() => viewport.dispose());

  describe("flashedId", () => {
    type ChangedEvent = [string | undefined, string | undefined];

    function expectFlashedId(expectedId: string | undefined, expectedEvent: ChangedEvent | undefined, func: () => void): void {
      let event: ChangedEvent | undefined;
      const removeListener = viewport.onFlashedIdChanged.addListener((vp, arg) => {
        expect(vp).to.equal(viewport);
        expect(event).to.be.undefined;
        event = [arg.previous, arg.current];
      });

      func();
      removeListener();

      expect(viewport.flashedId).to.equal(expectedId);
      expect(event).to.deep.equal(expectedEvent);
    }

    it("dispatches events when flashed Id changes", () => {
      expectFlashedId("0x123", [undefined, "0x123"], () => viewport.flashedId = "0x123");
      expectFlashedId("0x456", ["0x123", "0x456"], () => viewport.flashedId = "0x456");
      expectFlashedId("0x456", undefined, () => viewport.flashedId = "0x456");
      expectFlashedId(undefined, ["0x456", undefined], () => viewport.flashedId = undefined);
      expectFlashedId(undefined, undefined, () => viewport.flashedId = undefined);
    });

    it("treats invalid Id as undefined", () => {
      viewport.flashedId = "0x123";
      expectFlashedId(undefined, ["0x123", undefined], () => viewport.flashedId = "0");
      viewport.flashedId = "0x123";
      expectFlashedId(undefined, ["0x123", undefined], () => viewport.flashedId = undefined);
    });

    it("rejects malformed Ids", () => {
      expectFlashedId(undefined, undefined, () => viewport.flashedId = "not an id");
      viewport.flashedId = "0x123";
      expectFlashedId("0x123", undefined, () => viewport.flashedId = "not an id");
    });

    it("prohibits assignment from within event callback", () => {
      viewport.onFlashedIdChanged.addOnce(() => viewport.flashedId = "0x12345");
      expect(() => viewport.flashedId = "0x12345").to.throw(Error, "Cannot assign to Viewport.flashedId from within an onFlashedIdChanged event callback");
    });
  });

  describe("analysis style changed events", () => {
    it("registers and unregisters for multiple events", () => {
      function expectListeners(expected: boolean): void {
        const expectedNum = expected ? 1 : 0;
        expect(viewport.onChangeView.numberOfListeners).to.equal(expectedNum);

        // The viewport registers its own listener for each of these.
        expect(viewport.view.onDisplayStyleChanged.numberOfListeners).to.equal(expectedNum + 1);
        expect(viewport.displayStyle.settings.onAnalysisStyleChanged.numberOfListeners).to.equal(expectedNum + 1);
      }

      expectListeners(false);
      const removeListener = viewport.addOnAnalysisStyleChangedListener(() => undefined);
      expectListeners(true);
      removeListener();
      expectListeners(false);
    });

    it("emits events when analysis style changes", () => {
      type EventPayload = AnalysisStyle | "undefined" | "none";
      function expectChangedEvent(expectedPayload: EventPayload, func: () => void): void {
        let payload: EventPayload = "none";
        const removeListener = viewport.addOnAnalysisStyleChangedListener((style) => {
          expect(payload).to.equal("none");
          payload = style ?? "undefined";
        });

        func();
        removeListener();
        expect(payload).to.equal(expectedPayload);
      }

      const a = AnalysisStyle.fromJSON({ normalChannelName: "a" });

      expectChangedEvent(a, () => viewport.displayStyle.settings.analysisStyle = a);
      expectChangedEvent("none", () => viewport.displayStyle.settings.analysisStyle = a);

      const b = AnalysisStyle.fromJSON({ normalChannelName: "b" });
      expectChangedEvent(b, () => {
        const style = viewport.displayStyle.clone();
        style.settings.analysisStyle = b;
        viewport.displayStyle = style;
      });

      const c = AnalysisStyle.fromJSON({ normalChannelName: "c" });
      expectChangedEvent(c, () => {
        const view = viewport.view.clone();
        expect(view.displayStyle).not.to.equal(viewport.view.displayStyle);
        view.displayStyle.settings.analysisStyle = c;
        viewport.changeView(view);
      });

      expectChangedEvent("undefined", () => viewport.displayStyle.settings.analysisStyle = undefined);
      expectChangedEvent("none", () => viewport.displayStyle.settings.analysisStyle = undefined);
    });
  });
});
