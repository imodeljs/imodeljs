/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Ids
 */

import { assert } from "./Assert";
import { Id64, Id64Array, Id64Set, Id64String } from "./Id";
import { OrderedId64Iterable } from "./OrderedId64Iterable";
import { SortedArray } from "./SortedArray";

/** @public */
export type CompressedId64Set = string;

/** A compact string representation of an [[Id64Set]]. Such a representation is useful when serializing potentially very large
 * sets of Ids.
 * @see [[CompressedId64Set.iterable]] to efficiently iterate the Ids represented by a compact string.
 * @see [[CompressedId64Set.compressSet]] and [[CompressedId64Set.compressArray]] to produce a compact string from a collection of Ids.
 * @see [[CompressedId64Set.decompressSet]] and [[CompressedId64Set.decompressArray]] to produce a collection of Ids from a compact string.
 * @see [[OrderedId64Iterable]] for a generic representation of an ordered set of Ids (compressed or otherwise).
 * @see [[MutableCompressedId64Set]] for a mutable version.
 * @public
 */
export namespace CompressedId64Set { // eslint-disable-line @typescript-eslint/no-redeclare
  function isHexDigit(ch: number): boolean {
    // ascii values:
    // '0' = 48
    // '9' = 57
    // 'a' = 65
    // 'f' = 70

    return (ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 70);
  }

  function compactRange(increment: Uint64, length: number): string {
    assert(length > 0);
    const inc = `+${increment.toString()}`;
    if (length <= 1)
      return inc;

    const len = length.toString(16).toUpperCase();
    return `${inc}*${len}`;
  }

  /** Given a set of [[Id64String]]s, produce a compact string representation. Useful when serializing potentially large sets of Ids.
   * @note Invalid Ids are ignored.
   * @see [[CompressedId64Set.sortAndCompress]] to compress any unordered collection of Ids.
   * @see [[CompressedId64Set.compressArray]] to perform the same operation on an [[Id64Array]].
   * @see [[CompressedId64Set.decompressSet]] to perform the inverse operation.
   */
  export function compressSet(ids: Id64Set): CompressedId64Set {
    return sortAndCompress(ids);
  }

  /** Create a sorted array from `ids`, then return a compact string representation of those Ids.
   * @see [[compressIds]] if `ids` is known to already be sorted.
   */
  export function sortAndCompress(ids: Iterable<Id64String>): CompressedId64Set {
    // `string` is an Iterable<string>. In that case assume caller passed a single Id64String.
    const arr = typeof ids === "string" ? [ids] : Array.from(ids);
    OrderedId64Iterable.sortArray(arr);
    return compressArray(arr);
  }

  /** Give a **numerically-ordered** array of [[Id64String]]s, produce a compact string representation. Useful when serializing potentially large sets of Ids.
   * Duplicate Ids are included only once in the string representation.
   * @throws Error if two consecutive Ids `x` and `y` exist such that the numerical value of `x` is greater than that of `y` - i.e., the array is not properly sorted.
   * @note The array must be sorted according to the 64-bit numerical value of each Id.
   * @note Invalid Ids are ignored.
   * @see [[CompressedId64Set.decompressArray]] to perform the inverse operation.
   * @see [[OrderedId64Iterable.sortArray]] to ensure the Ids are properly sorted.
   * @see [[CompressedId64Set.sortAndCompress]] to compress any unordered collection of Ids.
   */
  export function compressArray(ids: Id64Array): CompressedId64Set {
    return compressIds(ids);
  }

  /** Give a **numerically-ordered** collection of [[Id64String]]s, produce a compact string representation. Useful when serializing potentially large sets of Ids.
   * Duplicate Ids are included only once in the string representation.
   * @throws Error if two consecutive Ids `x` and `y` exist such that the numerical value of `x` is greater than that of `y` - i.e., the collection is not properly sorted.
   * @note The collection must be sorted according to the 64-bit numerical value of each Id.
   * @note Invalid Ids are ignored.
   * @see [[CompressedId64Set.iterable]] to perform the inverse operation.
   * @see [[OrderedId64Iterable.sortArray]] or [[OrderedId64Iterable.compare]] to ensure the Ids are properly sorted.
   * @see [[CompressedId64Set.sortAndCompress]] to compress any unordered collection of Ids.
   */
  export function compressIds(ids: OrderedId64Iterable): CompressedId64Set {
    if ("string" === typeof ids)
      return ids;

    let str = "";

    const prevId = new Uint64();
    const rangeIncrement = new Uint64();
    let rangeLen = 0;

    const curId = new Uint64();
    const curIncrement = new Uint64();
    for (const id of ids) {
      if (!Id64.isValidId64(id))
        continue; // ignore garbage and invalid Ids ("0")

      curId.setFromId(id);
      curIncrement.setFromDifference(curId, prevId);

      const cmp = prevId.compare(curId);
      if (0 === cmp)
        continue; // ignore duplicates
      else if (cmp > 0)
        throw new Error("CompressedId64Set.compressArray requires a sorted array as input");

      prevId.copyFrom(curId);

      if (0 === rangeLen) {
        rangeIncrement.copyFrom(curIncrement);
        rangeLen = 1;
      } else if (curIncrement.equals(rangeIncrement)) {
        ++rangeLen;
      } else {
        str += compactRange(rangeIncrement, rangeLen);
        rangeIncrement.copyFrom(curIncrement);
        rangeLen = 1;
      }
    }

    if (0 < rangeLen)
      str += compactRange(rangeIncrement, rangeLen);

    return str;
  }

