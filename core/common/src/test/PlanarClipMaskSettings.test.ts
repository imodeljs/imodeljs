/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PlanarClipMaskMode, PlanarClipMaskProps, PlanarClipMaskSettings } from "../PlanarClipMask";

function expectProps(mask: PlanarClipMaskSettings, expected: PlanarClipMaskProps): void {
  const actual = mask.toJSON();
  expect(actual).to.deep.equal(expected);
}

describe("PlanarClipMaskSettings", () => {
  it("uses defaults", () => {
    expect(PlanarClipMaskSettings.fromJSON()).to.equal(PlanarClipMaskSettings.defaults);
    expect(PlanarClipMaskSettings.fromJSON({ mode: PlanarClipMaskMode.None })).not.to.equal(PlanarClipMaskSettings.defaults);
    expect(PlanarClipMaskSettings.fromJSON({ mode: undefined } as unknown as PlanarClipMaskProps)).to.equal(PlanarClipMaskSettings.defaults);
  });

  it("clamps transparency", () => {
    expect(PlanarClipMaskSettings.createByPriority(1, -0.1).transparency).to.equal(0);
    expect(PlanarClipMaskSettings.createByPriority(1, 0).transparency).to.equal(0);
    expect(PlanarClipMaskSettings.createByPriority(1, 0.1).transparency).to.equal(0.1);
    expect(PlanarClipMaskSettings.createByPriority(1, 0.9).transparency).to.equal(0.9);
    expect(PlanarClipMaskSettings.createByPriority(1, 1).transparency).to.equal(1);
    expect(PlanarClipMaskSettings.createByPriority(1, 1.1).transparency).to.equal(1);
  });

  it("creates for models", () => {
    expectProps(PlanarClipMaskSettings.createForModels(undefined), { mode: PlanarClipMaskMode.Models });
    expectProps(PlanarClipMaskSettings.createForModels(["0x3", "0x1"]), { mode: PlanarClipMaskMode.Models, modelIds: "+1+2" });
    expectProps(PlanarClipMaskSettings.createForModels("0xabc", 0.5), { mode: PlanarClipMaskMode.Models, modelIds: "+ABC", transparency: 0.5 });
  });

  it("creates for elements or subcategories", () => {
    expectProps(PlanarClipMaskSettings.createForElementsOrSubCategories(PlanarClipMaskMode.IncludeElements, "0x5"),
      { mode: PlanarClipMaskMode.IncludeElements, subCategoryOrElementIds: "+5"});
    expectProps(PlanarClipMaskSettings.createForElementsOrSubCategories(PlanarClipMaskMode.ExcludeElements, ["0x1", "0x5"], "0x2"),
      { mode: PlanarClipMaskMode.ExcludeElements, subCategoryOrElementIds: "+1+4", modelIds: "+2" });
    expectProps(PlanarClipMaskSettings.createForElementsOrSubCategories(PlanarClipMaskMode.IncludeSubCategories, "0x2", undefined, 0.5),
      { mode: PlanarClipMaskMode.IncludeSubCategories, subCategoryOrElementIds: "+2", transparency: 0.5 });
  });

  it("creates by priority", () => {
    expectProps(PlanarClipMaskSettings.createByPriority(1234), { mode: PlanarClipMaskMode.Priority, priority: 1234 });
    expectProps(PlanarClipMaskSettings.createByPriority(-321, 0.75), { mode: PlanarClipMaskMode.Priority, priority: -321, transparency: 0.75 });
  });

  it("clones", () => {
    const src = PlanarClipMaskSettings.fromJSON({
      mode: PlanarClipMaskMode.Priority,
      priority: 12,
      transparency: 0.5,
      modelIds: "+1+5",
      subCategoryOrElementIds: "+2+4",
    });

    expect(src.clone(undefined)).to.equal(src);

    function expectClone(changed: PlanarClipMaskProps, expected: PlanarClipMaskProps): void {
      expect(src.clone(changed).toJSON()).to.deep.equal(expected);
    }

    expectClone({ mode: PlanarClipMaskMode.Models, subCategoryOrElementIds: undefined },
      { mode: PlanarClipMaskMode.Models, priority: 12, modelIds: "+1+5", transparency: 0.5 });
    expectClone({ transparency: undefined, priority: undefined, mode: PlanarClipMaskMode.None },
      { mode: PlanarClipMaskMode.None, modelIds: "+1+5", subCategoryOrElementIds: "+2+4" });
  });
});
