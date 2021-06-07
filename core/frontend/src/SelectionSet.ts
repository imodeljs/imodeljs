/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module SelectionSet
 */
import { BeEvent, Id64, Id64Arg, Id64String } from "@bentley/bentleyjs-core";
import { IModelApp } from "./IModelApp";
import { IModelConnection } from "./IModelConnection";

/** Identifies the type of changes made to the [[SelectionSet]] to produce a [[SelectionSetEvent]].
 * @public
 */
export enum SelectionSetEventType {
  /** Elements have been added to the set. */
  Add,
  /** Elements have been removed from the set. */
  Remove,
  /** Some elements have been added to the set and others have been removed. */
  Replace,
  /** All elements are about to be removed from the set. */
  Clear,
}

/** Passed to [[SelectionSet.onChanged]] event listeners when elements are added to the selection set.
 * @public
 */
export interface SelectAddEvent {
  type: SelectionSetEventType.Add;
  /** The Ids of the elements added to the set. */
  added: Id64Arg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/** Passed to [[SelectionSet.onChanged]] event listeners when elements are removed from the selection set.
 * @public
 */
export interface SelectRemoveEvent {
  /** The type of operation that produced this event. */
  type: SelectionSetEventType.Remove | SelectionSetEventType.Clear;
  /** The element Ids removed from the set. */
  removed: Id64Arg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/** Passed to [[SelectionSet.onChanged]] event listeners when elements are simultaneously added to and removed from the selection set.
 * @public
 */
export interface SelectReplaceEvent {
  type: SelectionSetEventType.Replace;
  /** The element Ids added to the set. */
  added: Id64Arg;
  /** The element Ids removed from the set. */
  removed: Id64Arg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/** Payload sent to [[SelectionSet.onChanged]] event listeners to describe how the contents of the set have changed.
 * The `type` property of the event serves as a type assertion. For example, the following code will output the added and/or removed Ids:
 *  ```ts
 *  processSelectionSetEvent(ev: SelectionSetEvent): void {
 *    if (SelectionSetEventType.Add === ev.type || SelectionSetEventType.Replace === ev.type)
 *      console.log("Added " + ev.added.size + " elements");
 *
 *    if (SelectionSetEventType.Add !== ev.type)
 *      console.log("Removed " + ev.removed.size + " elements");
 *  }
 *  ```
 * @public
 */
export type SelectionSetEvent = SelectAddEvent | SelectRemoveEvent | SelectReplaceEvent;

/** Tracks a set of hilited entities. When the set changes, notifies ViewManager so that symbology overrides can be updated in active Viewports.
 * @internal
 */
class HilitedIds extends Id64.Uint32Set {
  protected _iModel: IModelConnection;
  protected _changing = false;

  public constructor(iModel: IModelConnection) {
    super();
    this._iModel = iModel;
  }

  public add(low: number, high: number) {
    super.add(low, high);
    this.onChanged();
  }

  public delete(low: number, high: number) {
    super.delete(low, high);
    this.onChanged();
  }

  public clear() {
    super.clear();
    this.onChanged();
  }

  public addIds(ids: Id64Arg) {
    this.change(() => super.addIds(ids));
  }

  public deleteIds(ids: Id64Arg) {
    this.change(() => super.deleteIds(ids));
  }

  protected onChanged() {
    if (!this._changing)
      IModelApp.viewManager.onSelectionSetChanged(this._iModel);
  }

  protected change(func: () => void) {
    const changing = this._changing;
    this._changing = false;
    func();
    this._changing = changing;
    this.onChanged();
  }
}

/** Keeps the set of hilited elements in sync with the selection set.
 * @internal
 */
class HilitedElementIds extends HilitedIds {
  private _removeListener?: () => void;

  public constructor(iModel: IModelConnection, syncWithSelectionSet = true) {
    super(iModel);
    this.wantSyncWithSelectionSet = syncWithSelectionSet;
  }

  public get wantSyncWithSelectionSet(): boolean { return undefined !== this._removeListener; }
  public set wantSyncWithSelectionSet(want: boolean) {
    if (want === this.wantSyncWithSelectionSet)
      return;

    if (want) {
      const set = this._iModel.selectionSet;
      this._removeListener = set.onChanged.addListener((ev) => this.change(() => this.processSelectionSetEvent(ev)));
      this.processSelectionSetEvent({
        set,
        type: SelectionSetEventType.Add,
        added: set.elements,
      });
    } else {
      this._removeListener!();
      this._removeListener = undefined;
    }
  }

