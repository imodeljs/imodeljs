/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import { Id64String } from "@bentley/bentleyjs-core";

/** Primitive Property Value Types.
 * @public
 */
export namespace Primitives {
  /** Text type */
  export type Text = string;
  /** String type */
  export type String = string;
  /** DateTime will be formatted as date and time */
  export type DateTime = string | Date;
  /** ShortDate will be formatted as date only and will not include time */
  export type ShortDate = string | Date;
  /** Boolean type */
  export type Boolean = boolean | string | {} | [];
  /** Float type */
  export type Float = number | string;
  /** Int type */
  export type Int = number | string;
  /** Hexadecimal type (number expressed in hex string) */
  export type Hexadecimal = Id64String;
  /** Enum type (enumerated list of values) */
  export type Enum = number | string;
  /** Numeric type (can be float or int) */
  export type Numeric = Float | Int;

  /** Point2d type (contains an x and a y coordinate) */
  export type Point2d = string[] | number[] | { x: number, y: number };
  /** Point3d type (contains x,y,and z coordinates) */
  export type Point3d = string[] | number[] | { x: number, y: number, z: number };

  /** Point type (can be a 2d or 3d point) */
  export type Point = Point2d | Point3d;

  /** CompositePart (ties a raw value of a specific type to a display string) */
  export interface CompositePart {
    displayValue: string;
    rawValue: Value;
    typeName: string;
  }
  /** Composite type (built of one or more CompositePart items) */
  export interface Composite {
    separator: string;
    parts: CompositePart[];
  }

  /** Instance key type. */
  export interface InstanceKey {
    className: string;
    id: Id64String;
  }

  export type Value = Text | String | ShortDate | Boolean | Numeric | Enum | Point | Composite | InstanceKey;
}
