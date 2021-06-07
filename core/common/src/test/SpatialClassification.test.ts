/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Id64String } from "@bentley/bentleyjs-core";
import {
  SpatialClassifier, SpatialClassifierFlags, SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay, SpatialClassifierProps, SpatialClassifiers,
  SpatialClassifiersContainer,
} from "../SpatialClassification";

describe("SpatialClassifierFlags", () => {
  it("normalizes display mode", () => {
    const tests: Array<[number, number | undefined, number | undefined]> = [
      [ SpatialClassifierInsideDisplay.Off, undefined, undefined ],
      [ SpatialClassifierInsideDisplay.On, undefined, undefined ],
      [ SpatialClassifierInsideDisplay.Dimmed, undefined, undefined ],
      [ SpatialClassifierInsideDisplay.Hilite, undefined, SpatialClassifierOutsideDisplay.Dimmed ],
      [ SpatialClassifierInsideDisplay.ElementColor, undefined, SpatialClassifierOutsideDisplay.Dimmed ],
      [ -1, SpatialClassifierInsideDisplay.ElementColor, SpatialClassifierOutsideDisplay.Dimmed ],
      [ 5, SpatialClassifierInsideDisplay.ElementColor, SpatialClassifierOutsideDisplay.Dimmed ],
    ];

    for (const test of tests) {
      const flags = SpatialClassifierFlags.fromJSON({ inside: test[0], outside: test[0] });
      expect(flags.inside).to.equal(test[1] ?? test[0]);
      expect(flags.outside).to.equal(test[2] ?? test[0]);
    }
  });
});

