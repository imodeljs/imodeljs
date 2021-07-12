/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";

import { IModelApp, IModelAppOptions, MockRender, Tool } from "@bentley/imodeljs-frontend";
import { SpecialKey } from "@bentley/ui-abstract";
import { fireEvent, render, waitForElement } from "@testing-library/react";
import { clearKeyinPaletteHistory, FrameworkUiAdmin, KeyinEntry, KeyinPalettePanel, UiFramework } from "../../ui-framework";
import TestUtils, { storageMock } from "../TestUtils";
import { UiSettingsStatus } from "@bentley/ui-core";

const myLocalStorage = storageMock();
const KEYIN_PALETTE_NAMESPACE = "KeyinPalettePanel";
const KEYIN_HISTORY_KEY = "historyArray";
const propertyDescriptorToRestore = Object.getOwnPropertyDescriptor(window, "localStorage")!;
const rnaDescriptorToRestore = Object.getOwnPropertyDescriptor(IModelApp, "requestNextAnimation")!;
function requestNextAnimation() { }

describe("<KeyinPalettePanel>", () => {

  before(async () => {

    // Avoid requestAnimationFrame exception during test by temporarily replacing function that calls it. Tried replacing window.requestAnimationFrame first
    // but that did not work.
    Object.defineProperty(IModelApp, "requestNextAnimation", {
      get: () => requestNextAnimation,
    });

    Object.defineProperty(window, "localStorage", {
      get: () => myLocalStorage,
    });

    await TestUtils.initializeUiFramework();
    // use mock renderer so standards tools are registered.
    const opts: IModelAppOptions = { uiAdmin: new FrameworkUiAdmin() };
    await MockRender.App.startup(opts);
  });

  after(async () => {
    await MockRender.App.shutdown();

    // restore the overriden property getter
    Object.defineProperty(window, "localStorage", propertyDescriptorToRestore);
    Object.defineProperty(IModelApp, "requestNextAnimation", rnaDescriptorToRestore);

    TestUtils.terminateUiFramework();
  });

  it("test clearKeyinPaletteHistory", async () => {
    const uiSettingsStorage = UiFramework.getUiSettingsStorage();
    if (uiSettingsStorage) {
      await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["keyin1", "keyin2"]);
      let settingsResult = await uiSettingsStorage.getSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY);
      expect(UiSettingsStatus.Success === settingsResult.status);
      clearKeyinPaletteHistory();
      settingsResult = await uiSettingsStorage.getSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY);
      expect(UiSettingsStatus.NotFound === settingsResult.status);
    }
  });

  it("Renders", async () => {
    const keyins: KeyinEntry[] = [{ value: "test a" }, { value: "test b" }, { value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;

    await TestUtils.flushAsyncOperations();
    const history2 = await waitForElement(() => renderedComponent.getByTitle("test b"));
    expect(history2).not.to.be.undefined;
    expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);
  });

  it("handles key presses in select input ", async () => {
    const keyins: KeyinEntry[] = [{ value: "test a" }, { value: "test b" }, { value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;

    await TestUtils.flushAsyncOperations();
    const history2 = await waitForElement(() => renderedComponent.getByTitle("test b"));
    expect(history2).not.to.be.undefined;
    expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);

    fireEvent.change(selectInput, { target: { value: "two" } });
    await TestUtils.flushAsyncOperations();
    expect(renderedComponent.container.querySelectorAll("li").length).to.eq(1);
    fireEvent.keyDown(selectInput, { key: SpecialKey.Enter });
  });

  it("handles ctrl+key presses in select input ", async () => {
    const keyins: KeyinEntry[] = [{ value: "test a" }, { value: "test b" }, { value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;

    await TestUtils.flushAsyncOperations();
    const history2 = await waitForElement(() => renderedComponent.getByTitle("test b"));
    expect(history2).not.to.be.undefined;
    expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);

    fireEvent.change(selectInput, { target: { value: "two" } });
    await TestUtils.flushAsyncOperations();
    expect(renderedComponent.container.querySelectorAll("li").length).to.eq(1);
    fireEvent.keyDown(selectInput, { key: SpecialKey.Enter, ctrlKey: true });
    await TestUtils.flushAsyncOperations();
    fireEvent.change(selectInput, { target: { value: "two" } });
    await TestUtils.flushAsyncOperations();
    fireEvent.keyDown(selectInput, { key: SpecialKey.Tab });
  });

  it("Handles keyboard running selection", async () => {
    const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
    fireEvent.keyDown(selectInput, { key: SpecialKey.ArrowDown });

    await TestUtils.flushAsyncOperations();
    const listComponent = (renderedComponent.container.querySelector("ul"));
    expect(listComponent).not.to.be.null;
    fireEvent.keyDown(listComponent!, { key: SpecialKey.ArrowDown });
    fireEvent.keyDown(listComponent!, { key: SpecialKey.Enter });
  });

  it("Handles keyboard updating input after CTRL + selection", async () => {
    const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
    expect(selectInput.value.length === 0);
    await TestUtils.flushAsyncOperations();
    fireEvent.keyDown(selectInput, { key: SpecialKey.ArrowDown });
    const listComponent = (renderedComponent.container.querySelector("ul"));
    expect(listComponent).not.to.be.null;
    fireEvent.keyDown(listComponent!, { key: SpecialKey.ArrowDown });
    fireEvent.keyDown(listComponent!, { key: SpecialKey.Enter, ctrlKey: true });
    expect(selectInput.value.length > 0);
  });

  it("Handles listbox click processing", async () => {
    const keyins: KeyinEntry[] = [{ value: "test a" }, { value: "test b" }, { value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    await TestUtils.flushAsyncOperations();
    const history2 = await waitForElement(() => renderedComponent.getByTitle("test b"));
    expect(history2).not.to.be.undefined;

    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
    expect(selectInput.value.length === 0);
    const liItems = renderedComponent.container.querySelectorAll("li");
    expect(liItems.length).to.eq(4);
    fireEvent.click(liItems[1]);
    expect(selectInput.value.length > 0);
  });

  it("Handles listbox CTRL+click processing", async () => {
    const keyins: KeyinEntry[] = [{ value: "test a" }, { value: "test b" }, { value: "keyin one" }, { value: "keyin two" }];
    const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
    expect(renderedComponent).not.to.be.undefined;
    await TestUtils.flushAsyncOperations();
    const history2 = await waitForElement(() => renderedComponent.getByTitle("test b"));
    expect(history2).not.to.be.undefined;

    const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
    expect(selectInput.value.length === 0);
    // force a list item to get focus so focus value is set
    fireEvent.keyDown(selectInput, { key: SpecialKey.ArrowDown });

    const liItems = renderedComponent.container.querySelectorAll("li");
    expect(liItems.length).to.eq(4);
    fireEvent.click(liItems[1], { ctrlKey: true });
    expect(selectInput.value.length > 0);
  });

  describe("Filters out unavailable History keyins", () => {

    class TestImmediate extends Tool {
      public static override toolId = "Test.Immediate";
      public override run(): boolean {
        return true;
      }
    }

    beforeEach(() => {
      sinon.stub(IModelApp.tools, "parseKeyin").callsFake((keyin: string) => {
        if (keyin === "bogus")
          return { ok: false, error: 1 };
        return { ok: true, args:[], tool: TestImmediate};
      });
    });

    afterEach(() => {
      sinon.restore();
    });

    it("Renders and filters out bogus history entry", async () => {
      const uiSettingsStorage = UiFramework.getUiSettingsStorage();
      if (uiSettingsStorage) {
        await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["history1", "history2", "bogus"]);
      }
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;

      await TestUtils.flushAsyncOperations();
      const history2 = await waitForElement(() => renderedComponent.getByTitle("history2"));
      expect(history2).not.to.be.undefined;
      expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);
    });

    it("handles key presses in select input ", async () => {
      const uiSettingsStorage = UiFramework.getUiSettingsStorage();
      if (uiSettingsStorage) {
        await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["history1", "history2", "bogus"]);
      }
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;
      const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;

      await TestUtils.flushAsyncOperations();
      const history2 = await waitForElement(() => renderedComponent.getByTitle("history2"));
      expect(history2).not.to.be.undefined;
      expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);

      fireEvent.change(selectInput, { target: { value: "two" } });
      await TestUtils.flushAsyncOperations();
      expect(renderedComponent.container.querySelectorAll("li").length).to.eq(1);
      fireEvent.keyDown(selectInput, { key: SpecialKey.Enter });
    });

    it("handles ctrl+key presses in select input ", async () => {
      const uiSettingsStorage = UiFramework.getUiSettingsStorage();
      if (uiSettingsStorage) {
        await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["history1", "history2", "bogus"]);
      }
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;
      const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;

      await TestUtils.flushAsyncOperations();
      const history2 = await waitForElement(() => renderedComponent.getByTitle("history2"));
      expect(history2).not.to.be.undefined;
      expect(renderedComponent.container.querySelectorAll("li").length).to.eq(4);

      fireEvent.change(selectInput, { target: { value: "two" } });
      await TestUtils.flushAsyncOperations();
      expect(renderedComponent.container.querySelectorAll("li").length).to.eq(1);
      fireEvent.keyDown(selectInput, { key: SpecialKey.Enter, ctrlKey: true });
      await TestUtils.flushAsyncOperations();
      fireEvent.change(selectInput, { target: { value: "two" } });
      await TestUtils.flushAsyncOperations();
      fireEvent.keyDown(selectInput, { key: SpecialKey.Tab });
    });

    it("Handles keyboard running selection", async () => {
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;
      const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
      fireEvent.keyDown(selectInput, { key: SpecialKey.ArrowDown });

      await TestUtils.flushAsyncOperations();
      const listComponent = (renderedComponent.container.querySelector("ul"));
      expect(listComponent).not.to.be.null;
      fireEvent.keyDown(listComponent!, { key: SpecialKey.ArrowDown });
      fireEvent.keyDown(listComponent!, { key: SpecialKey.Enter });
    });

    it("Handles listbox click processing", async () => {
      const uiSettingsStorage = UiFramework.getUiSettingsStorage();
      if (uiSettingsStorage) {
        await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["history1", "history2", "bogus"]);
      }
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;
      await TestUtils.flushAsyncOperations();
      const history2 = await waitForElement(() => renderedComponent.getByTitle("history2"));
      expect(history2).not.to.be.undefined;

      const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
      expect(selectInput.value.length === 0);
      const liItems = renderedComponent.container.querySelectorAll("li");
      expect(liItems.length).to.eq(4);
      fireEvent.click(liItems[1]);
      expect(selectInput.value.length > 0);
    });

    it("Handles listbox CTRL+click processing", async () => {
      const uiSettingsStorage = UiFramework.getUiSettingsStorage();
      if (uiSettingsStorage) {
        await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, ["history1", "history2", "bogus"]);
      }
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const renderedComponent = render(<KeyinPalettePanel keyins={keyins} />);
      expect(renderedComponent).not.to.be.undefined;
      await TestUtils.flushAsyncOperations();
      const history2 = await waitForElement(() => renderedComponent.getByTitle("history2"));
      expect(history2).not.to.be.undefined;

      const selectInput = renderedComponent.getByTestId("command-palette-input") as HTMLInputElement;
      expect(selectInput.value.length === 0);
      // force a list item to get focus so focus value is set
      fireEvent.keyDown(selectInput, { key: SpecialKey.ArrowDown });

      const liItems = renderedComponent.container.querySelectorAll("li");
      expect(liItems.length).to.eq(4);
      fireEvent.click(liItems[1], { ctrlKey: true });
      expect(selectInput.value.length > 0);
    });
  });
});
