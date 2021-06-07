/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { DbResult } from "@bentley/bentleyjs-core";
import { ECSqlStatement, ECSqlValue, IModelDb } from "@bentley/imodeljs-backend";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { createRandomId } from "@bentley/presentation-common/lib/test/_helpers/random";
import { getElementKey, normalizeVersion } from "../presentation-backend/Utils";

describe("getElementKey", () => {

  const imodel = moq.Mock.ofType<IModelDb>();
  const stmt = moq.Mock.ofType<ECSqlStatement>();

  beforeEach(() => {
    stmt.reset();
    imodel.reset();
    imodel.setup((x) => x.withPreparedStatement(moq.It.isAnyString(), moq.It.isAny()))
      .callback((_query: string, cb: (stmt: ECSqlStatement) => void) => {
        cb(stmt.object);
      });
  });

  it("returns valid key for existing id", () => {
    const id = createRandomId();

    const sqlQueryResult = moq.Mock.ofType<ECSqlValue>();
    sqlQueryResult.setup((x) => x.getClassNameForClassId()).returns(() => "schema.class");

    stmt.setup((x) => x.bindId(1, id)).verifiable(moq.Times.once());
    stmt.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_ROW).verifiable(moq.Times.once());
    stmt.setup((x) => x.getValue(0)).returns(() => sqlQueryResult.object).verifiable(moq.Times.once());

    const result = getElementKey(imodel.object, id);
    stmt.verifyAll();
    expect(result).to.deep.eq({ className: "schema:class", id });
  });

  it("returns undefined for non-existing id", () => {
    const id = "does-not-exist";

    stmt.setup((x) => x.bindId(1, id)).verifiable(moq.Times.once());
    stmt.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_DONE).verifiable(moq.Times.once());
    stmt.setup((x) => x.getValue(0)).verifiable(moq.Times.never());

    const result = getElementKey(imodel.object, id);
    stmt.verifyAll();
    expect(result).to.be.undefined;
  });

});

describe("getNormalizedVersion", () => {

  it("returns normalized version", () => {
    expect(normalizeVersion(undefined)).to.eq("0.0.0");
    expect(normalizeVersion("1.2.3")).to.eq("1.2.3");
    expect(normalizeVersion("01.002.0003")).to.eq("1.2.3");
  });

  it("returns `0.0.0` on invalid version string", () => {
    expect(normalizeVersion("invalid")).to.eq("0.0.0");
  });

});
