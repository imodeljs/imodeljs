/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MarkupTools
 */

import { assert } from "@bentley/bentleyjs-core";
import { Element as MarkupElement } from "@svgdotjs/svg.js";
import { MarkupApp } from "./Markup";

/* @internal */
abstract class UndoAction {
  public cmdId: number = 0;
  public abstract reverse(): void;
  public abstract reinstate(): void;
  constructor(public cmdName: string) { }
}

/** created when a new element is added to the markup
 * @internal
 */
class AddAction extends UndoAction {
  private _parent: MarkupElement;
  private _index: number;
  constructor(cmdName: string, private _elem: MarkupElement) {
    super(cmdName);
    this._parent = _elem.parent() as MarkupElement;
    assert(this._parent !== undefined);
    this._index = _elem.position();
  }
  public reinstate() { this._parent.add(this._elem, this._index); }
  public reverse() { MarkupApp.markup!.selected.drop(this._elem); this._elem.remove(); }
}

/** created when an existing element is deleted from the markup
 * @internal
 */
class DeleteAction extends UndoAction {
  private _parent: MarkupElement;
  private _index: number;
  constructor(cmdName: string, private _elem: MarkupElement) {
    super(cmdName);
    this._parent = _elem.parent() as MarkupElement;
    assert(this._parent !== undefined);
    this._index = _elem.position();
  }
  public reverse() { this._parent.add(this._elem, this._index); }
  public reinstate() { MarkupApp.markup!.selected.drop(this._elem); this._elem.remove(); }
}

/** created when an existing element's position is moved in the display order. This can also include re-parenting
 * @internal
 */
class RepositionAction extends UndoAction {
  private _newParent: MarkupElement;
  private _newIndex: number;

  constructor(cmdName: string, private _elem: MarkupElement, private _oldIndex: number, private _oldParent: MarkupElement) {
    super(cmdName);
    this._newParent = _elem.parent() as MarkupElement;
    assert(this._newParent !== undefined);
    this._newIndex = _elem.position();
  }
  public reinstate() { this._newParent.add(this._elem, this._newIndex); }
  public reverse() { this._oldParent.add(this._elem, this._oldIndex); if (this._elem.inSelection) MarkupApp.markup!.selected.drop(this._elem); }
}

/** created when an existing element's properties are modified.
 * @internal
 */
class ModifyAction extends UndoAction {
  constructor(cmdName: string, private _newElem: MarkupElement, private _oldElement: MarkupElement) {
    super(cmdName);
    assert(_newElem !== undefined && _oldElement !== undefined);
    MarkupApp.markup!.selected.replace(_oldElement, _newElem);
  }
  public reinstate() { this._oldElement.replace(this._newElem); MarkupApp.markup!.selected.replace(this._oldElement, this._newElem); }
  public reverse() { this._newElem.replace(this._oldElement); MarkupApp.markup!.selected.replace(this._newElem, this._oldElement); }
}

/** Stores the sequence of operations performed on a Markup. Facilitates undo/redo of the operations.
 * @public
 */
export class UndoManager {
  private _currentCmd = 0;
  private _grouped = 0;
  private _stack: UndoAction[] = [];
  private _currentPos = 0;
  private _cmdName = "";

  private addAction(action: UndoAction) {
    this._stack.length = this._currentPos;
    action.cmdId = this._currentCmd;
    this._stack.push(action);
    this._currentPos = this.size;
  }

  /** @internal */
  public get size() { return this._stack.length; }
  private startCommand() { if (0 === this._grouped) ++this._currentCmd; }
  private startGroup() { this.startCommand(); ++this._grouped; }
  private endGroup() { --this._grouped; }

  /** Perform a series of changes to markup elements that should all be reversed as a single operation.
   * @param fn the function that performs the changes to the elements. It must call the onXXX methods of this class to store
   * the operations in the undo buffer.
   * @note all of the onXXX methods of this class should *only* be called from within the callback function of this method.
   */
  public performOperation(cmdName: string, fn: VoidFunction) { this._cmdName = cmdName; this.startGroup(); fn(); this.endGroup(); }

  /** call this from within a [[performOperation]] function *after* an element has been added to a markup */
  public onAdded(elem: MarkupElement) { this.addAction(new AddAction(this._cmdName, elem)); }
  /** call this from within a [[performOperation]] function *before* an element is about to be deleted from a markup */
  public onDelete(elem: MarkupElement) { this.addAction(new DeleteAction(this._cmdName, elem)); }
  /** call this from within a [[performOperation]] function *after* an element has been moved in display order in a markup */
  public onRepositioned(elem: MarkupElement, oldIndex: number, oldParent: MarkupElement) { this.addAction(new RepositionAction(this._cmdName, elem, oldIndex, oldParent)); }
  /** call this from within a [[performOperation]] function *after* an element has been modified in a markup */
  public onModified(newElem: MarkupElement, oldElem: MarkupElement) { this.addAction(new ModifyAction(this._cmdName, newElem, oldElem)); }

  /** determine whether there are any un-reversed operations */
  public get undoPossible() { return this._currentPos > 0; }
  /** determine whether there are any reversed operations */
  public get redoPossible() { return this._currentPos < this.size; }
  /** the name of the operation that can be undone (or undefined) */
  public get undoString() { return this.undoPossible ? this._stack[this._currentPos - 1].cmdName : undefined; }
  /** the name of the operation that can be redone (or undefined) */
  public get redoString() { return this.redoPossible ? this._stack[this._currentPos].cmdName : undefined; }

  /** reverse the most recent operation, if any */
  public doUndo() {
    if (this._currentPos === 0)
      return; // no operations have been performed

    const cmdId = this._stack[this._currentPos - 1].cmdId;
    while (this._currentPos > 0 && cmdId === this._stack[this._currentPos - 1].cmdId)
      this._stack[--this._currentPos].reverse();
  }
  /** reinstate the most recently reversed operation, if any */
  public doRedo() {
    if (this._currentPos === this.size)
      return; // no operations have been reversed.

    const cmdId = this._stack[this._currentPos].cmdId;
    while (this._currentPos < this.size && cmdId === this._stack[this._currentPos].cmdId)
      this._stack[this._currentPos++].reinstate();
  }
}
