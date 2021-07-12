/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { I18NNamespace } from "@bentley/imodeljs-i18n";
import { AccuDraw } from "../AccuDraw";
import { IModelApp, IModelAppOptions } from "../IModelApp";
import { MockRender } from "../render/MockRender";
import { IdleTool } from "../tools/IdleTool";
import { SelectionTool } from "../tools/SelectTool";
import { Tool } from "../tools/Tool";
import { PanViewTool, RotateViewTool } from "../tools/ViewTool";
import { BentleyStatus, DbResult, IModelStatus } from "@bentley/bentleyjs-core";

/** class to simulate overriding the default AccuDraw */
class TestAccuDraw extends AccuDraw { }

/** class to simulate overriding the Idle tool */
class TestIdleTool extends IdleTool { }

let testVal1: string;
let testVal2: string;

/** class to test immediate tool */
class TestImmediate extends Tool {
  public static override toolId = "Test.Immediate";
  constructor(val1: string, val2: string) { testVal1 = val1; testVal2 = val2; super(); }
}

class AnotherImmediate extends Tool {
  public static override toolId = "Test.AnotherImmediate";
}

class ThirdImmediate extends Tool {
  public static override toolId = "Test.ThirdImmediate";
}

class FourthImmediate extends Tool {
  public static override toolId = "Test.FourthImmediate";
}

class TestRotateTool extends RotateViewTool { }
class TestSelectTool extends SelectionTool { }

class TestApp extends MockRender.App {
  public static testNamespace?: I18NNamespace;

  public static override async startup(opts?: IModelAppOptions): Promise<void> {
    opts = opts ? opts : {};
    opts.accuDraw = new TestAccuDraw();
    opts.i18n = this.supplyI18NOptions();
    await MockRender.App.startup(opts);

    this.testNamespace = IModelApp.i18n.registerNamespace("TestApp");
    TestImmediate.register(this.testNamespace);
    AnotherImmediate.register(this.testNamespace);
    ThirdImmediate.register(this.testNamespace);
    FourthImmediate.register(this.testNamespace);
    TestIdleTool.register();
    TestRotateTool.register();
    TestSelectTool.register();
    IModelApp.toolAdmin.onInitialized();

    // register an anonymous class with the toolId "Null.Tool"
    const testNull = class extends Tool { public static override toolId = "Null.Tool"; public override run() { testVal1 = "fromNullTool"; return true; } };
    testNull.register(this.testNamespace);
  }

  protected static supplyI18NOptions() { return { urlTemplate: `${window.location.origin}/locales/{{lng}}/{{ns}}.json` }; }
}