  /** This exists strictly for the purposes of compressed sets of 64-bit Ids, to avoid the overhead of BigInt for handling 64-bit integers. */
  class Uint64 implements Id64.Uint32Pair {
    private static readonly _base = 0x100000000;

    private static assertUint32(num: number): void {
      assert(num >= 0);
      assert(num < Uint64._base);
      assert(Math.floor(num) === num);
    }

    private assertConstraints(): void {
      Uint64.assertUint32(this.lower);
      Uint64.assertUint32(this.upper);
    }

    constructor(public lower = 0, public upper = 0) {
      this.assertConstraints();
    }

    public compare(rhs: Uint64): number {
      const diff = this.upper - rhs.upper;
      return 0 === diff ? this.lower - rhs.lower : diff;
    }

    public equals(rhs: Uint64): boolean { return 0 === this.compare(rhs); }
    public isLessThan(rhs: Uint64): boolean { return this.compare(rhs) < 0; }
    public isGreaterThan(rhs: Uint64): boolean { return this.compare(rhs) > 0; }

    public get isZero(): boolean { return 0 === this.lower && 0 === this.upper; }

    public setFromDifference(lhs: Uint64, rhs: Uint64): void {
      assert(!rhs.isGreaterThan(lhs));

      this.lower = lhs.lower - rhs.lower;
      this.upper = lhs.upper - rhs.upper;
      if (this.lower < 0) {
        this.lower += Uint64._base;
        this.upper -= 1;
      }
    }

    public add(rhs: Uint64): void {
      let lower = rhs.lower;
      let upper = rhs.upper;
      if (lower + this.lower >= Uint64._base) {
        lower -= Uint64._base;
        upper += 1;
      }

      this.lower += lower;
      this.upper += upper;
      this.assertConstraints();
    }

    public setFromId(id: Id64String): void {
      Id64.getUint32Pair(id, this);
    }

    public copyFrom(other: Uint64): void {
      this.lower = other.lower;
      this.upper = other.upper;
    }

    public toString(): string {
      if (0 === this.upper)
        return this.lower.toString(16).toUpperCase();

      const upper = this.upper.toString(16);
      const lower = this.lower.toString(16).padStart(8, "0");
      assert(lower.length === 8);
      return `${upper}${lower}`.toUpperCase();
    }

    public toId64String(): string {
      return Id64.fromUint32Pair(this.lower, this.upper);
    }
  }

