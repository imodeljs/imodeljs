/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PropertyCategory } from "../../PropertyDataProvider";
import {
  FlatGridItemType, IMutableCategorizedPropertyItem, IMutableFlatGridItem, IMutableGridCategoryItem, MutableFlatPropertyGridItem,
} from "./MutableFlatGridItem";
import { CategoryRecordsDict } from "./MutableGridCategory";
import { IMutableGridItemFactory } from "./MutableGridItemFactory";

/** @internal */
export class MutableCustomGridCategory extends MutableFlatPropertyGridItem implements IMutableGridCategoryItem {
  private readonly _children: IMutableCategorizedPropertyItem[];
  private readonly _renderer: PropertyCategory["renderer"];

  public readonly type = FlatGridItemType.Category as const;
  public readonly label: string;
  public readonly name: string;
  public readonly selectionKey: string;

  public constructor(
    category: PropertyCategory,
    recordsDict: CategoryRecordsDict,
    gridItemFactory: IMutableGridItemFactory,
    parentSelectionKey: string | undefined,
    depth: number,
  ) {
    super(depth, parentSelectionKey, parentSelectionKey);

    this.name = category.name;
    this.label = category.label;
    this.isExpanded = category.expand;
    this.selectionKey = parentSelectionKey === undefined ? this.name : `${parentSelectionKey}_${this.name}`;
    this._renderer = category.renderer;

    // Even though categories are nested and have their own depth, categorized properties depth is counted starting with
    // the parent category.
    const categoryRecords = recordsDict[category.name] ?? [];
    this._children = categoryRecords.map(
      (value) => gridItemFactory.createCategorizedProperty(value, this.selectionKey, this.selectionKey, 0),
    );

    this.lastInNumberOfCategories = -1;
  }

  public get derivedCategory(): PropertyCategory {
    return {
      name: this.name,
      label: this.label,
      expand: this.isExpanded,
      renderer: this._renderer,
    };
  }

  public get isRootCategory(): boolean {
    return this.depth === 0;
  }

  public override get lastInNumberOfCategories(): number {
    return this._lastInNumberOfCategories;
  }

  public override set lastInNumberOfCategories(value: number) {
    this._lastInNumberOfCategories = value + 2;
  }

  public getSelf() {
    return this;
  }

  public getChildCategories(): IMutableGridCategoryItem[] {
    return [];
  }

  public getDescendantCategoriesAndSelf(): IMutableGridCategoryItem[] {
    return [this];
  }

  public getChildren(): IMutableFlatGridItem[] {
    return this._children;
  }

  public override getVisibleDescendantsAndSelf(): IMutableFlatGridItem[] {
    return [this];
  }
}
