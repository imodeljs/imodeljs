/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Cube
 */

import "./Cube.scss";
import classnames from "classnames";
import * as React from "react";
import { Matrix3d } from "@bentley/geometry-core";
import { CommonProps } from "../utils/Props";

/** Cube Face enumeration
 * @public
 */
export enum Face {
  None = "",
  Left = "left",
  Right = "right",
  Back = "back",
  Front = "front",
  Bottom = "bottom",
  Top = "top",
}

/** Properties for the [[Cube]] React component
 * @public
 */
export interface CubeProps extends React.AllHTMLAttributes<HTMLDivElement>, CommonProps {
  faces?: { [key: string]: React.ReactNode };
  rotMatrix: Matrix3d;
}

/** Cube React component used by the 3d Cube Navigation Aid
 * @public
 */
export class Cube extends React.PureComponent<CubeProps> {
  public override render(): React.ReactNode {
    const { faces, rotMatrix, className, ...props } = this.props;
    return (
      <div className={classnames("core-cube-css3d", className)} data-testid="core-cube" {...props}>
        {[Face.Front, Face.Back, Face.Right, Face.Left, Face.Top, Face.Bottom]
          .map((face: Face) => {
            const content = faces && faces[face];
            return (
              <CubeFace
                key={face}
                rotMatrix={rotMatrix}
                face={face}>
                {content}
              </CubeFace>
            );
          })}
      </div>
    );
  }
}

/** @internal */
export interface CubeFaceProps extends React.AllHTMLAttributes<HTMLDivElement> {
  rotMatrix: Matrix3d;
  face: Face;
}

/** @internal */
export class CubeFace extends React.Component<CubeFaceProps> {
  private _faceWidth: number = 0;
  public override render(): React.ReactNode {
    const { rotMatrix, face, style, children, ...props } = this.props;
    if (face === Face.None)
      return null;
    const classes = classnames("face", this.getCSSClassNameFromFace(face));
    // orient face (flip because of y axis reversal, rotate as necessary)
    let reorient: Matrix3d = Matrix3d.createRowValues(1, 0, 0, 0, -1, 0, 0, 0, 1);
    // Position face correctly (applies to rotation, as well as translation)
    let reposition: Matrix3d = Matrix3d.createIdentity();
    switch (this.props.face) {
      case Face.Bottom:
        reposition = Matrix3d.createRowValues(-1, 0, 0, 0, 1, 0, 0, 0, -1);
        reorient = Matrix3d.createRowValues(-1, 0, 0, 0, 1, 0, 0, 0, 1);
        break;
      case Face.Right:
        reposition = Matrix3d.createRowValues(0, 0, 1, 0, 1, 0, -1, 0, 0);
        reorient = Matrix3d.createRowValues(0, 1, 0, 1, 0, 0, 0, 0, 1);
        break;
      case Face.Left:
        reposition = Matrix3d.createRowValues(0, 0, -1, 0, 1, 0, 1, 0, 0);
        reorient = Matrix3d.createRowValues(0, -1, 0, -1, 0, 0, 0, 0, 1);
        break;
      case Face.Back:
        reposition = Matrix3d.createRowValues(1, 0, 0, 0, 0, 1, 0, -1, 0);
        reorient = Matrix3d.createRowValues(-1, 0, 0, 0, 1, 0, 0, 0, 1);
        break;
      case Face.Front:
        reposition = Matrix3d.createRowValues(1, 0, 0, 0, 0, -1, 0, 1, 0);
        reorient = Matrix3d.createRowValues(1, 0, 0, 0, -1, 0, 0, 0, 1);
        break;
    }
    const repositioned = rotMatrix.multiplyMatrixMatrix(reposition);
    const vect = repositioned.multiplyXYZ(0, 0, this._faceWidth);
    const m = repositioned.multiplyMatrixMatrix(reorient);
    const list = [
      m.at(0, 0), -m.at(1, 0), m.at(2, 0), 0,
      m.at(0, 1), -m.at(1, 1), m.at(2, 1), 0,
      m.at(0, 2), -m.at(1, 2), m.at(2, 2), 0,
      vect.at(0), -vect.at(1), vect.at(2) - this._faceWidth /* move back faceWidth so face is on screen level */, 1,
    ];
    const transform = `matrix3d(${list.join(", ")})`;
    const s: React.CSSProperties = {
      transform,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      WebkitTransform: transform,
      ...style,
    };

    return (
      <div style={s}
        data-testid={`core-cube-face-${face}`}
        className={classes}
        ref={(e) => { this._faceWidth = (e && e.clientWidth / 2) || 0; }}
        {...props}>
        {children}
      </div>
    );
  }

  private getCSSClassNameFromFace(face: Face): string {
    let className = "";

    // istanbul ignore else
    if (face !== Face.None)
      className = `cube-${face}`;

    return className;
  }
}