describe("SpatialClassifiers", () => {
  function makeClassifier(modelId: Id64String, name: string, flags = new SpatialClassifierFlags(), expand = 0) {
    return new SpatialClassifier(modelId, name, flags, expand);
  }

  function makeClassifierProps(classifier: SpatialClassifier, isActive?: boolean) {
    const props = classifier.toJSON();
    if (undefined !== isActive)
      props.isActive = isActive;

    return props;
  }

  function expectJson(actual: SpatialClassifierProps[] | undefined, expected: SpatialClassifierProps[] | undefined) {
    expect(actual).to.deep.equal(expected);
  }

  it("populates from JSON", () => {
    const json: SpatialClassifiersContainer = { };
    let set = new SpatialClassifiers({ });
    expect(set.size).to.equal(0);
    expect(json.classifiers).to.be.undefined;

    const c1 = makeClassifier("0x1c", "c1");
    const c2 = makeClassifier("0x2c", "c2", undefined, 12);
    set = new SpatialClassifiers({ classifiers: [c1.toJSON(), c2.toJSON()] });
    expect(set.size).to.equal(2);
    expect(set.active).to.be.undefined;
    expect(set.has(c1)).to.be.true;
    expect(set.has(c2)).to.be.true;
  });

  it("uses first active classifier", () => {
    const json: SpatialClassifiersContainer = {
      classifiers: [
        makeClassifierProps(makeClassifier("0x1c", "c1"), false),
        makeClassifierProps(makeClassifier("0x2c", "c2"), true),
        makeClassifierProps(makeClassifier("0x3c", "c3"), true),
        makeClassifierProps(makeClassifier("0x4c", "c4"), false),
      ],
    };

    const set = new SpatialClassifiers(json);
    const active = set.active!;
    expect(active).not.to.be.undefined;
    expect(active.modelId).to.equal("0x2c");
    for (const props of json.classifiers!)
      expect(props.isActive).to.equal(props.modelId === "0x2c");
  });

  it("sets active classifier", () => {
    const classifiers = [
      makeClassifier("0x1", "1"),  makeClassifier("0x2", "2"), makeClassifier("0x3", "3"),
    ];

    const json = { classifiers: classifiers.map((x) => x.toJSON()) };
    const set = new SpatialClassifiers(json);
    expect(set.size).to.equal(3);
    expect(set.active).to.be.undefined;

    for (const classifier of set) {
      expect(set.setActive(classifier)).to.equal(classifier);
      expect(set.active).to.equal(classifier);
      for (const props of json.classifiers)
        expect(props.isActive).to.equal(props.name === classifier.name);

      expect(set.setActive(undefined)).to.be.undefined;
      expect(set.active).to.be.undefined;
      for (const props of json.classifiers)
        expect(props.isActive).to.be.false;
    }

    for (const classifier of classifiers) {
      expect(set.setActive(classifier)).not.to.equal(classifier);
      expect(set.active).not.to.equal(classifier);
      expect(set.active).to.equal(set.findEquivalent(classifier));
    }

    const prevActive = set.active;
    expect(prevActive).not.to.be.undefined;
    expect(set.setActive(makeClassifier("0x4", "4"))).to.equal(prevActive);
    expect(set.active).to.equal(prevActive);

    expect(set.setActive(undefined)).to.be.undefined;
    expect(set.active).to.be.undefined;

    expect(set.setActive(makeClassifier("0x5", "5"))).to.be.undefined;
    expect(set.active).to.be.undefined;
  });

  it("adds classifiers", () => {
    const json = { classifiers: [ makeClassifier("0x1", "1").toJSON() ] };
    const set = new SpatialClassifiers(json);
    expect(set.size).to.equal(1);

    const c2 = makeClassifier("0x2", "2");
    expect(set.add(c2)).to.equal(c2);
    expect(set.size).to.equal(2);
    expect(set.has(c2)).to.be.true;

    const c1 = makeClassifier("0x1", "1");
    expect(set.add(c1)).not.to.equal(c1);
    expect(set.size).to.equal(2);
    expect(set.add(c1)).to.equal(set.findEquivalent(c1));
    expect(set.has(c1)).to.be.true;

    const c = makeClassifier("0x1", "1", undefined, 12);
    expect(set.add(c)).to.equal(c);
    expect(set.size).to.equal(3);
    expect(set.has(c)).to.be.true;

    expectJson(json.classifiers, [
      makeClassifier("0x1", "1").toJSON(), makeClassifier("0x2", "2").toJSON(), makeClassifier("0x1", "1", undefined, 12).toJSON(),
    ]);
  });

  it("deletes classifiers", () => {
    const json = { classifiers: [ makeClassifier("0x1", "1").toJSON(), makeClassifier("0x2", "2").toJSON(), makeClassifier("0x3", "3").toJSON() ] };
    const set = new SpatialClassifiers(json);
    expect(set.size).to.equal(3);

    const c2 = set.findEquivalent(makeClassifier("0x2", "2"))!;
    expect(c2).not.to.be.undefined;
    expect(set.delete(c2)).to.equal(c2);
    expect(set.size).to.equal(2);
    expect(set.delete(c2)).to.be.undefined;
    expect(set.size).to.equal(2);
    expectJson(json.classifiers, [ makeClassifier("0x1", "1").toJSON(), makeClassifier("0x3", "3").toJSON() ]);

    const c1 = makeClassifier("0x1", "1");
    const c1FromSet = set.findEquivalent(c1)!;
    expect(c1FromSet).not.to.be.undefined;
    expect(c1FromSet).not.to.equal(c1);
    expect(set.delete(c1)).to.equal(c1FromSet);
    expect(set.size).to.equal(1);
    expectJson(json.classifiers, [ makeClassifier("0x3", "3").toJSON() ]);

    for (const c of set)
      expect(set.delete(c)).to.equal(c);

    expect(set.size).to.equal(0);
    expectJson(json.classifiers, undefined);

    expect(set.add(makeClassifier("0x1", "1"))).not.to.be.undefined;
    expect(set.size).to.equal(1);
    expectJson(json.classifiers, [ makeClassifier("0x1", "1").toJSON() ]);

    expect(set.delete(makeClassifier("0x4", "4"))).to.be.undefined;
    expect(set.size).to.equal(1);
  });

  it("resets active classifier if deleted", () => {
    const set = new SpatialClassifiers({ classifiers: [
      makeClassifier("0x1", "1").toJSON(), makeClassifierProps(makeClassifier("0x2", "2"), true), makeClassifier("0x3", "3").toJSON(),
    ]});
    expect(set.active!.name).to.equal("2");

    set.delete(set.active!);
    expect(set.active).to.be.undefined;

    expect(set.setActive(makeClassifier("0x3", "3"))).not.to.be.undefined;
    expect(set.active).not.to.be.undefined;
    set.delete(makeClassifier("0x1", "1"));
    expect(set.active).not.to.be.undefined;
    expect(set.active!.name).to.equal("3");

    set.delete(makeClassifier("0x3", "3"));
    expect(set.active).to.be.undefined;
    expect(set.size).to.equal(0);
  });

  it("clears classifiers", () => {
    const json = { classifiers: [ makeClassifier("0x1", "1").toJSON(), makeClassifier("0x2", "2").toJSON() ] };
    const set = new SpatialClassifiers(json);
    expect(set.size).to.equal(2);

    set.clear();
    expect(set.size).to.equal(0);
    expectJson(json.classifiers, undefined);
  });

  it("resets active classifier when cleared", () => {
    const set = new SpatialClassifiers({ classifiers: [
      makeClassifierProps(makeClassifier("0x1", "1"), true), makeClassifier("0x2", "2").toJSON(),
    ]});
    expect(set.active).not.to.be.undefined;
    set.clear();
    expect(set.active).to.be.undefined;
  });

  it("replaces classifiers", () => {
    const json = { classifiers: [ makeClassifier("0x1", "1").toJSON(), makeClassifier("0x2", "2").toJSON(), makeClassifierProps(makeClassifier("0x3", "3"), true) ] };
    const set = new SpatialClassifiers(json);

    const c2 = set.findEquivalent(makeClassifier("0x2", "2"))!;
    expect(c2.flags.inside).to.equal(SpatialClassifierInsideDisplay.ElementColor);
    expect(c2.flags.outside).to.equal(SpatialClassifierOutsideDisplay.Dimmed);
    expect(c2.expand).to.equal(0);

    const c2New = c2.clone({ flags: c2.flags.clone({ inside: SpatialClassifierInsideDisplay.Hilite }).toJSON(), expand: 12 });
    expect(set.replace(c2, c2New)).to.be.true;
    expect(c2New.equals(c2)).to.be.false;
    expect(c2New.flags.inside).to.equal(SpatialClassifierInsideDisplay.Hilite);
    expect(c2New.flags.outside).to.equal(SpatialClassifierOutsideDisplay.Dimmed);
    expect(c2New.expand).to.equal(12);
    expect(set.size).to.equal(3);
    expect(set.has(c2New)).to.be.true;
    expect(set.has(c2)).to.be.false;

    const c1 = makeClassifier("0x1", "1");
    const c1New = c1.clone({ name: "1new" });
    expect(set.replace(c1, c1New)).to.be.true;
    expect(set.has(c1New)).to.be.true;
    expect(set.has(c1)).to.be.false;
    expect(c1New.name).to.equal("1new");

    expect(set.active).not.to.be.undefined;
    expect(set.active!.name).to.equal("3");
    const c3New = makeClassifier("0x3", "3new");
    expect(set.replace(makeClassifier("0x3", "3"), c3New)).to.be.true;
    expect(set.active).to.equal(c3New);
    expect(set.active!.name).to.equal("3new");

    expectJson(json.classifiers, [ c1New.toJSON(), c2New.toJSON(), makeClassifierProps(c3New, true) ]);

    expect(set.replace(makeClassifier("0x4", "4"), makeClassifier("0x4", "4new"))).to.be.false;

    set.clear();
    expect(set.replace(c3New, makeClassifier("0x3", "3newer"))).to.be.false;
  });
});
