/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module PropertyGrid
 */
import { PropertyRecord } from "@bentley/ui-abstract";
import { PropertyCategory } from "../../PropertyDataProvider";
import { FlatGridItemType, IMutableFlatGridItem, IMutableGridCategoryItem, MutableFlatPropertyGridItem } from "./MutableFlatGridItem";
import { IMutableGridItemFactory } from "./MutableGridItemFactory";

/**
 * Category name to PropertyRecord[] key pair interface used to describe which records belong to which category.
 * @beta
 */
export interface CategoryRecordsDict {
  [categoryName: string]: PropertyRecord[];
}

/**
 * Mutable wrapper object for PropertyCategory which provides methods for working with and managing category and record children hierarchies
 * @beta
 */
export class MutableGridCategory extends MutableFlatPropertyGridItem implements IMutableGridCategoryItem {
  private _children: IMutableFlatGridItem[];
  private _childCategories: IMutableGridCategoryItem[];
  private _selectionKey: string;
  private _category: PropertyCategory;

  constructor(
    category: PropertyCategory,
    recordsDict: CategoryRecordsDict,
    gridItemFactory: IMutableGridItemFactory,
    parentSelectionKey?: string,
    depth: number = 0,
  ) {
    super(depth, parentSelectionKey, parentSelectionKey);
    this._category = { name: category.name, label: category.label, expand: category.expand };

    if (parentSelectionKey !== undefined)
      this._selectionKey = `${parentSelectionKey}_${category.name}`;
    else
      this._selectionKey = category.name;

    this._isExpanded = category.expand;

    // Even though categories are nested and have their own depth, categorized properties depth is counted starting with the parent category.
    const categoryRecords = recordsDict[category.name] ?? [];
    this._children = categoryRecords.map((value) => gridItemFactory.createCategorizedProperty(value, this.selectionKey, this.selectionKey, 0));

    const childCategories = category.childCategories ?? [];
    this._childCategories = childCategories.map((childCategory) => gridItemFactory.createGridCategory(childCategory, recordsDict, this.selectionKey, this.depth + 1));

    this._children.push(...this._childCategories);

    // Assign lastInNumberOfCategories and isLastInRootCategory for entire children hierarchy
    this.lastInNumberOfCategories = 0;
    this.isLastInRootCategory = this.isRootCategory;
  }

  /**
   * Category is considered to be root category if its depth is 0
   */
  public get isRootCategory() {
    return this.depth === 0;
  }

  public get selectionKey() {
    return this._selectionKey;
  }

  public get type(): FlatGridItemType.Category {
    return FlatGridItemType.Category;
  }

  public get name() {
    return this._category.name;
  }

  public get label() {
    return this._category.label;
  }

  public get derivedCategory(): PropertyCategory {
    return { ...this._category, expand: this.isExpanded };
  }

  public getSelf() {
    return this;
  }

  public getChildren(): IMutableFlatGridItem[] {
    return this._children;
  }

  public getChildCategories() {
    return this._childCategories;
  }

  /**
   * Gets a flat list of all categories beneath this category and itself in depth first visiting order.
   */
  public getDescendantCategoriesAndSelf(): IMutableGridCategoryItem[] {
    const descendants: IMutableGridCategoryItem[] = [];
    this._childCategories.forEach((value) => descendants.push(...value.getDescendantCategoriesAndSelf()));

    return [this, ...descendants];
  }

  /**
   * Gets and Sets lastInNumberOfCategories.
   * Setter increments set value by one to account self as category.
   * New value is sent down to this items last child
   * @internal
   */
  public override get lastInNumberOfCategories(): number {
    return super.lastInNumberOfCategories;
  }

  public override set lastInNumberOfCategories(value: number) {
    super.lastInNumberOfCategories = value + 1;
  }
}
