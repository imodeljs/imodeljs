/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */
import { Id64, Id64Arg, Id64String, ObservableSet } from "@bentley/bentleyjs-core";
import { CategorySelectorProps } from "@bentley/imodeljs-common";
import { ElementState } from "./EntityState";
import { IModelConnection } from "./IModelConnection";

/** A set of Categories to be displayed in a [[ViewState]].
 * Elements belonging to categories not specified in the category selector will not be drawn in the view.
 * By default, geometry belonging to any [[SubCategory]] of a visible Category is also visible in the view,
 * unless the [[SubCategoryAppearance]] or [[SubCategoryOverride]] specifies that it should be invisible.
 * @note To change the set of categories visible in a [[ViewState]] currently associated with a [[Viewport]],
 * use [[ViewState.changeCategoryDisplay]] to ensure the view updates appropriately on screen.
 * @see [[Category]]
 * @public
 */
export class CategorySelectorState extends ElementState {
  /** @internal */
  public static override get className() { return "CategorySelector"; }

  private readonly _categories = new ObservableSet<string>();

  constructor(props: CategorySelectorProps, iModel: IModelConnection) {
    super(props, iModel);
    if (props.categories)
      props.categories.forEach((cat) => this.categories.add(cat));
  }

  public get categories(): Set<string> {
    return this._categories;
  }

  public set categories(categories: Set<string>) {
    this._categories.clear();
    for (const category of categories)
      this._categories.add(category);
  }

  /** @internal */
  public get observableCategories(): ObservableSet<string> {
    return this._categories;
  }

  public override toJSON(): CategorySelectorProps {
    const val = super.toJSON() as CategorySelectorProps;
    val.categories = [];
    this.categories.forEach((cat) => val.categories.push(cat));
    return val;
  }

  /** Returns true if this category selector is logically equivalent to the specified category selector.
   * Two category selectors are logically equivalent if they have the same name and Id and contain the same set of category Ids.
   */
  public equalState(other: CategorySelectorState): boolean {
    if (this.categories.size !== other.categories.size || this.name !== other.name || this.id !== other.id)
      return false;

    for (const cat of this.categories)
      if (!other.categories.has(cat))
        return false;

    return true;
  }

  /** The name of this CategorySelector */
  public get name(): string { return this.code.value; }

  /** Determine whether this CategorySelector includes the specified categoryId string */
  public has(id: Id64String): boolean { return this.categories.has(id.toString()); }

  /** Determine whether this CategorySelector includes the specified category */
  public isCategoryViewed(categoryId: Id64String): boolean { return this.has(categoryId); }

  /** Add one or more categories to this CategorySelector */
  public addCategories(arg: Id64Arg): void {
    for (const id of Id64.iterable(arg))
      this.categories.add(id);
  }

  /** Remove one or more categories from this CategorySelector */
  public dropCategories(arg: Id64Arg) {
    for (const id of Id64.iterable(arg))
      this.categories.delete(id);
  }

  /** Add or remove categories from this CategorySelector.
   * @param arg The categories to add or remove
   * @param add If true, categories will be added; otherwise they will be removed.
   */
  public changeCategoryDisplay(arg: Id64Arg, add: boolean): void { if (add) this.addCategories(arg); else this.dropCategories(arg); }
}