describe("IModelApp", () => {
  before(async () => {
    await TestApp.startup();
    await TestApp.testNamespace!.readFinished;  // we must wait for the localization read to finish.
  });
  after(async () => TestApp.shutdown());

  it("TestApp should override correctly", () => {
    assert.instanceOf(IModelApp.accuDraw, TestAccuDraw, "accudraw override");
    assert.instanceOf(IModelApp.toolAdmin.idleTool, TestIdleTool, "idle tool override");
    assert.isTrue(IModelApp.tools.run("Test.Immediate", "test1", "test2"), "immediate tool ran");
    assert.equal(testVal1, "test1", "arg1 was correct");
    assert.equal(testVal2, "test2", "arg2 was correct");
    assert.isFalse(IModelApp.tools.run("Not.Found"), "toolId is not registered");
    assert.isTrue(IModelApp.tools.run("View.Pan"), "run view pan");
    assert.instanceOf(IModelApp.toolAdmin.viewTool, PanViewTool, "pan tool is active");

    assert.isTrue(IModelApp.tools.run("Null.Tool"), "run null");
    assert.equal(testVal1, "fromNullTool");
  });

  it("Should get localized keyin, flyover, and description for tools", async () => {
    assert.equal(TestImmediate.keyin, "Localized TestImmediate Keyin");
    assert.equal(TestImmediate.flyover, "Localized TestImmediate Flyover");
    assert.equal(TestImmediate.description, "Test of an Immediate Command");

    assert.equal(AnotherImmediate.keyin, "Localized AnotherImmediate keyin and flyover");
    assert.equal(AnotherImmediate.flyover, "Localized AnotherImmediate keyin and flyover");
    assert.equal(AnotherImmediate.description, "Another Immediate Command description");

    assert.equal(ThirdImmediate.keyin, "Localized ThirdImmediate Keyin");
    assert.equal(ThirdImmediate.flyover, "ThirdImmediate flyover and description");
    assert.equal(ThirdImmediate.description, "ThirdImmediate flyover and description");

    assert.equal(FourthImmediate.keyin, "Localized FourthImmediate keyin, flyover, and description");
    assert.equal(FourthImmediate.flyover, "Localized FourthImmediate keyin, flyover, and description");
    assert.equal(FourthImmediate.description, "Localized FourthImmediate keyin, flyover, and description");

    // here we are testing to make sure we can override the Select command but the keyin comes from the superclass because the toolId is not overridden
    const selTool = IModelApp.tools.create("Select")!;
    assert.instanceOf(selTool, TestSelectTool, "test select tool is active");
    assert.equal(selTool.keyin, "select elements", "keyin comes from superclass");
  });

  it("Should do localizations", () => {
    // we have "TrivialTest.Test1" as the key in TestApp.json
    assert.equal(IModelApp.i18n.translate("TestApp:TrivialTests.Test1"), "Localized Trivial Test 1");
    assert.equal(IModelApp.i18n.translate("TestApp:TrivialTests.Test2"), "Localized Trivial Test 2");
    assert.equal(IModelApp.i18n.translate("LocateFailure.NoElements"), "No Elements Found", "message from default (iModelJs) namespace");

    // there is no key for TrivialTest.Test3
    assert.equal(IModelApp.i18n.translate("TestApp:TrivialTests.Test3"), "TrivialTests.Test3");

    // Should properly substitute the values in localized strings with interpolations
    assert.equal(IModelApp.i18n.translate("TestApp:SubstitutionTests.Test1", { varA: "Variable1", varB: "Variable2" }), "Substitute Variable1 and Variable2");
    assert.equal(IModelApp.i18n.translate("TestApp:SubstitutionTests.Test2", { varA: "Variable1", varB: "Variable2" }), "Reverse substitute Variable2 and Variable1");

    assert.equal(IModelApp.translateStatus(IModelStatus.AlreadyOpen), "Already open");
    assert.equal(IModelApp.translateStatus(IModelStatus.DuplicateCode), "Duplicate code");
    assert.equal(IModelApp.translateStatus(DbResult.BE_SQLITE_ERROR_AlreadyOpen), "Database already open");
    assert.equal(IModelApp.translateStatus(BentleyStatus.ERROR), "Error");
    assert.equal(IModelApp.translateStatus(BentleyStatus.SUCCESS), "Success");
    assert.equal(IModelApp.translateStatus(101), "DbResult.BE_SQLITE_DONE");
    assert.equal(IModelApp.translateStatus(11111), "Status: 11111");
    assert.equal(IModelApp.translateStatus(undefined as any), "Illegal value");

  });

  it("Should support WebGL", () => {
    expect(IModelApp.hasRenderSystem).to.be.true;
    let canvas = document.getElementById("WebGLTestCanvas") as HTMLCanvasElement;
    if (null === canvas) {
      canvas = document.createElement("canvas");
      if (null !== canvas) {
        canvas.id = "WebGLTestCanvas";
        document.body.appendChild(document.createTextNode("WebGL tests"));
        document.body.appendChild(canvas);
      }
    }
    canvas.width = 300;
    canvas.height = 150;
    expect(canvas).not.to.be.undefined;
    if (undefined !== canvas) {
      const context = canvas.getContext("webgl");
      expect(context).not.to.be.null;
      expect(context).not.to.be.undefined;
    }
  });

  it("Should create mock render system without WebGL", () => {
    expect(IModelApp.hasRenderSystem).to.be.true;
    expect(IModelApp.renderSystem).instanceof(MockRender.System);
  });

  it("Is globally accessible via window while active", async () => {
    const debug = window as { iModelAppForDebugger?: typeof IModelApp };
    expect(debug.iModelAppForDebugger).not.to.be.undefined;
    expect(debug.iModelAppForDebugger).to.equal(IModelApp);
    const viewMgr = debug.iModelAppForDebugger!.viewManager;
    expect(viewMgr).to.equal(IModelApp.viewManager);

    await TestApp.shutdown();
    expect(debug.iModelAppForDebugger).to.be.undefined;

    await TestApp.startup();
    expect(debug.iModelAppForDebugger).not.to.be.undefined;
    expect(debug.iModelAppForDebugger!.viewManager).to.equal(IModelApp.viewManager);
    expect(debug.iModelAppForDebugger!.viewManager).not.to.equal(viewMgr);
  });
});
