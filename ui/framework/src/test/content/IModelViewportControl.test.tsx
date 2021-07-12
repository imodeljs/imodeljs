/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as moq from "typemoq";
import { render } from "@testing-library/react";
import { MockRender, ScreenViewport, ViewState3d } from "@bentley/imodeljs-frontend";
import {
  ConfigurableCreateInfo, ConfigurableUiControlType, ConfigurableUiManager, ContentGroup, ContentLayoutDef, ContentLayoutManager, ContentViewManager,
  CoreTools, Frontstage, FrontstageManager, FrontstageProps, FrontstageProvider, IModelViewportControl, IModelViewportControlOptions,
  NavigationWidget, SupportsViewSelectorChange, Widget, Zone,
} from "../../ui-framework";
import TestUtils, { storageMock } from "../TestUtils";

const mySessionStorage = storageMock();
const propertyDescriptorToRestore = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;

describe("IModelViewportControl", () => {

  const viewportMock = moq.Mock.ofType<ScreenViewport>();
  const viewMock = moq.Mock.ofType<ViewState3d>();

  before(async () => {
    Object.defineProperty(window, "sessionStorage", {
      get: () => mySessionStorage,
    });

    await TestUtils.initializeUiFramework();
    await MockRender.App.startup();

    ConfigurableUiManager.initialize();
    FrontstageManager.isInitialized = false;
    FrontstageManager.initialize();
  });

  after(async () => {
    await MockRender.App.shutdown();
    TestUtils.terminateUiFramework();

    // restore the overriden property getter
    Object.defineProperty(window, "sessionStorage", propertyDescriptorToRestore);
  });

  class TestViewportContentControl extends IModelViewportControl {
    public static override get id() {
      return "TestApp.IModelViewport";
    }

    constructor(info: ConfigurableCreateInfo, options: IModelViewportControlOptions) {
      super(info, { ...options, deferNodeInitialization: true });  // force deferNodeInitialization for subclass
      this.setIsReady();
    }

    protected override _getViewOverlay = (_viewport: ScreenViewport): React.ReactNode => {
      return <div data-testid="ViewOverlay">ViewOverlay</div>;
    };

    protected override initializeReactNode() {
      this._reactNode = <div data-testid="MainContent">
        {this._getViewOverlay(this.viewport!)}
      </div >;
    }

    public override get viewport(): ScreenViewport | undefined { return viewportMock.object; }
  }

  class Frontstage1 extends FrontstageProvider {

    public contentLayoutDef: ContentLayoutDef = new ContentLayoutDef(
      {
        id: "SingleContent",
        descriptionKey: "App:ContentLayoutDef.SingleContent",
        priority: 100,
      },
    );

    public get frontstage(): React.ReactElement<FrontstageProps> {

      const myContentGroup: ContentGroup = new ContentGroup(
        {
          contents: [
            {
              classId: TestViewportContentControl,
              applicationData: { label: "Content 1a", bgColor: "black" },
            },
          ],
        },
      );

      return (
        <Frontstage
          id="Test1"
          defaultTool={CoreTools.selectElementCommand}
          defaultLayout={this.contentLayoutDef}
          contentGroup={myContentGroup}

          topRight={
            <Zone widgets={[
              <Widget isFreeform={true} element={<NavigationWidget />} />, // eslint-disable-line deprecation/deprecation, react/jsx-key
            ]} />
          }
        />
      );
    }
  }

  beforeEach(async () => {
    viewMock.reset();
    viewMock.setup((view) => view.classFullName).returns(() => "SheetViewDefinition");
    viewportMock.reset();
    viewportMock.setup((viewport) => viewport.view).returns(() => viewMock.object);

    FrontstageManager.clearFrontstageDefs();
    await FrontstageManager.setActiveFrontstageDef(undefined);
  });

  it("Overridden IModelViewportControl should deferNodeInitialization", async () => {
    const frontstageProvider = new Frontstage1();
    FrontstageManager.addFrontstageProvider(frontstageProvider);
    await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);

    if (frontstageProvider.frontstageDef) {
      expect(ContentLayoutManager.activeLayout).to.eq(frontstageProvider.contentLayoutDef);

      const contentControl = ContentViewManager.getActiveContentControl();
      expect(contentControl).to.not.be.undefined;
      expect(contentControl instanceof TestViewportContentControl).to.be.true;

      if (contentControl) {
        expect(contentControl.isViewport).to.be.true;
        expect(contentControl.viewport).to.not.be.undefined;
        expect(contentControl.getType()).to.eq(ConfigurableUiControlType.Viewport);

        const supportsContentControl = contentControl as unknown as SupportsViewSelectorChange;
        expect(supportsContentControl.supportsViewSelectorChange).to.be.true;

        const controlNode = (contentControl as TestViewportContentControl).reactNode;
        expect(controlNode).to.not.be.undefined;
        expect(React.isValidElement(controlNode)).to.be.true;

        const componentWrapper = render(controlNode as React.ReactElement);
        expect(componentWrapper).to.not.be.undefined;
        expect(componentWrapper.getByTestId("MainContent")).to.not.be.undefined;
        expect(componentWrapper.getByTestId("ViewOverlay")).to.not.be.undefined;
      }
    }
  });

});
