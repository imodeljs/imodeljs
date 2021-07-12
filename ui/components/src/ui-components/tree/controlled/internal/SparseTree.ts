/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { immerable } from "immer";
import { assert, compareNumbers, lowerBound } from "@bentley/bentleyjs-core";

/** @internal */
export interface Node {
  readonly id: string;
}

/**
 * Structure for sparse tree storage.
 * It uses SparseArray to store children ids for parent. This allows
 * having tree structure with some nodes missing in the tree branch.
 * @internal
 */
export class SparseTree<T extends Node> {
  public [immerable] = true;

  private _rootNodes = new SparseArray<string>();
  private _parentToChildren: Record<string, SparseArray<string>> = {};
  private _idToNode: Record<string, T> = {};

  public getNode(nodeId: string): T | undefined {
    return this._idToNode[nodeId];
  }

  public getChildOffset(parentId: string | undefined, childId: string): number | undefined {
    const children = this.getChildren(parentId);
    if (!children)
      return undefined;

    return children.getIndex(childId);
  }

  public getChildren(parentId: string | undefined, createIfNotExist: boolean = false): SparseArray<string> | undefined {
    if (parentId === undefined) {
      return this._rootNodes;
    }

    if (this._parentToChildren[parentId] === undefined && createIfNotExist) {
      this._parentToChildren[parentId] = new SparseArray<string>();
    }

    return this._parentToChildren[parentId];
  }

  public setChildren(parentId: string | undefined, children: T[], offset: number) {
    const existingChildren = this.getChildren(parentId, true)!;
    children.forEach((child, index) => {
      const existingChildId = existingChildren.get(offset + index);
      if (existingChildId !== undefined) {
        this.deleteSubtree(existingChildId);
      }

      existingChildren.set(offset + index, child.id);
      this._idToNode[child.id] = child;
    });
  }

  public insertChild(parentId: string | undefined, child: T, offset: number) {
    const existingChildren = this.getChildren(parentId, true)!;
    existingChildren.insert(offset, child.id);
    this._idToNode[child.id] = child;
  }

  public setNodeId(parentId: string | undefined, index: number, newId: string): boolean {
    const previousNodeId = this.getChildren(parentId)?.get(index);
    if (previousNodeId === undefined) {
      return false;
    }

    if (previousNodeId === newId) {
      return true;
    }

    if (this.getNode(newId) !== undefined) {
      return false;
    }

    this._idToNode[newId] = this._idToNode[previousNodeId];
    delete this._idToNode[previousNodeId];

    this._parentToChildren[newId] = this._parentToChildren[previousNodeId];
    delete this._parentToChildren[previousNodeId];

    if (parentId === undefined) {
      this._rootNodes.set(index, newId);
    } else {
      this._parentToChildren[parentId].set(index, newId);
    }

    return true;
  }

  public moveNode(
    sourceParentId: string | undefined,
    sourceNodeId: string,
    targetParentId: string | undefined,
    targetIndex: number,
  ): void {
    const sourceNodeSiblings = this.getChildren(sourceParentId);
    assert(sourceNodeSiblings !== undefined);

    const sourceIndex = this.getChildOffset(sourceParentId, sourceNodeId);
    assert(sourceIndex !== undefined);

    sourceNodeSiblings.remove(sourceIndex);
    if (targetParentId === sourceParentId && targetIndex > sourceIndex) {
      targetIndex -= 1;
    }

    const targetNodeSiblings = this.getChildren(targetParentId, true);
    assert(targetNodeSiblings !== undefined);
    targetNodeSiblings.insert(targetIndex, sourceNodeId);
  }

  public setNumChildren(parentId: string | undefined, numChildren: number) {
    const children = this.getChildren(parentId, true)!;
    for (const [childId] of children.iterateValues()) {
      this.deleteSubtree(childId);
    }

    children.setLength(numChildren);
  }