  private processSelectionSetEvent(ev: SelectionSetEvent): void {
    if (SelectionSetEventType.Add !== ev.type)
      this.deleteIds(ev.removed);

    if (ev.type === SelectionSetEventType.Add || ev.type === SelectionSetEventType.Replace)
      this.addIds(ev.added);
  }
}

/** A set of *hilited* elements for an [[IModelConnection]], by element id.
 * Hilited elements are displayed with a customizable hilite effect within a [[Viewport]].
 * The set exposes 3 types of elements in 3 separate collections: geometric elements, subcategories, and geometric models.
 * @note Typically, elements are hilited by virtue of their presence in the IModelConnection's [[SelectionSet]]. The HiliteSet allows additional
 * elements to be displayed with the hilite effect without adding them to the [[SelectionSet]]. If you add elements to the HiliteSet directly, you
 * are also responsible for removing them as appropriate.
 * @note Support for subcategories and geometric models in the HiliteSet is currently `beta`.
 * @see [[IModelConnection.hilited]] for the HiliteSet associated with an iModel.
 * @see [Hilite.Settings]($common) for customization of the hilite effect.
 * @public
 */
export class HiliteSet {
  private readonly _elements: HilitedElementIds;

  /** The set of hilited subcategories.
   * @beta
   */
  public readonly subcategories: Id64.Uint32Set;
  /** The set of hilited [[GeometricModelState]]s.
   * @beta
   */
  public readonly models: Id64.Uint32Set;
  /** The set of hilited elements. */
  public get elements(): Id64.Uint32Set { return this._elements; }

  /** Construct a HiliteSet
   * @param iModel The iModel containing the entities to be hilited.
   * @param syncWithSelectionSet If true, the contents of the `elements` set will be synchronized with those in the `iModel`'s [[SelectionSet]].
   * @internal
   */
  public constructor(public iModel: IModelConnection, syncWithSelectionSet = true) {
    this._elements = new HilitedElementIds(iModel, syncWithSelectionSet);
    this.subcategories = new HilitedIds(iModel);
    this.models = new HilitedIds(iModel);
  }

  /** Control whether the hilited elements will be synchronized with the contents of the [[SelectionSet]].
   * By default they are synchronized. Applications that override this take responsibility for managing the set of hilited entities.
   * When turning synchronization off, the contents of the HiliteSet will remain unchanged.
   * When turning synchronization on, the current contents of the HiliteSet will be preserved, and the contents of the selection set will be added to them.
   */
  public get wantSyncWithSelectionSet(): boolean { return this._elements.wantSyncWithSelectionSet; }
  public set wantSyncWithSelectionSet(want: boolean) { this._elements.wantSyncWithSelectionSet = want; }

  /** Remove all elements from the hilited set. */
  public clear() {
    this.elements.clear();
    this.subcategories.clear();
    this.models.clear();
  }

  /** Returns true if nothing is hilited. */
  public get isEmpty(): boolean { return this.elements.isEmpty && this.subcategories.isEmpty && this.models.isEmpty; }

  /** Toggle the hilited state of one or more elements.
   * @param arg the ID(s) of the elements whose state is to be toggled.
   * @param onOff True to add the elements to the hilited set, false to remove them.
   */
  public setHilite(arg: Id64Arg, onOff: boolean): void {
    for (const id of Id64.iterable(arg)) {
      if (onOff)
        this.elements.addId(id);
      else
        this.elements.deleteId(id);
    }

    IModelApp.viewManager.onSelectionSetChanged(this.iModel);
  }
}

/** A set of *currently selected* elements for an IModelConnection.
 * Selected elements are displayed with a customizable hilite effect within a [[Viewport]].
 * @see [Hilite.Settings]($common) for customization of the hilite effect.
 * @public
 */
export class SelectionSet {
  private _elements = new Set<string>();

  /** The IDs of the selected elements.
   * @note Do not modify this set directly. Instead, use methods like [[SelectionSet.add]].
   */
  public get elements(): Set<string> { return this._elements; }

  /** Called whenever elements are added or removed from this SelectionSet */
  public readonly onChanged = new BeEvent<(ev: SelectionSetEvent) => void>();

  public constructor(public iModel: IModelConnection) { }

