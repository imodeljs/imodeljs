/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Loading
 */

import "./Spinner.scss";
import * as React from "react";

// cspell:ignore xlarge

/** Size for [[Spinner]] component
 * @public
 */
export enum SpinnerSize {
  /** width/height of 16px */
  Small,
  /** width/height of 32px */
  Medium,
  /** width/height of 64px */
  Large,
  /** width/height of 96px */
  XLarge,
}

/** Properties for [[Spinner]] component
 * @public
 */
export interface SpinnerProps {
  /** Size of spinner */
  size?: SpinnerSize;
  /** CSS class for size of spinner */
  sizeClass?: string;
}

/**
 * An indeterminate spinner component.
 * @public
 */
export class Spinner extends React.PureComponent<SpinnerProps> {

  public override render() {
    let sizeClass: string;

    if (this.props.sizeClass)
      sizeClass = this.props.sizeClass;
    else {
      switch (this.props.size) {
        case SpinnerSize.Small:
          sizeClass = "core-spinner-small";
          break;
        case SpinnerSize.Large:
          sizeClass = "core-spinner-large";
          break;
        case SpinnerSize.XLarge:
          sizeClass = "core-spinner-xlarge";
          break;
        case SpinnerSize.Medium:
        default:
          sizeClass = "core-spinner-medium";
          break;
      }
    }

    return (
      <div className={sizeClass} />
    );
  }
}
