/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { SchemaKeyProps } from "./Deserialization/JsonProps";
import { SchemaMatchType } from "./ECObjects";
import { ECObjectsError, ECObjectsStatus } from "./Exception";
import { ECName } from "./ECName";

/**
 * @beta
 */
export class ECVersion {
  private _read: number = 0;
  private _write: number = 0;
  private _minor: number = 0;

  /**
   * The constructor will throw an ECObjectsError if any of the parameters below are above the threshold.
   * @param read Can support up to 999.
   * @param write Can support up to 999.
   * @param minor Can support up to 9999999.
   *
   */
  constructor(read?: number, write?: number, minor?: number) {
    if (undefined !== read) this._read = read;
    if (undefined !== write) this._write = write;
    if (undefined !== minor) this._minor = minor;

    if (this._read > 999 || this._read < 0 || this._write > 999 || this._write < 0 || this._minor > 9999999 || this._minor < 0)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion);
  }

  public get read() { return this._read; }
  public get write() { return this._write; }
  public get minor() { return this._minor; }

  /**
   * Creates a string, in the format 'RR.ww.mm', representing this ECVersion.
   * @note The default is to pad with zeroes.
   * @param padZeroes If true, the returned string will strictly follow `RR.ww.mm` and add leading zeroes if necessary.
   */
  public toString(padZeroes: boolean = true): string {
    if (!padZeroes)
      return `${this.read}.${this.write}.${this.minor}`;

    const padWithZeroes = (num: number) => {
      return (num < 10 ? "0" : "") + num;
    };

    return `${padWithZeroes(this.read)}.${padWithZeroes(this.write)}.${padWithZeroes(this.minor)}`;
  }

  /**
   * Given a valid version string the
   * @param versionString A valid version string of the format, 'RR.ww.mm'.
   */
  public static fromString(versionString: string): ECVersion {
    const [read, write, minor] = versionString.split(".");
    if (!read)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion, `The read version is missing from version string, ${versionString}`);

    if (!write)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion, `The write version is missing from version string, ${versionString}`);

    if (!minor)
      throw new ECObjectsError(ECObjectsStatus.InvalidECVersion, `The minor version is missing from version string, ${versionString}`);

    return new ECVersion(+read, +write, +minor);
  }

  /**
   * Compares two schema versions.
   * @param rhs The schema to compare.
   * @return A negative number if this schema version is less than the given version, a positive number if greater, and 0 if are equivalent.
   */
  public compare(rhv: ECVersion): number {
    if (this.read !== rhv.read)
      return this.read - rhv.read;

    if (this.write !== rhv.write)
      return this.write - rhv.write;

    return this.minor - rhv.minor;
  }
}

/**
 * The SchemaKey contains a Schemas name and version.
 * @beta
 */
export class SchemaKey {
  private _name: ECName;
  protected _version: ECVersion;
  // public checksum: number;
  // TODO: need to add a checksum

  constructor(name: string, version: ECVersion);
  constructor(name: string, readVersion?: number, writeVersion?: number, minorVersion?: number);
  constructor(name: string, readOrVersion?: number | ECVersion, writeVersion?: number, minorVersion?: number) {
    this._name = new ECName(name);
    if (readOrVersion !== undefined && typeof(readOrVersion) !== "number")
      this._version = readOrVersion;
    else
      this._version = new ECVersion(readOrVersion, writeVersion, minorVersion);
  }

  public get version() { return this._version; }
  public get name() { return this._name.name; }
  public get readVersion() { return this.version.read; }
  public get writeVersion() { return this.version.write; }
  public get minorVersion() { return this.version.minor; }

  /**
   * Creates a string, in the format 'RR.ww.mm', representing this SchemaKey.
   * @note The default is to pad the full name with zeroes.
   * @param padZeroes If true, the returned string will strictly follow `Name.RR.ww.mm` and add leading zeroes if necessary.
   */
  public toString(padZeroes: boolean = true) { return `${this.name}.${this.version.toString(padZeroes)}`; }

  public static parseString(fullName: string) {
    const keyPieces = fullName.split(".");
    if (keyPieces.length !== 4)
      throw new ECObjectsError(ECObjectsStatus.InvalidECName);

    const schemaName = keyPieces[0];
    const readVer = Number(keyPieces[1]);
    const writeVer = Number(keyPieces[2]);
    const minorVer = Number(keyPieces[3]);
    return new SchemaKey(schemaName, new ECVersion(readVer, writeVer, minorVer));
  }

