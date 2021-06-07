/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ECName } from "../../ECName";
import { ECObjectsError } from "../../Exception";

describe("ECName", () => {
  it("validates", () => {
    function expectValid(input: string): void {
      const name = new ECName(input);
      expect(name.name).to.equal(input);
    }

    function expectInvalid(input: string): void {
      expect(() => expectValid(input)).to.throw(ECObjectsError);
    }

    expectValid("ThisIsAValidName");
    expectValid("_123");
    expectValid("___");
    expectValid("A123");

    expectInvalid("");
    expectInvalid("1_C");
    expectInvalid("!ABC");
    expectInvalid("ABC@");
  });

  const testcases = [
    [ "NothingSpecial", "NothingSpecial" ],
    [ "Nothing1Special2", "Nothing1Special2" ],
    [ "1_LeadingDigitsDisallowed", "__x0031___LeadingDigitsDisallowed" ],
    [ "Special!", "Special__x0021__" ],
    [ "thing@mail.com", "thing__x0040__mail__x002E__com" ],
    [ "*", "__x002A__" ],
    [ "9&:", "__x0039____x0026____x003A__" ],
    [ "__xNotAChar__", "__xNotAChar__" ],
    [ "__xTTTT__", "__xTTTT__" ],
    [ "__x####__", "__x__x0023____x0023____x0023____x0023____" ],
    [ "\u822C\u6A21\u578B", "__x822C____x6A21____x578B__" ],
  ];

  it("encodes", () => {
    expect(() => ECName.encode("")).to.throw(ECObjectsError);

    for (const testcase of testcases) {
      const name = ECName.encode(testcase[0]);
      expect(name.name).to.equal(testcase[1]);
    }
  });

  it("decodes", () => {
    for (const testcase of testcases) {
      const name = new ECName(testcase[1]);
      expect(name.decode()).to.equal(testcase[0]);
    }
  });
});