  /** Supplies an iterator over the [[Id64String]]s in a [[CompressedId64Set]].
   * The Ids are iterated in ascending order based on their unsigned 64-bit integer values.
   */
  export function* iterator(ids: CompressedId64Set): Iterator<Id64String> {
    if (0 === ids.length)
      return; // empty set.

    if ("+" !== ids[0])
      throw new Error("Invalid CompressedId64Set");

    let curIndex = 1; // skip the leading '+'
    const curId = new Uint64();

    function parseUint32(): number {
      let value = 0;
      let nChars = 0;
      while (curIndex < ids.length && nChars < 8) {
        ++nChars;
        const ch = ids.charCodeAt(curIndex);
        if (!isHexDigit(ch))
          break; // not a hex digit in [0..9] or [A..F]

        value <<= 4;
        value |= (ch >= 65 ? ch - 65 + 10 : ch - 48); // ch - 'A' + 10 or ch - '0'
        value = value >>> 0; // restore unsignedness because silly javascript.
        ++curIndex;
      }

      return value;
    }

    function parseUint64(uint64: Uint64): void {
      let lower = 0;
      let upper = 0;

      // Read up to the first 8 digits.
      const startIndex = curIndex;
      const first = parseUint32();

      const nFirstDigits = curIndex - startIndex;
      assert(nFirstDigits <= 8);

      if (8 === nFirstDigits && curIndex + 1 < ids.length && isHexDigit(ids.charCodeAt(curIndex + 1))) {
        // We've got up to 8 more digits remaining
        const secondIndex = curIndex;
        const second = parseUint32();

        // Transfer excess digits from upper to lower.
        const nSecondDigits = curIndex - secondIndex;
        assert(nSecondDigits > 0 && nSecondDigits <= 8);

        const nDigitsToTransfer = 8 - nSecondDigits;
        upper = first >>> (4 * nDigitsToTransfer);
        const transfer = first - ((upper << (4 * nDigitsToTransfer)) >>> 0);
        lower = (second | ((transfer << (4 * nSecondDigits)) >>> 0)) >>> 0;
      } else {
        lower = first;
      }

      uint64.lower = lower;
      uint64.upper = upper;
    }

    const increment = new Uint64();
    while (curIndex < ids.length) {
      let multiplier = 1;
      parseUint64(increment);
      if (increment.isZero)
        throw new Error("Invalid CompressedId64Set");

      if (curIndex < ids.length) {
        switch (ids[curIndex++]) {
          case "*":
            multiplier = parseUint32();
            if (0 === multiplier)
              throw new Error("Invalid CompressedId64Set");

            if (curIndex !== ids.length && ids[curIndex++] !== "+")
              return;

            break;
          case "+":
            break;
          default:
            throw new Error("Invalid CompressedId64Set");
        }
      }

      for (let i = 0; i < multiplier; i++) {
        curId.add(increment);
        yield curId.toId64String();
      }
    }
  }

  /** Supplies an iterable over the [[Id64String]]s in a [[CompressedId64Set]].
   * The Ids are iterated in ascending order based on their unsigned 64-bit integer values.
   */
  export function iterable(ids: CompressedId64Set): OrderedId64Iterable {
    return {
      [Symbol.iterator]: () => iterator(ids),
    };
  }

  /** Decompress the compact string representation of an [[Id64Set]] into an [[Id64Set]].
   * @param compressedIds The compact string representation.
   * @param out If supplied, the Ids will be inserted into this set rather than allocating and returning a new set.
   * @returns The set containing the decompressed Ids.
   * @throws Error if `compressedIds` is not a well-formed [[CompressedId64Set]].
   * @see [[CompressedId64Set.compressSet]] to perform the inverse operation.
   * @see [[CompressedId64Set.decompressArray]] to decompress as an [[Id64Array]] instead.
   * @see [[CompressedId64Set.iterable]] to efficiently iterate the Ids.
   */
  export function decompressSet(compressedIds: CompressedId64Set, out?: Id64Set): Id64Set {
    const set = out ?? new Set<string>();
    for (const id of iterable(compressedIds))
      set.add(id);

    return set;
  }

  /** Decompress the compact string representation of an [[Id64Set]] into an [[Id64Array]].
   * @param compressedIds The compact string representation.
   * @param out If supplied, the Ids will be appended to this array rather than allocating and returning a new array.
   * @returns The array containing the decompressed Ids.
   * @throws Error if `compressedIds` is not a well-formed [[CompressedId64Set]].
   * @note The Ids are decompressed and appended to the array in ascending order based on their 64-bit numerical values.
   * @see [[CompressedId64Set.compressArray]] to perform the inverse operation.
   * @see [[CompressedId64Set.decompressSet]] to decompress as an [[Id64Set]] instead.
   * @see [[CompressedId64Set.iterable]] to efficiently iterate the Ids.
   */
  export function decompressArray(compressedIds: CompressedId64Set, out?: Id64Array): Id64Array {
    const arr = out ?? [];
    for (const id of iterable(compressedIds))
      arr.push(id);

    return arr;
  }
}

/** A [[SortedArray]] of unique [[Id64String]]s sorted in ascending order by the 64-bit unsigned integer values of the Ids.
 * @see [[CompressedId64Set]] for an immutable compact string representation.
 * @public
 */
export class OrderedId64Array extends SortedArray<Id64String> {
  /** Construct a new, empty array. */
  public constructor() {
    super((lhs, rhs) => OrderedId64Iterable.compare(lhs, rhs));
  }

  /** An iterable that iterates over the Ids in sorted order. */
  public get ids(): OrderedId64Iterable { return this._array; }
}

/** A mutable set of valid [[Id64String]]s sorted in ascending order by the 64-bit unsigned integer value of the Ids.
 * Internally the set of Ids is maintained as a [[CompressedId64Set]] string representation.
 * Insertions and removals are buffered until the string representation needs to be recomputed. The string representation is recomputed by every public method except [[add]] and [[delete]] -
 * therefore, if multiple removals and/or insertions are required, it is most efficient to perform them all before invoking other methods.
 * @public
 */
