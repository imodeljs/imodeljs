/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Categories
 */

import { Id64, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import {
  BisCodeSpec, CategoryProps, Code, CodeScopeProps, CodeSpec, ElementProps, Rank, SubCategoryAppearance, SubCategoryProps,
} from "@bentley/imodeljs-common";
import { DefinitionElement } from "./Element";
import { IModelDb } from "./IModelDb";
import { CategoryOwnsSubCategories } from "./NavigationRelationship";

/** Defines the appearance for graphics in Geometric elements
 * @public
 */
export class SubCategory extends DefinitionElement {
  /** @internal */
  public static override get className(): string { return "SubCategory"; }
  /** The Appearance parameters for this SubCategory */
  public appearance: SubCategoryAppearance;
  /** Optional description of this SubCategory. */
  public description?: string;

  /** @internal */
  public constructor(props: SubCategoryProps, iModel: IModelDb) {
    super(props, iModel);
    this.appearance = new SubCategoryAppearance(props.appearance);
    this.description = JsonUtils.asString(props.description);
  }

  /** @internal */
  public override toJSON(): SubCategoryProps {
    const val = super.toJSON() as SubCategoryProps;
    val.appearance = this.appearance.toJSON();
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the SubCategory's name (its Code value). */
  public getSubCategoryName(): string { return this.code.value; }
  /** Get the Id of the SubCategory. */
  public getSubCategoryId(): Id64String { return this.id; }
  /** Get the Id of this SubCategory's parent Category. */
  public getCategoryId(): Id64String { return this.parent ? this.parent.id : Id64.invalid; }
  /** Check if this is the default SubCategory of its parent Category. */
  public get isDefaultSubCategory(): boolean { return IModelDb.getDefaultSubCategoryId(this.getCategoryId()) === this.getSubCategoryId(); }

  /** Create a Code for a SubCategory given a name that is meant to be unique within the scope of the specified parent Category.
   * @param iModel  The IModel
   * @param parentCategoryId The Id of the parent Category that owns the SubCategory and provides the scope for its name.
   * @param codeValue The name of the SubCategory
   */
  public static createCode(iModel: IModelDb, parentCategoryId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.subCategory);
    return new Code({ spec: codeSpec.id, scope: parentCategoryId, value: codeValue });
  }

  /** Create a new SubCategory
   * @param iModelDb The iModel
   * @param parentCategoryId Create the new SubCategory as a child of this [[Category]]
   * @param name The name of the SubCategory
   * @param appearance The appearance settings to use for this SubCategory
   * @returns The newly constructed SubCategory element.
   * @throws [[IModelError]] if unable to create the element.
   */
  public static create(iModelDb: IModelDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): SubCategory {
    if (appearance instanceof SubCategoryAppearance)
      appearance = appearance.toJSON();

    const parentCategory = iModelDb.elements.getElement<Category>(parentCategoryId);
    const subCategoryProps: SubCategoryProps = {
      classFullName: this.classFullName,
      model: parentCategory.model,
      parent: new CategoryOwnsSubCategories(parentCategoryId),
      code: this.createCode(iModelDb, parentCategoryId, name),
      appearance,
    };
    return new SubCategory(subCategoryProps, iModelDb);
  }

  /** Insert a new SubCategory
   * @param iModelDb Insert into this iModel
   * @param parentCategoryId Insert the new SubCategory as a child of this Category
   * @param name The name of the SubCategory
   * @param appearance The appearance settings to use for this SubCategory
   * @returns The Id of the newly inserted SubCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const subCategory = this.create(iModelDb, parentCategoryId, name, appearance);
    return iModelDb.elements.insertElement(subCategory);
  }
}

/** A Category element is the target of the `category` member of [[GeometricElement]].
 * @public
 */
export class Category extends DefinitionElement implements CategoryProps {
  /** @internal */
  public static override get className(): string { return "Category"; }
  public rank: Rank = Rank.User;
  public description?: string;

  /** @internal */
  public constructor(props: CategoryProps, iModel: IModelDb) {
    super(props, iModel);
    this.rank = JsonUtils.asInt(props.rank);
    this.description = JsonUtils.asString(props.description);
  }

  /** @internal */
  public override toJSON(): CategoryProps {
    const val = super.toJSON() as CategoryProps;
    val.rank = this.rank;
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the Id of the default SubCategory for this Category. */
  public myDefaultSubCategoryId(): Id64String { return IModelDb.getDefaultSubCategoryId(this.id); }

  /** Set the appearance of the default SubCategory for this Category */
  public setDefaultAppearance(props: SubCategoryAppearance.Props | SubCategoryAppearance): void {
    if (props instanceof SubCategoryAppearance)
      props = props.toJSON();

    const subCat = this.iModel.elements.getElement<SubCategory>(this.myDefaultSubCategoryId());
    subCat.appearance = new SubCategoryAppearance(props);
    this.iModel.elements.updateElement(subCat);
  }
}

/** Categorizes 2d GeometricElements.
 * @public
 */
export class DrawingCategory extends Category {
  /** @internal */
  public static override get className(): string { return "DrawingCategory"; }

  /** Construct a DrawingCategory
   * @param opts  The properties of the new DrawingCategory
   * @param iModel The IModelDb where the DrawingCategory may be inserted.
   * @internal
   */
  public constructor(opts: ElementProps, iModel: IModelDb) { super(opts, iModel); }

  /** Get the name of the CodeSpec that is used by DrawingCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.drawingCategory; }

  /** Looks up the CategoryId of a DrawingCategory by model and name */
  public static queryCategoryIdByName(iModel: IModelDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = DrawingCategory.createCode(iModel, scopeModelId, categoryName);
    return iModel.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a DrawingCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModel
   * @param scopeModelId The Id of the DefinitionModel that contains the DrawingCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A drawing category Code
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(DrawingCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** Create a new DrawingCategory
   * @param iModelDb The iModel
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name of the DrawingCategory
   * @returns The newly constructed DrawingCategory element.
   * @throws [[IModelError]] if unable to create the element.
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string): DrawingCategory {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate: false,
    };
    return new DrawingCategory(categoryProps, iModelDb);
  }

  /** Insert a new DrawingCategory
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new DrawingCategory into this [[DefinitionModel]]
   * @param name The name of the DrawingCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this DrawingCategory
   * @returns The Id of the newly inserted DrawingCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const category = this.create(iModelDb, definitionModelId, name);
    const elements = iModelDb.elements;
    const categoryId = elements.insertElement(category);
    category.setDefaultAppearance(defaultAppearance);
    return categoryId;
  }
}

/** Categorizes SpatialElements. See [how to create a SpatialCategory]$(docs/learning/backend/CreateElements.md#SpatialCategory).
 * @public
 */
export class SpatialCategory extends Category {
  /** @internal */
  public static override get className(): string { return "SpatialCategory"; }
  /** Construct a SpatialCategory
   * @param opts  The properties of the new SpatialCategory
   * @param iModel The IModelDb where the SpatialCategory may be inserted.
   * @internal
   */
  public constructor(opts: ElementProps, iModel: IModelDb) { super(opts, iModel); }

  /** Get the name of the CodeSpec that is used by SpatialCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.spatialCategory; }

  /** Looks up the CategoryId of a SpatialCategory by model and name */
  public static queryCategoryIdByName(iModel: IModelDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = SpatialCategory.createCode(iModel, scopeModelId, categoryName);
    return iModel.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a SpatialCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModel
   * @param scopeModelId The Id of the DefinitionModel that contains the SpatialCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A spatial category Code
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(SpatialCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** Create a new SpatialCategory
   * @param iModelDb The iModel
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name/CodeValue of the SpatialCategory
   * @returns The newly constructed SpatialCategory element.
   * @throws [[IModelError]] if unable to create the element.
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string): SpatialCategory {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iModelDb, definitionModelId, name),
      isPrivate: false,
    };
    return new SpatialCategory(categoryProps, iModelDb);
  }

  /** Insert a new SpatialCategory
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new SpatialCategory into this DefinitionModel
   * @param name The name of the SpatialCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this SpatialCategory
   * @returns The Id of the newly inserted SpatialCategory element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const category = this.create(iModelDb, definitionModelId, name);
    const categoryId = iModelDb.elements.insertElement(category);
    category.setDefaultAppearance(defaultAppearance);
    return categoryId;
  }
}
