/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Primitives } from "@bentley/ui-abstract";
import { isPromiseLike } from "@bentley/ui-core";
import { ConvertedPrimitives, Point2dTypeConverter, Point3dTypeConverter } from "../../ui-components";
import { TypeConverter } from "../../ui-components/converters/TypeConverter";
import { TypeConverterManager } from "../../ui-components/converters/TypeConverterManager";
import TestUtils from "../TestUtils";

describe("Point2dTypeConverter", () => {

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  let converter: Point2dTypeConverter;

  beforeEach(() => {
    registerTestConverters();
    converter = new Point2dTypeConverter(TestSyncComponentConverter.NAME);
  });

  afterEach(() => {
    unregisterTestConverters();
  });

  describe("convertToString", () => {

    const runTests = (mode: "sync" | "async" | "partial-async") => {
      describe(`with ${mode} component converter`, () => {

        beforeEach(() => {
          switch (mode) {
            case "sync": converter.componentConverterName = TestSyncComponentConverter.NAME; break;
            case "async": converter.componentConverterName = TestAsyncComponentConverter.NAME; break;
            case "partial-async": converter.componentConverterName = TestPartialAsyncComponentConverter.NAME; break;
          }
        });

        it("returns correct string for strings' array input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString(["50", "100"]), "_50_, _100_");
        });

        it("returns correct string for numbers' array input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString([50, 100]), "_50_, _100_");
        });

        it("returns correct string for object input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString({ x: 50, y: 100 }), "_50_, _100_");
        });

        it("returns empty string if value is undefined", async () => {
          await expectOptionalPromiseLikeEq("sync", converter.convertToString(undefined), "");
        });

        it("returns empty string if value is an empty array", async () => {
          await expectOptionalPromiseLikeEq("sync", converter.convertToString([]), "");
        });

      });
    };

    runTests("sync");
    runTests("async");
    runTests("partial-async");

  });

  describe("convertFromString", () => {
    it("returns correct object", () => {
      const point2d = converter.convertFromString("50, 100");
      expect(point2d).to.not.be.undefined;
      expect(point2d!.x).to.equal(50);
      expect(point2d!.y).to.equal(100);
    });

    it("returns undefined if string is wrong", () => {
      expect(converter.convertFromString("50, 100, 150")).to.be.undefined;
    });
  });

  describe("sortCompare", () => {
    it("returns less than 0 when first value is invalid", () => {
      expect(converter.sortCompare(["a", "b", "c"], ["1", "2"])).to.be.lessThan(0);
    });

    it("returns greater than 0 when second value is invalid", () => {
      expect(converter.sortCompare(["1", "2"], ["a", "b", "c"])).to.be.greaterThan(0);
    });

    it("returns 0 if points are mirrored", () => {
      expect(converter.sortCompare(["1", "1"], ["-1", "-1"])).to.be.eq(0);
      expect(converter.sortCompare({ x: 1, y: 1 }, { x: -1, y: -1 })).to.be.eq(0);
    });

    it("returns less than 0 if second point is further from [0,0]", () => {
      expect(converter.sortCompare(["1", "1"], ["2", "2"])).to.be.lessThan(0);
    });

    it("returns greater than 0 if first point is further from [0,0]", () => {
      expect(converter.sortCompare(["2", "2"], ["1", "1"])).to.be.greaterThan(0);
    });
  });

});