  /*
   * Compares two schema names, case-insensitive.
   * @return True if they match; otherwise, false.
   */
  public compareByName(rhs: SchemaKey | string | undefined): boolean {
    if (undefined === rhs) { return false; }
    if (typeof (rhs) === "string")
      return rhs.toLowerCase() === this.name.toLowerCase();
    return rhs.name.toLowerCase() === this.name.toLowerCase();
  }

  /**
   * Compares two schema versions.
   * @param rhs The schema to compare.
   * @return A negative number if this schema version is less than the given version, a positive number if greater, and 0 if are equivalent.
   */
  public compareByVersion(rhs: SchemaKey): number {
    return this.version.compare(rhs.version);
  }

  /**
   *
   * @param rhs The SchemaKey to compare with
   * @param matchType The match type to use for comparison.
   */
  public matches(rhs: SchemaKey, matchType: SchemaMatchType = SchemaMatchType.Identical): boolean {
    switch (matchType) {
      case SchemaMatchType.Identical:
        // TODO: if (this.checksum && rhs.checksum)
        // TODO:   return this.checksum === rhs.checksum;
        return this.compareByName(rhs.name) && this.readVersion === rhs.readVersion &&
          this.writeVersion === rhs.writeVersion && this.minorVersion === rhs.minorVersion;
      case SchemaMatchType.Exact:
        return this.compareByName(rhs.name) && this.readVersion === rhs.readVersion &&
          this.writeVersion === rhs.writeVersion && this.minorVersion === rhs.minorVersion;
      case SchemaMatchType.LatestReadCompatible:
        if (!this.compareByName(rhs.name))
          return false;

        if (rhs.readVersion !== this.readVersion)
          return false;

        if (this.writeVersion === rhs.writeVersion)
          return this.minorVersion >= rhs.minorVersion;

        return this.writeVersion > rhs.writeVersion;
      case SchemaMatchType.LatestWriteCompatible:
        return this.compareByName(rhs.name) && this.readVersion === rhs.readVersion &&
          this.writeVersion === rhs.writeVersion && this.minorVersion >= rhs.minorVersion;
      case SchemaMatchType.Latest:
        return this.compareByName(rhs.name);
      default:
        return false;
    }
  }

  /**
   * Deserializes a SchemaKeyProps JSON object into a SchemaKey object.
   * @param props SchemaKeyProps
   * @returns A SchemaKey object.
   */
  public static fromJSON(props: SchemaKeyProps): SchemaKey {
    return new SchemaKey(props.name, props.read, props.write, props.minor);
  }

  /**
   * Save this SchemaKey's properties to an object for serializing to JSON.
   */
  public toJSON(): SchemaKeyProps {
    return {
      name: this.name,
      read: this.readVersion,
      write: this.writeVersion,
      minor: this.minorVersion,
    };
  }
}

/**
 * The SchemaItemKey contains a SchemaItem's name and SchemaKey.
 * @beta
 */
export class SchemaItemKey {
  private _name: ECName;
  protected _schemaKey: SchemaKey;

  constructor(name: string, schema: SchemaKey) {
    this._name = new ECName(name);
    this._schemaKey = schema;
  }

  public get schemaKey() { return this._schemaKey; }
  public get name() { return this._name.name; }

  public get schemaName() { return this.schemaKey.name; }

  /** Returns the name in the format, {schemaName}.{name}. */
  public get fullName() { return `${this.schemaName}.${this.name}`; }

  /**
   * Checks whether this SchemaItemKey matches the one provided.
   * @param rhs The SchemaItemKey to compare to this.
   */
  // TODO: Need to add a match type
  public matches(rhs: SchemaItemKey): boolean {
    if (rhs.name !== this.name)
      return false;

    if (!rhs.schemaKey.matches(this.schemaKey, SchemaMatchType.Latest))
      return false;

    return true;
  }

  public matchesFullName(name: string): boolean {
    const schemaVersion = this.schemaKey.version.toString().replace(/\./g, "\\.");
    const fullNameRegex = new RegExp(`^${this.schemaName}(\\.${schemaVersion})?[.:]${this.name}$`, "i");
    return fullNameRegex.test(name);
  }
}
