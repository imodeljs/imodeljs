/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module PropertyGrid
 */
import { PropertyRecord } from "@bentley/ui-abstract";
import { FlatGridItemType, IMutableCategorizedPropertyItem, IMutableFlatGridItem, MutableCategorizedProperty } from "./MutableFlatGridItem";
import { IMutableGridItemFactory } from "./MutableGridItemFactory";

/**
 * Mutable wrapper object for PropertyRecord with struct valueFormat which provides methods for working with and managing record children hierarchies.
 * @beta
 */
export class MutableCategorizedStructProperty extends MutableCategorizedProperty implements IMutableCategorizedPropertyItem {
  private _renderLabel: boolean;
  private _children: IMutableCategorizedPropertyItem[];

  public constructor(
    record: PropertyRecord,
    parentSelectionKey: string,
    parentCategorySelectionKey: string,
    depth: number,
    gridItemFactory: IMutableGridItemFactory,
    overrideName?: string,
    overrideDisplayLabel?: string,
  ) {
    super(FlatGridItemType.Struct, record, parentSelectionKey, parentCategorySelectionKey, depth, overrideName, overrideDisplayLabel);
    this._renderLabel = !record.property.hideCompositePropertyLabel;
    const childrenDepth = depth + (this._renderLabel ? 1 : 0);
    this._children = record.getChildrenRecords().map((value) => {
      return gridItemFactory.createCategorizedProperty(value, this.selectionKey, this.parentCategorySelectionKey, childrenDepth);
    });
  }

  public get type(): FlatGridItemType.Struct {
    return FlatGridItemType.Struct;
  }

  public getChildren(): IMutableCategorizedPropertyItem[] {
    return this._children;
  }

  public override getDescendantsAndSelf() {
    return this._renderLabel ? super.getDescendantsAndSelf() : this.getDescendants();
  }

  public override getVisibleDescendants(): IMutableFlatGridItem[] {
    const descendants: IMutableFlatGridItem[] = [];
    if (this.isExpanded || !this._renderLabel) {
      // always render children if not rendering the label, otherwise there's no way to expand
      // this item to make children visible
      this.getChildren().forEach((child) => descendants.push(...child.getVisibleDescendantsAndSelf()));
    }
    return descendants;
  }

  public override getVisibleDescendantsAndSelf() {
    return this._renderLabel ? super.getVisibleDescendantsAndSelf() : this.getVisibleDescendants();
  }
}