describe("Point3dTypeConverter", () => {

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  let converter: Point3dTypeConverter;

  beforeEach(() => {
    registerTestConverters();
    converter = new Point3dTypeConverter(TestSyncComponentConverter.NAME);
  });

  afterEach(() => {
    unregisterTestConverters();
  });

  describe("convertToString", () => {

    const runTests = (mode: "sync" | "async" | "partial-async") => {
      describe(`with ${mode} component converter`, () => {

        beforeEach(() => {
          switch (mode) {
            case "sync": converter.componentConverterName = TestSyncComponentConverter.NAME; break;
            case "async": converter.componentConverterName = TestAsyncComponentConverter.NAME; break;
            case "partial-async": converter.componentConverterName = TestPartialAsyncComponentConverter.NAME; break;
          }
        });

        it("returns correct string for strings' array input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString(["50", "100", "150"]), "_50_, _100_, _150_");
        });

        it("returns correct string for numbers' array input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString([50, 100, 150]), "_50_, _100_, _150_");
        });

        it("returns correct string for object input", async () => {
          await expectOptionalPromiseLikeEq(mode, converter.convertToString({ x: 50, y: 100, z: 150 }), "_50_, _100_, _150_");
        });

        it("returns empty string if value is undefined", async () => {
          await expectOptionalPromiseLikeEq("sync", converter.convertToString(undefined), "");
        });

      });
    };

    runTests("sync");
    runTests("async");
    runTests("partial-async");

  });

  describe("convertFromString", () => {
    it("returns correct object", () => {
      const point3d = converter.convertFromString("50, 100, 150") as ConvertedPrimitives.Point3d;
      expect(point3d).to.not.be.undefined;
      expect(point3d.x).to.equal(50);
      expect(point3d.y).to.equal(100);
      expect(point3d.z).to.equal(150);
    });

    it("returns undefined if string is wrong", () => {
      expect(converter.convertFromString("50, 100")).to.be.undefined;
    });
  });

  describe("sortCompare", () => {
    it("returns less than 0 when first value is invalid", () => {
      expect(converter.sortCompare(["a", "b", "c"], ["1", "2", "1"])).to.be.lessThan(0);
    });

    it("returns 0 if points are mirrored", () => {
      expect(converter.sortCompare(["1", "1", "-2"], ["-1", "-1", "2"])).to.be.eq(0);
      expect(converter.sortCompare({ x: 1, y: 1, z: -2 }, { x: -1, y: -1, z: 2 })).to.be.eq(0);
    });

    it("returns less than 0 if second point is further from [0,0,0]", () => {
      expect(converter.sortCompare(["1", "1", "1"], ["2", "2", "2"])).to.be.lessThan(0);
    });

    it("returns greater than 0 if first point is further from [0,0,0]", () => {
      expect(converter.sortCompare(["2", "2", "2"], ["1", "1", "1"])).to.be.greaterThan(0);
    });

    it("returns 0 if 2d points are mirrored", () => {
      expect(converter.sortCompare(["1", "1"], ["-1", "-1"])).to.be.eq(0);
      expect(converter.sortCompare({ x: 1, y: 1 }, { x: -1, y: -1 })).to.be.eq(0);
    });
  });
});

class TestSyncComponentConverter extends TypeConverter {
  public static NAME = "test-sync-component-converter";
  public override convertToString(value?: Primitives.Value) { return `_${(value ?? "").toString()}_`; }
  public sortCompare() { return 0; }
}

class TestAsyncComponentConverter extends TypeConverter {
  public static NAME = "test-async-component-converter";
  public override async convertToString(value?: Primitives.Value) { return `_${(value ?? "").toString()}_`; }
  public sortCompare(): number { return 0; }
}

class TestPartialAsyncComponentConverter extends TypeConverter {
  public static NAME = "test-partial-async-component-converter";
  public override convertToString(value?: Primitives.Value) {
    const result = `_${(value ?? "").toString()}_`;
    return (value && value.toString() === "100") ? Promise.resolve(result) : result;
  }
  public sortCompare(): number { return 0; }
}

const registerTestConverters = () => {
  TypeConverterManager.registerConverter(TestSyncComponentConverter.NAME, TestSyncComponentConverter);
  TypeConverterManager.registerConverter(TestAsyncComponentConverter.NAME, TestAsyncComponentConverter);
  TypeConverterManager.registerConverter(TestPartialAsyncComponentConverter.NAME, TestPartialAsyncComponentConverter);
};
const unregisterTestConverters = () => {
  TypeConverterManager.unregisterConverter(TestSyncComponentConverter.NAME);
  TypeConverterManager.unregisterConverter(TestAsyncComponentConverter.NAME);
  TypeConverterManager.unregisterConverter(TestPartialAsyncComponentConverter.NAME);
};

const expectOptionalPromiseLikeEq = async (mode: "sync" | "async" | "partial-async", actual: string | Promise<string>, expected: string) => {
  if (mode === "sync") {
    expect(isPromiseLike(actual)).to.be.false;
    expect(actual).to.eq(expected);
  } else {
    expect(isPromiseLike(actual)).to.be.true;
    await expect(actual).to.eventually.eq(expected);
  }
};