  private sendChangedEvent(ev: SelectionSetEvent) {
    IModelApp.viewManager.onSelectionSetChanged(this.iModel);
    this.onChanged.raiseEvent(ev);
  }

  /** Get the number of entries in this selection set. */
  public get size() { return this.elements.size; }

  /** Check whether there are any selected elements. */
  public get isActive() { return this.size !== 0; }

  /** Return true if elemId is in this SelectionSet.
   * @see [[isSelected]]
   */
  public has(elemId?: string) { return !!elemId && this.elements.has(elemId); }

  /** Query whether an Id is in the selection set.
   * @see [[has]]
   */
  public isSelected(elemId?: Id64String): boolean { return !!elemId && this.elements.has(elemId); }

  /** Clear current selection set.
   * @note raises the [[onChanged]] event with [[SelectionSetEventType.Clear]].
   */
  public emptyAll(): void {
    if (!this.isActive)
      return;

    const removed = this._elements;
    this._elements = new Set<string>();
    this.sendChangedEvent({ set: this, type: SelectionSetEventType.Clear, removed });
  }

  /**
   * Add one or more Ids to the current selection set.
   * @param elem The set of Ids to add.
   * @returns true if any elements were added.
   */
  public add(elem: Id64Arg): boolean {
    return this._add(elem);
  }

  private _add(elem: Id64Arg, sendEvent = true): boolean {
    const oldSize = this.elements.size;
    for (const id of Id64.iterable(elem))
      this.elements.add(id);

    const changed = oldSize !== this.elements.size;
    if (sendEvent && changed)
      this.sendChangedEvent({ type: SelectionSetEventType.Add, set: this, added: elem });

    return changed;
  }

  /**
   * Remove one or more Ids from the current selection set.
   * @param elem The set of Ids to remove.
   * @returns true if any elements were removed.
   */
  public remove(elem: Id64Arg): boolean {
    return this._remove(elem);
  }

  private _remove(elem: Id64Arg, sendEvent = true): boolean {
    const oldSize = this.elements.size;
    for (const id of Id64.iterable(elem))
      this.elements.delete(id);

    const changed = oldSize !== this.elements.size;
    if (sendEvent && changed)
      this.sendChangedEvent({ type: SelectionSetEventType.Remove, set: this, removed: elem });

    return changed;
  }

  /**
   * Add one set of Ids, and remove another set of Ids. Any Ids that are in both sets are removed.
   * @returns True if any Ids were either added or removed.
   */
  public addAndRemove(adds: Id64Arg, removes: Id64Arg): boolean {
    const added = this._add(adds, false);
    const removed = this._remove(removes, false);

    if (added && removed)
      this.sendChangedEvent({ type: SelectionSetEventType.Replace, set: this, added: adds, removed: removes });
    else if (added)
      this.sendChangedEvent({ type: SelectionSetEventType.Add, set: this, added: adds });
    else if (removed)
      this.sendChangedEvent({ type: SelectionSetEventType.Remove, set: this, removed: removes });

    return (added || removed);
  }

  /** Invert the state of a set of Ids in the SelectionSet */
  public invert(elem: Id64Arg): boolean {
    const elementsToAdd = new Set<string>();
    const elementsToRemove = new Set<string>();
    for (const id of Id64.iterable(elem)) {
      if (this.elements.has(id))
        elementsToRemove.add(id);
      else
        elementsToAdd.add(id);
    }

    return this.addAndRemove(elementsToAdd, elementsToRemove);
  }

  /** Change selection set to be the supplied set of Ids. */
  public replace(elem: Id64Arg): void {
    if (areEqual(this.elements, elem))
      return;

    const removed = this._elements;
    this._elements = new Set<string>();
    this._add(elem, false);

    if (0 < removed.size) {
      for (const id of Id64.iterable(elem)) {
        if (removed.has(id))
          removed.delete(id);
      }
    }

    this.sendChangedEvent({ type: SelectionSetEventType.Replace, set: this, added: elem, removed });
  }
}

function areEqual(lhs: Set<string>, rhs: Id64Arg): boolean {
  // Size is unreliable if input can contain duplicates...
  if (Array.isArray(rhs))
    rhs = Id64.toIdSet(rhs);

  if (lhs.size !== Id64.sizeOf(rhs))
    return false;

  for (const id of Id64.iterable(rhs))
    if (!lhs.has(id))
      return false;

  return true;
}
