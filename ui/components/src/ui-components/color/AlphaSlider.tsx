/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Color
 */

import "./AlphaSlider.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import { SpecialKey } from "@bentley/ui-abstract";

/** Properties for the [[AlphaSlider]] React component
 * @beta
 */
export interface AlphaSliderProps extends React.HTMLAttributes<HTMLDivElement>, CommonProps {
  /** true if slider is oriented horizontal, else vertical orientation is assumed */
  isHorizontal?: boolean;
  /** function to run when user selects color swatch */
  onAlphaChange?: ((alpha: number) => void) | undefined;
  /** Alpha value between 0 (transparent) and 1 (opaque) */
  alpha: number;
}

/** AlphaSlider component used to set the alpha value.
 * @beta
 */
export class AlphaSlider extends React.PureComponent<AlphaSliderProps> {
  private _container: HTMLDivElement | null = null;
  private _transparencyLabel = UiComponents.translate("color.transparency");

  /** @internal */
  constructor(props: AlphaSliderProps) {
    super(props);
  }

  private _calculateChange = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, isHorizontal: boolean, alpha: number, container: HTMLDivElement): number | undefined => {
    e.preventDefault();
    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();

    let x = 0;
    if ("pageX" in e) {
      x = e.pageX;
    } else {
      // istanbul ignore if
      if (undefined === e.touches)
        return undefined;
      x = e.touches[0].pageX;
    }
    // istanbul ignore if
    if (undefined === x)
      return undefined;

    let y = 0;
    if ("pageY" in e) {
      y = e.pageY;
    } else {
      // istanbul ignore if
      if (undefined === e.touches)
        return;
      y = e.touches[0].pageY;
    }
    // istanbul ignore if
    if (undefined === y)
      return undefined;

    const left = x - (container.getBoundingClientRect().left + window.pageXOffset);
    const top = y - (container.getBoundingClientRect().top + window.pageYOffset);

    let t = 0;

    if (!isHorizontal) {
      // istanbul ignore next
      if (top < 0) {
        t = 1;
      } else if (top > containerHeight) {
        t = 0;
      } else {
        t = 1 - (top / containerHeight);
      }
    } else {  // horizontal
      // istanbul ignore next
      if (left < 0) {
        t = 0;
      } else if (left > containerWidth) {
        t = 1;
      } else {
        t = left / containerWidth;
      }
    }

    // istanbul ignore if
    if (t < 0) t = 0;
    // istanbul ignore if
    if (t > 1) t = 1;
    // istanbul ignore next
    return (alpha !== t) ? t : undefined;
  };

  /** @internal */
  public override componentWillUnmount() {
    this._unbindEventListeners();
  }

  private _onChange = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    // istanbul ignore else
    if (this._container && this.props.onAlphaChange) {
      const change = this._calculateChange(e, this.props.isHorizontal ? this.props.isHorizontal : false, this.props.alpha, this._container);
      undefined !== change && typeof this.props.onAlphaChange === "function" && this.props.onAlphaChange(change);
    }
  };

  private _onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    this._onChange(e);
    // istanbul ignore else
    if (this._container)
      this._container.focus();
    window.addEventListener("mousemove", this._onChange as any);
    window.addEventListener("mouseup", this._onMouseUp);
  };

  private _onKeyDown = (evt: React.KeyboardEvent<HTMLDivElement>) => {
    let newTransparency: number | undefined;
    if (evt.key === SpecialKey.ArrowLeft || evt.key === SpecialKey.ArrowDown) {
      newTransparency = this.props.alpha - (evt.ctrlKey ? .1 : .05);
    } else if (evt.key === SpecialKey.ArrowRight || evt.key === SpecialKey.ArrowUp) {
      newTransparency = this.props.alpha + (evt.ctrlKey ? .1 : .05);
    } else if (evt.key === SpecialKey.PageDown) {
      newTransparency = this.props.alpha - (evt.ctrlKey ? .5 : .25);
    } else if (evt.key === SpecialKey.PageUp) {
      newTransparency = this.props.alpha + (evt.ctrlKey ? .5 : .25);
    } else if (evt.key === SpecialKey.Home) {
      newTransparency = 0;
    } else {
      // istanbul ignore else
      if (evt.key === SpecialKey.End) {
        newTransparency = 1;
      }
    }

    // istanbul ignore else
    if (undefined !== newTransparency) {
      // istanbul ignore if
      if (newTransparency > 1) newTransparency = 1;
      // istanbul ignore if
      if (newTransparency < 0) newTransparency = 0;
      // istanbul ignore else
      if (this.props.onAlphaChange)
        this.props.onAlphaChange(newTransparency);
    }
  };

  private _onMouseUp = () => {
    this._unbindEventListeners();
  };

  private _unbindEventListeners() {
    window.removeEventListener("mousemove", this._onChange as any);
    window.removeEventListener("mouseup", this._onMouseUp);
  }

  /** @internal */
  public override render(): React.ReactNode {
    const containerClasses = classnames(
      this.props.isHorizontal ? "components-alpha-container-horizontal" : "components-alpha-container-vertical",
      this.props.className,
    );

    const pointerStyle: React.CSSProperties = this.props.isHorizontal ?
      { left: `${(this.props.alpha * 100)}%` } :
      { left: `0px`, top: `${-(this.props.alpha * 100) + 100}%` };

    return (
      <div className={containerClasses} style={this.props.style} data-testid="alpha-container">
        <div
          data-testid="alpha-slider"
          role="slider" aria-label={this._transparencyLabel}
          aria-valuemin={0} aria-valuemax={1} aria-valuenow={this.props.alpha}
          className="components-alpha-slider"
          ref={(container) => this._container = container}
          onMouseDown={this._onMouseDown}
          onTouchMove={this._onChange}
          onTouchStart={this._onChange}
          tabIndex={0}
          onKeyDown={this._onKeyDown}
        >
          <div style={pointerStyle} className="components-alpha-pointer" data-testid="alpha-pointer" />
        </div>
      </div>
    );
  }

}
