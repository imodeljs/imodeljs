/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { dispose } from "@bentley/bentleyjs-core";
import { ClipVector, Point3d, Transform } from "@bentley/geometry-core";
import { IModelApp } from "../../../IModelApp";
import { GraphicBranch } from "../../../render/GraphicBranch";
import { createEmptyRenderPlan } from "../../../render/RenderPlan";
import { ClipStack } from "../../../render/webgl/ClipStack";
import { ClipVolume } from "../../../render/webgl/ClipVolume";
import { Branch } from "../../../render/webgl/Graphic";
import { Target } from "../../../render/webgl/Target";
import { ViewRect } from "../../../ViewRect";

function makeClipVolume(): ClipVolume {
  const vec = ClipVector.createEmpty();
  expect(vec.appendShape([ Point3d.create(1, 1, 0), Point3d.create(2, 1, 0), Point3d.create(2, 2, 0)])).to.be.true;
  const vol = ClipVolume.create(vec)!;
  expect(vol).not.to.be.undefined;
  return vol;
}

interface ClipInfo {
  clip?: ClipVolume;
  noViewClip?: boolean; // undefined means inherit from parent on branch stack
}

function makeBranch(info: ClipInfo): Branch {
  const branch = new GraphicBranch();
  if (undefined !== info.noViewClip)
    branch.viewFlagOverrides.setShowClipVolume(!info.noViewClip);

  const graphic = IModelApp.renderSystem.createGraphicBranch(branch, Transform.identity, { clipVolume: info.clip });
  expect(graphic instanceof Branch).to.be.true;
  return graphic as Branch;
}

function makeTarget(): Target {
  const rect = new ViewRect(0, 0, 100, 50);
  return IModelApp.renderSystem.createOffscreenTarget(rect) as Target;
}

function expectClipStack(target: Target, expected: Array<{ numRows: number }>): void {
  const actual = target.uniforms.branch.clipStack.clips;
  expect(actual.length).to.equal(expected.length);
  expect(actual.length).least(1);

  const actualView = actual[0];
  const expectedView = expected[0];
  expect(actualView.numRows).to.equal(expectedView.numRows);
  expect(actualView instanceof ClipVolume).to.equal(expectedView instanceof ClipVolume);
  if (actualView instanceof ClipVolume && expectedView instanceof ClipVolume)
    expect(actualView.clipVector).to.equal(expectedView.clipVector);

  for (let i = 1; i < actual.length; i++)
    expect(actual[i]).to.equal(expected[i]);
}

/** Inputs:
 * - The view clip and ViewFlags.clipVolume
 * - A stack of branches to be pushed
 * - The expected stack of ClipVolumes on the ClipStack, including the view clip, after pushing all branches.
 * - Whether we expect the view's clip to apply to the top branch.
 */
function testBranches(viewClip: ClipInfo, branches: ClipInfo[], expectViewClip: boolean, expectedClips: Array<{ numRows: number }>): void {
  const plan = { ...createEmptyRenderPlan(), clip: viewClip.clip?.clipVector };
  plan.viewFlags.clipVolume = true !== viewClip.noViewClip;

  const target = makeTarget();
  target.changeRenderPlan(plan);
  target.pushViewClip();

  const uniforms = target.uniforms.branch;
  expect(uniforms.length).to.equal(1);
  const prevClips = [ ...uniforms.clipStack.clips ];
  const hadClip = uniforms.clipStack.hasClip;
  const hadViewClip = uniforms.clipStack.hasViewClip;

  for (const branch of branches)
    target.pushBranch(makeBranch(branch));

  expect(uniforms.clipStack.hasViewClip).to.equal(expectViewClip);
  expect(uniforms.clipStack.hasClip).to.equal(expectViewClip || expectedClips.length > 1);
  expectClipStack(target, expectedClips);

  for (const _branch of branches)
    target.popBranch();

  expect(uniforms.clipStack.hasViewClip).to.equal(hadViewClip);
  expect(uniforms.clipStack.hasClip).to.equal(hadClip);
  expectClipStack(target, prevClips);

  dispose(target);
}

describe("BranchUniforms", async () => {
  before(async () => {
    await IModelApp.startup();
  });

  after(async () => {
    await IModelApp.shutdown();
  });

  it("should set view clip based on RenderPlan", () => {
    testBranches({ }, [], false, [ ClipStack.emptyViewClip ]);
    testBranches({ noViewClip: true }, [], false, [ ClipStack.emptyViewClip ]);

    const clip = makeClipVolume();
    testBranches({ clip }, [], true, [ clip ]);
    testBranches({ clip, noViewClip: true }, [], false, [ clip ]);
  });

  it("should propagate view clip to branches based on view flags", () => {
    const clip = makeClipVolume();
    testBranches({ clip }, [{}], true, [clip]);
    testBranches({ clip, noViewClip: true }, [{}], false, [clip]);
    testBranches({ clip }, [{ noViewClip: true }], false, [clip]);
    testBranches({ clip }, [{ noViewClip: true }, { noViewClip: false }], true, [clip]);
    testBranches({ clip }, [{ noViewClip: false }, {noViewClip: true }], false, [clip]);
  });

  it("should apply branch clips regardless of view flags", () => {
    const viewClip = makeClipVolume();
    const branchClip = makeClipVolume();
    testBranches({ clip: viewClip }, [{ clip: branchClip }], true, [viewClip, branchClip]);
    testBranches({ clip: viewClip, noViewClip: true }, [{ clip: branchClip }], false, [viewClip, branchClip]);
    testBranches({ clip: viewClip }, [{ clip: branchClip, noViewClip: true }], false, [viewClip, branchClip]);
    testBranches({ clip: viewClip }, [{ clip: branchClip, noViewClip: true }, { }], false, [viewClip, branchClip]);
    testBranches({ clip: viewClip }, [{ clip: branchClip, noViewClip: true }, { noViewClip: true }], false, [viewClip, branchClip]);
  });

  it("should nest clip volumes", () => {
    const viewClip = makeClipVolume();
    const outerClip = makeClipVolume();
    const innerClip = makeClipVolume();

    testBranches({ clip: viewClip }, [{ clip: outerClip }, { clip: innerClip }], true, [viewClip, outerClip, innerClip]);
  });
});
