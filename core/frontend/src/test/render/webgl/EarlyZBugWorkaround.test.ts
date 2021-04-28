/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Capabilities, WebGLContext } from "@bentley/webgl-compatibility";
import { IModelApp } from "../../../IModelApp";
import { RenderSystem } from "../../../render/RenderSystem";
import { CompileStatus, ShaderProgram } from "../../../render/webgl/ShaderProgram";
import { System } from "../../../render/webgl/System";

class TestSystem extends System {
  private static _simulateBug = true;

  protected constructor(canvas: HTMLCanvasElement, context: WebGLContext, capabilities: Capabilities, options: RenderSystem.Options) {
    capabilities.driverBugs.fragDepthDoesNotDisableEarlyZ = TestSystem._simulateBug ? true : undefined;
    super(canvas, context, capabilities, options);
  }

  public static async startIModelApp(simulateBug: boolean): Promise<void> {
    this._simulateBug = simulateBug;
    return IModelApp.startup({
      renderSys: this.create({ preserveShaderSourceCode: true }),
    });
  }
}

function containsDiscardStatement(program: ShaderProgram): boolean {
  return -1 !== program.fragSource.indexOf("discard;");
}

function containsWorkaround(program: ShaderProgram): boolean {
  const workaround = "if (v_eyeSpace.z == 9999999.0) discard;";
  return -1 !== program.fragSource.indexOf(workaround);
}

describe("Early Z driver bug workaround", () => {
  after(async () => {
    await IModelApp.shutdown();
  });

  it("applies to shaders lacking discard statements when buggy driver is detected", async () => {
    // Figure out which shaders the workaround should apply to.
    await TestSystem.startIModelApp(false);
    const indicesOfShadersLackingDiscard: number[] = [];
    let index = 0;
    TestSystem.instance.techniques.forEachVariedProgram((program: ShaderProgram) => {
      expect(containsWorkaround(program)).to.be.false;
      if (!containsDiscardStatement(program))
        indicesOfShadersLackingDiscard.push(index);

      ++index;
    });

    expect(indicesOfShadersLackingDiscard.length === 0).to.be.false;

    // Now simulate the bug and confirm (1) workaround applied *only* to shaders that require it and (2) those shaders compile cleanly.
    await IModelApp.shutdown();
    await TestSystem.startIModelApp(true);
    index = 0;
    TestSystem.instance.techniques.forEachVariedProgram((program: ShaderProgram) => {
      expect(containsDiscardStatement(program)).to.be.true;
      const needsWorkaround = -1 !== indicesOfShadersLackingDiscard.indexOf(index);
      expect(containsWorkaround(program)).to.equal(needsWorkaround);
      if (needsWorkaround)
        expect(program.compile()).to.equal(CompileStatus.Success);

      index++;
    });
  }).timeout(95000);
});