export class MutableCompressedId64Set implements OrderedId64Iterable {
  private _ids: CompressedId64Set;
  private readonly _inserted = new OrderedId64Array();
  private readonly _deleted = new OrderedId64Array();

  /** Construct a new set, optionally initialized to contain the Ids represented by `ids`. */
  public constructor(ids?: CompressedId64Set) {
    this._ids = ids ?? "";
  }

  /** Obtain the compact string representation of the contents of this set. If any insertions or removals are pending, they will be applied and the string recomputed. */
  public get ids(): CompressedId64Set {
    this.updateIds();
    return this._ids;
  }

  /** Add the specified Id to the set.
   * @throws Error if `id` is not a valid [[Id64String]].
   */
  public add(id: Id64String): void {
    if (!Id64.isValidId64(id))
      throw new Error("MutableCompressedId64Set.add: invalid Id");

    this._deleted.remove(id);
    this._inserted.insert(id);
  }

  /** Remove the specified Id from the set.
   * @throws Error if `id` is not a valid [[Id64String]].
   */
  public delete(id: Id64String): void {
    if (!Id64.isValidId64(id))
      throw new Error("MutableCompressedId64Set.delete: invalid Id");

    this._inserted.remove(id);
    this._deleted.insert(id);
  }

  /** Remove all Ids from the set. */
  public clear(): void {
    this._ids = "";
    this._inserted.clear();
    this._deleted.clear();
  }

  /** Remove all Ids from the set, then add the specified Ids. */
  public reset(ids?: CompressedId64Set): void {
    this.clear();
    this._ids = ids ?? "";
  }

  /** Obtain an iterator over the Ids in this set. The Ids are returned in ascending order based on their unsigned 64-bit integer values. */
  public [Symbol.iterator]() {
    return CompressedId64Set.iterator(this.ids);
  }

  /** Compute a compact string representation of the union of this and another set of Ids - i.e., those Ids present in either this and/or the other set. */
  public computeUnion(ids: OrderedId64Iterable | CompressedId64Set | MutableCompressedId64Set): CompressedId64Set {
    if (this.isEmpty)
      return CompressedId64Set.compressIds(ids);
    else if (OrderedId64Iterable.isEmptySet(ids) || this.equals(ids))
      return this.ids;

    return CompressedId64Set.compressIds(OrderedId64Iterable.union(this, ids));
  }

  /** Compute a compact string representation of the intersection of this and another set of Ids - i.e., those Ids present in both this and the other set. */
  public computeIntersection(ids: OrderedId64Iterable | CompressedId64Set | MutableCompressedId64Set): CompressedId64Set {
    if (this.equals(ids))
      return this.ids;
    else if (this.isEmpty || OrderedId64Iterable.isEmptySet(ids))
      return "";

    return CompressedId64Set.compressIds(OrderedId64Iterable.intersection(this, ids));
  }

  /** Compute a compact string representation of the difference between this and another set - i.e., those Ids present in this but not in the other set. */
  public computeDifference(ids: OrderedId64Iterable | CompressedId64Set | MutableCompressedId64Set): CompressedId64Set {
    if (this.isEmpty || this.equals(ids))
      return "";

    return CompressedId64Set.compressIds(OrderedId64Iterable.difference(this, ids));
  }

  /** Return true if this set contains no Ids. */
  public get isEmpty(): boolean {
    return OrderedId64Iterable.isEmptySet(this.ids);
  }

  /** Return true if the set of Ids represented by `other` is identical to those in this set.
   * @note This considers only the **distinct** Ids in `other` - duplicates are ignored.
   */
  public equals(other: CompressedId64Set | MutableCompressedId64Set | OrderedId64Iterable): boolean {
    if (other instanceof MutableCompressedId64Set) {
      if (other === this)
        return true;

      if (typeof other !== "string")
        other = other.ids;
    }

    if (typeof other === "string")
      return other === this.ids;

    this.updateIds();
    return OrderedId64Iterable.areEqualSets(this, other);
  }

  private get _isDirty(): boolean {
    return !this._inserted.isEmpty || !this._deleted.isEmpty;
  }

  private updateIds(): void {
    if (!this._isDirty)
      return;

    const difference = OrderedId64Iterable.difference(CompressedId64Set.iterable(this._ids), this._deleted.ids);
    const union = { [Symbol.iterator]: () => OrderedId64Iterable.unionIterator(difference, this._inserted.ids) };
    this._ids = CompressedId64Set.compressIds(union);

    this._inserted.clear();
    this._deleted.clear();
  }
}