  public removeChild(parentId: string | undefined, child: string | number): void {
    const children = this.getChildren(parentId);
    if (children === undefined)
      return;

    if (typeof child === "string") {
      const childIndex = children.getIndex(child);
      if (childIndex !== undefined) {
        children.remove(childIndex);
      }

      this.deleteSubtree(child);
    } else {
      const childId = children.get(child);
      children.remove(child);
      if (childId !== undefined) {
        this.deleteSubtree(childId);
      }
    }
  }

  public deleteSubtree(parentId: string | undefined, deleteParent: boolean = true) {
    const children = this.getChildren(parentId);
    if (children !== undefined) {
      for (const [childId] of children.iterateValues()) {
        this.deleteSubtree(childId);
      }
    }

    if (parentId === undefined) {
      this._rootNodes.setLength(0);
      return;
    }
    if (deleteParent) {
      delete this._idToNode[parentId];
    }
    delete this._parentToChildren[parentId];
  }
}

/**
 * Structure for sparse array value storage.
 * The main advantage of this class over the standard javascript array is that
 * this class does not need to check each index when iterating values that are
 * stored in the array.
 * @public
 */
export class SparseArray<T> implements Iterable<T | undefined> {
  public [immerable] = true;

  private _length = 0;
  private _array: Array<[T, number]> = [];

  /** Returns length of array including intermediate 'undefined' values */
  public getLength(): number {
    return this._length;
  }

  /** Sets length of array. */
  public setLength(length: number) {
    const { index } = this.lowerBound(length);
    this._array.length = index;
    this._length = length;
  }

  /** Returns index of supplied value.
   *
   * @returns index of value or undefined if value is not found.
   */
  public getIndex(lookupValue: T): number | undefined {
    for (const [value, index] of this._array) {
      if (value === lookupValue)
        return index;
    }
    return undefined;
  }

  /** Returns value at specific position.
   *
   * @returns stored value or undefined.
   */
  public get(index: number): T | undefined {
    const { index: i, equal } = this.lowerBound(index);
    return equal ? this._array[i][0] : undefined;
  }

  /** Sets value at specific position. Overrides any existing value. */
  public set(index: number, value: T) {
    const { index: i, equal } = this.lowerBound(index);
    this._array.splice(i, equal ? 1 : 0, [value, index]);
    this._length = Math.max(this._length, index + 1);
  }

  /** Inserts value at specific position. Increases array length by one. */
  public insert(index: number, value: T) {
    const { index: i } = this.lowerBound(index);
    this._array.splice(i, 0, [value, index]);

    for (let j = i + 1; j < this._array.length; j++) {
      this._array[j][1]++;
    }

    this._length = Math.max(this._length + 1, index + 1);
  }

  /** Removes value at specified index and reduces array length by one. */
  public remove(index: number): void {
    if (index >= this._length) {
      return;
    }

    const { index: i, equal } = this.lowerBound(index);
    this._array.splice(i, equal ? 1 : 0);

    for (let j = i; j < this._array.length; j++) {
      this._array[j][1]--;
    }

    this._length = Math.max(0, this._length - 1);
  }

  /**
   * Iterates values that are stored in the array
   * @returns `[value, index]` tuples.
   */
  public iterateValues(): IterableIterator<[T, number]> {
    return this._array[Symbol.iterator]();
  }

  /** Iterates the array with all intermediate `undefined` values */
  public [Symbol.iterator](): IterableIterator<T | undefined> {
    const array = this._array;
    const length = this._length;
    return (function* () {
      let currentIndex = 0;
      for (const [value, index] of array) {
        for (; currentIndex < index; ++currentIndex) {
          yield undefined;
        }

        yield value;
        ++currentIndex;
      }

      for (; currentIndex < length; ++currentIndex) {
        yield undefined;
      }
    })();
  }

  private lowerBound(index: number): {
    index: number; equal: boolean;
  } {
    return lowerBound(index, this._array, SparseArray.compare);
  }

  private static compare<T>(index: number, value: [T, number]): number {
    return compareNumbers(index, value[1]);
  }
}
