/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { parse as parseVersion } from "semver";
import { ClientRequestContext, DbResult, Id64String } from "@bentley/bentleyjs-core";
import { Element, IModelDb } from "@bentley/imodeljs-backend";
import { InstanceKey } from "@bentley/presentation-common";

/** @internal */
export function getElementKey(imodel: IModelDb, id: Id64String): InstanceKey | undefined {
  let key: InstanceKey | undefined;
  const query = `SELECT ECClassId FROM ${Element.classFullName} e WHERE ECInstanceId = ?`;
  imodel.withPreparedStatement(query, (stmt) => {
    try {
      stmt.bindId(1, id);
      if (stmt.step() === DbResult.BE_SQLITE_ROW)
        key = { className: stmt.getValue(0).getClassNameForClassId().replace(".", ":"), id };
    } catch { }
  });
  return key;
}

/**
 * A type that injects [[ClientRequestContext]] attribute into another given type. *
 * @public
 */
export type WithClientRequestContext<T> = T & {
  /** Context of a client request */
  requestContext: ClientRequestContext;
};

/** @internal */
export function isEnum<TEnum>(e: TEnum, arg: any): arg is TEnum[keyof TEnum] {
  return Object.values(e).includes(arg as TEnum[keyof TEnum]);
}

/** @internal */
export function normalizeVersion(version?: string) {
  if (version) {
    const parsedVersion = parseVersion(version, true);
    if (parsedVersion)
      return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
  }
  return "0.0.0";
}
