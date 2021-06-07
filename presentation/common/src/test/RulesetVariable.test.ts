/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { CompressedId64Set, OrderedId64Iterable } from "@bentley/bentleyjs-core";
import {
  BooleanRulesetVariable, BooleanRulesetVariableJSON, Id64RulesetVariable, Id64RulesetVariableJSON, Id64sRulesetVariable, Id64sRulesetVariableJSON,
  IntRulesetVariable, IntRulesetVariableJSON, IntsRulesetVariable, IntsRulesetVariableJSON, RulesetVariable, StringRulesetVariable,
  StringRulesetVariableJSON, VariableValueTypes,
} from "../presentation-common/RulesetVariables";
import { createRandomId } from "./_helpers/random";

describe("RulesetVariable", () => {

  describe("toJSON", () => {

    it("serializes Id64[] to CompressedId64Set", () => {
      const ids = OrderedId64Iterable.sortArray([createRandomId(), createRandomId()]);
      const variable: Id64sRulesetVariable = {
        type: VariableValueTypes.Id64Array,
        id: "test",
        value: ids,
      };
      const json = RulesetVariable.toJSON(variable);
      expect(json).to.deep.eq({
        type: VariableValueTypes.Id64Array,
        id: "test",
        value: CompressedId64Set.compressIds(ids),
      });
    });

    it("returns non Id64[] variables as is", () => {
      const boolVariable: BooleanRulesetVariable = {
        type: VariableValueTypes.Bool,
        id: "test",
        value: true,
      };
      expect(RulesetVariable.toJSON(boolVariable)).to.eq(boolVariable);

      const intVariable: IntRulesetVariable = {
        type: VariableValueTypes.Int,
        id: "test",
        value: 123,
      };
      expect(RulesetVariable.toJSON(intVariable)).to.eq(intVariable);

      const intArrayVariable: IntsRulesetVariable = {
        type: VariableValueTypes.IntArray,
        id: "test",
        value: [123, 456],
      };
      expect(RulesetVariable.toJSON(intArrayVariable)).to.eq(intArrayVariable);

      const id64Variable: Id64RulesetVariable = {
        type: VariableValueTypes.Id64,
        id: "test",
        value: "0x123",
      };
      expect(RulesetVariable.toJSON(id64Variable)).to.eq(id64Variable);

      const stringVariable: StringRulesetVariable = {
        type: VariableValueTypes.String,
        id: "test",
        value: "123",
      };
      expect(RulesetVariable.toJSON(stringVariable)).to.eq(stringVariable);
    });

  });

  describe("fromJSON", () => {

    it("deserializes CompressedId64Set to Id64[]", () => {
      const ids = OrderedId64Iterable.sortArray([createRandomId(), createRandomId()]);
      const json: Id64sRulesetVariableJSON = {
        type: VariableValueTypes.Id64Array,
        id: "test",
        value: CompressedId64Set.compressIds(ids),
      };
      const variable = RulesetVariable.fromJSON(json);
      expect(variable).to.deep.eq({
        type: VariableValueTypes.Id64Array,
        id: "test",
        value: ids,
      });
    });

    it("returns non CompressedId64Set variables as is", () => {
      const boolVariable: BooleanRulesetVariableJSON = {
        type: VariableValueTypes.Bool,
        id: "test",
        value: true,
      };
      expect(RulesetVariable.fromJSON(boolVariable)).to.eq(boolVariable);

      const intVariable: IntRulesetVariableJSON = {
        type: VariableValueTypes.Int,
        id: "test",
        value: 123,
      };
      expect(RulesetVariable.fromJSON(intVariable)).to.eq(intVariable);

      const intArrayVariable: IntsRulesetVariableJSON = {
        type: VariableValueTypes.IntArray,
        id: "test",
        value: [123, 456],
      };
      expect(RulesetVariable.fromJSON(intArrayVariable)).to.eq(intArrayVariable);

      const id64Variable: Id64RulesetVariableJSON = {
        type: VariableValueTypes.Id64,
        id: "test",
        value: "0x123",
      };
      expect(RulesetVariable.fromJSON(id64Variable)).to.eq(id64Variable);

      const id64ArrayVariable: Id64sRulesetVariableJSON = {
        type: VariableValueTypes.Id64Array,
        id: "test",
        value: ["0x123", "0x456"],
      };
      expect(RulesetVariable.fromJSON(id64ArrayVariable)).to.eq(id64ArrayVariable);

      const stringVariable: StringRulesetVariableJSON = {
        type: VariableValueTypes.String,
        id: "test",
        value: "123",
      };
      expect(RulesetVariable.fromJSON(stringVariable)).to.eq(stringVariable);
    });

  });

});
