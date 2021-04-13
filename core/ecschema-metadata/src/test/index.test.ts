/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as ECStringConstants from "../Constants";
import * as Context from "../Context";
import * as DelayedPromise from "../DelayedPromise";
import * as SchemaGraphUtil from "../Deserialization/SchemaGraphUtil";
import * as ECObjects from "../ECObjects";
import * as Index from "../ecschema-metadata";
import * as Exception from "../Exception";
import * as Interfaces from "../Interfaces";
import { ECClass, StructClass } from "../Metadata/Class";
import * as Constant from "../Metadata/Constant";
import * as CustomAttributeClass from "../Metadata/CustomAttributeClass";
import { EntityClass } from "../Metadata/EntityClass";
import { Enumeration } from "../Metadata/Enumeration";
import * as Format from "../Metadata/Format";
import * as InvertedUnit from "../Metadata/InvertedUnit";
import * as KindOfQuantity from "../Metadata/KindOfQuantity";
import * as Mixin from "../Metadata/Mixin";
import * as OverrideFormat from "../Metadata/OverrideFormat";
import * as Phenomenon from "../Metadata/Phenomenon";
import * as Property from "../Metadata/Property";
import * as PropertyCategory from "../Metadata/PropertyCategory";
import * as RelationshipClass from "../Metadata/RelationshipClass";
import { Schema } from "../Metadata/Schema";
import * as SchemaItem from "../Metadata/SchemaItem";
import * as Unit from "../Metadata/Unit";
import * as UnitSystem from "../Metadata/UnitSystem";
import * as PropertyTypes from "../PropertyTypes";
import * as SchemaKey from "../SchemaKey";

// new type with specified index signature
interface Dict {
  [key: string]: any;
}

// modules are not iterable. to traverse their members, the imports are spread into an object
const index: Dict = {
  ...Index,
};

/* eslint-disable @typescript-eslint/naming-convention */

const moduleImports: Dict = {
  ...ECObjects,
  ...ECStringConstants,
  ...Context,
  ...Interfaces,
  ...DelayedPromise,
  ...Exception,
  ...PropertyTypes,
  Schema,
  ...SchemaItem,
  ...SchemaKey,
  ECClass,
  StructClass,
  EntityClass,
  ...Mixin,
  ...RelationshipClass,
  ...CustomAttributeClass,
  Enumeration,
  ...KindOfQuantity,
  ...Constant,
  ...Format,
  ...OverrideFormat,
  ...InvertedUnit,
  ...Phenomenon,
  ...Unit,
  ...UnitSystem,
  ...PropertyCategory,
  ...Property,
  ...SchemaGraphUtil,
};

describe("Index", () => {
  it("should successfully import Index module", () => {
    expect(index).to.not.be.undefined;
  });

  it("should match the explicit module imports", () => {
    for (const name in moduleImports) {
      if (name.startsWith("Mutable"))
        continue;

      expect(index.hasOwnProperty(name), `The type '${name}' is missing from the index.ts barrel module.`).true;
    }
  });

  it("Ensure no Mutable classes are exported", () => {
    // eslint-disable-next-line guard-for-in
    for (const name in index)
      expect(!name.startsWith("Mutable"), `The class '${name}' should not be exported from the index.ts file.`).true;
  });
});
