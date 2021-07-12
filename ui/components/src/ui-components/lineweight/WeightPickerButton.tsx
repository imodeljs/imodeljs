/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LineWeight
 */

import "./WeightPickerButton.scss";
import classnames from "classnames";
import * as React from "react";
import { ColorDef } from "@bentley/imodeljs-common";
import { RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { CommonProps, ElementResizeObserver, Popup } from "@bentley/ui-core";
import { LineWeightSwatch } from "./Swatch";

// cSpell:ignore weightpicker lineweight

/** Properties for the [[WeightPickerButton]] React component
 * @beta
 */
export interface WeightPickerProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {
  /** active weight */
  activeWeight: number;
  /** available weights */
  weights: number[];
  /** color specification */
  colorDef?: ColorDef;
  /** function to run when user selects weight swatch */
  onLineWeightPick?: ((weight: number) => void) | undefined;
  /** Disabled or not */
  disabled?: boolean;
  /** Readonly or not */
  readonly?: boolean;
  /** hide the weight label */
  hideLabel?: boolean;
  /** Title to show at top of DropDown */
  dropDownTitle?: string;
}

/** @internal */
interface WeightPickerState {
  showPopup: boolean;
  targetElement: HTMLDivElement | null;
}

/** WeightPickerButton component
 * @beta
 */
export class WeightPickerButton extends React.PureComponent<WeightPickerProps, WeightPickerState> {
  private _target = React.createRef<HTMLDivElement>();
  private _weightsContainer: HTMLDivElement | null = null;
  private _focusTarget = React.createRef<HTMLButtonElement>();  // weight button that should receive focus after popup is open

  /** @internal */
  constructor(props: WeightPickerProps) {
    super(props);

    this.state = { showPopup: false, targetElement: null };
  }

  public setFocus(): void {
    // istanbul ignore next
    this._focusTarget.current && this._focusTarget.current.focus();
  }

  public static defaultProps = {
    weights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };

  private _togglePopup = () => {
    if (this.props.readonly)
      return;
    this.setState((prevState) => ({ showPopup: !prevState.showPopup }));
  };

  private _onPopupOpened = () => {
  };

  private _closePopup = () => {
    this.setState((_prevState) => ({ showPopup: false }));
  };

  private _handleWeightPicked = (weight: number) => {
    this._closePopup();
    this.props.onLineWeightPick && this.props.onLineWeightPick(weight);
  };

  public override componentDidMount() {
    // eslint-disable-next-line no-console
    // console.log(`WeightPickerButton.componentDidMount focusRef=${this._focusTarget && this._focusTarget.current ? "set" : "unset"}`);
    this.setState({ targetElement: this._target.current });
  }

  private buildIdForWeight(weight: number): string {
    return `ui-core-lineweight-${weight}`;
  }

  private moveFocusInPopup(moveUp: boolean, event: React.KeyboardEvent<any>) {
    const activeElement = document.activeElement;
    // istanbul ignore else
    if (this._weightsContainer && activeElement && activeElement.tagName === "BUTTON") {
      const values = activeElement.id.split("-");
      // istanbul ignore else
      if (values.length === 4 && values[2] === "lineweight") {
        const weight = parseInt(values[3], 10);
        const foundIndex = this.props.weights.findIndex((val) => val === weight);
        // istanbul ignore next
        if (foundIndex < 0)
          return;

        const nextWeight = moveUp ? (foundIndex <= 0 ? this.props.weights[this.props.weights.length - 1] : this.props.weights[foundIndex - 1]) :
          (foundIndex < this.props.weights.length - 1 ? this.props.weights[foundIndex + 1] : this.props.weights[0]);

        const focusLocation = this._weightsContainer.querySelector(`#${this.buildIdForWeight(nextWeight)}`) as HTMLButtonElement;
        // istanbul ignore else
        if (focusLocation) {
          focusLocation.focus();
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  }

  private _handleKeyDown = (event: React.KeyboardEvent<any>) => {
    if (event.key === SpecialKey.Enter) {
      event.preventDefault();
      event.stopPropagation();
      const weightButton = document.activeElement as HTMLElement;
      // istanbul ignore else
      if (weightButton.tagName === "BUTTON") {
        try {
          const values = weightButton.id.split("-");
          // istanbul ignore else
          if (values.length) {
            const weight = parseInt(values[values.length - 1], 10);
            // istanbul ignore else
            if (!isNaN(weight)) {
              // istanbul ignore else
              if (this.props.onLineWeightPick)
                this.props.onLineWeightPick(weight);
            }
          }
        } catch { }
      }
      this._closePopup();
    } else {
      switch (event.key) {
        case SpecialKey.ArrowDown:
          this.moveFocusInPopup(false, event);
          break;
        case SpecialKey.ArrowUp:
          this.moveFocusInPopup(true, event);
          break;
      }
    }
  };

  private _setWeightContainer = (el: any) => {
    this._weightsContainer = el;
  };

  private renderPopup(title: string | undefined) {
    return (
      <div className="components-weightpicker-popup-container">
        {title && <h4>{title}</h4>}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <ul data-testid="components-weightpicker-popup-lines" className="components-weightpicker-popup-lines" onKeyDown={this._handleKeyDown} ref={this._setWeightContainer}>
          {this.props.weights.map((weight, index) => {
            const classNames = classnames(
              "components-weightpicker-swatch",
              weight === this.props.activeWeight && "active",
            );
            return (<LineWeightSwatch
              className={classNames}
              key={index}
              colorDef={this.props.colorDef}
              id={this.buildIdForWeight(weight)}
              hideLabel={this.props.hideLabel}
              onClick={this._handleWeightPicked.bind(this, weight)}
              weight={weight} />);
          })
          }
        </ul>
      </div>
    );
  }

  /** @internal */
  public override render() {
    const buttonClassNames = classnames(
      "components-weightpicker-button",
      this.props.className,
    );

    return (
      <>
        <div ref={this._target} style={this.props.style} >
          <LineWeightSwatch
            data-testid="components-weightpicker-button"
            className={buttonClassNames}
            weight={this.props.activeWeight}
            colorDef={this.props.colorDef}
            readonly={this.props.readonly}
            disabled={this.props.disabled}
            hideLabel={this.props.hideLabel}
            aria-haspopup="listbox"
            aria-expanded={this.state.showPopup}
            onClick={this._togglePopup} />
        </div>
        <ElementResizeObserver watchedElement={this.state.targetElement} render=
          {({ width }) => (
            <Popup
              className="components-weightpicker-popup"
              style={{ width: `${width}px` }}
              isOpen={this.state.showPopup}
              position={RelativePosition.Bottom}
              offset={0}
              showShadow={false}
              onClose={this._closePopup}
              onOpen={this._onPopupOpened}
              focusTarget={`#${this.buildIdForWeight(this.props.activeWeight)}`}
              moveFocus={true}
              target={this.state.targetElement}
              closeOnNestedPopupOutsideClick
            >
              {this.renderPopup(this.props.dropDownTitle)}
            </Popup>
          )}
        />
      </>
    );
  }
}
