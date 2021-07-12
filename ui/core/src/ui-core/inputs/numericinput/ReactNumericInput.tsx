/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

/*---------------------------------------------------------------------------------------------
* This code has been adapted from
* [react-numeric-input](https://github.com/vlad-ignatov/react-numeric-input).
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { CommonProps } from "../../utils/Props";
import { Omit } from "../../utils/typeUtils";
import { SpecialKey } from "@bentley/ui-abstract";

// cSpell:ignore nostyle

const IS_BROWSER = typeof document !== "undefined";
const RE_NUMBER = /^[+-]?((\.\d+)|(\d+(\.\d+)?))$/;
const RE_INCOMPLETE_NUMBER = /^([+-]0?|[0-9]*\.0*|[+-][0-9]+\.0*|[+-]?\d+\.)?$/;

/**
 * Just a simple helper to provide support for older IEs. This is not exactly a
 * polyfill for classList.add but it does what we need with minimal effort.
 * Works with single className only!
 */
// istanbul ignore next
function addClass(element: HTMLElement, className: string) {
  if (element.classList) {
    return element.classList.add(className);
  }
  if (!element.className.search(new RegExp(`\\b${className}\\b`))) {
    element.className = ` ${className}`;
  }
}

/**
 * Just a simple helper to provide support for older IEs. This is not exactly a
 * polyfill for classList.remove but it does what we need with minimal effort.
 * Works with single className only!
 */
// istanbul ignore next
function removeClass(element: HTMLElement, className: string) {
  if (element.className) {
    if (element.classList) {
      return element.classList.remove(className);
    }

    element.className = element.className.replace(
      new RegExp(`\\b${className}\\b`, "g"),
      "",
    );
  }
}

/**
 * Lookup the object.prop and returns it. If it happens to be a function,
 * executes it with args and returns it's return value. It the prop does not
 * exist on the object, or if it equals undefined, or if it is a function that
 * returns undefined the defaultValue will be returned instead.
 * @param  {Object} object       The object to look into
 * @param  {string} prop         The property name
 * @param  {*}      defaultValue The default value
 * @param  {*[]}    args         Any additional arguments to pass to the
 *                               function (if the prop is a function).
 * @return {*}                   Whatever happens to be the return value
 */
// istanbul ignore next
function access(object: any, prop: string, defaultValue: any, ...args: any): any {
  let result = object[prop];
  if (typeof result === "function") {
    result = result(...args);
  }
  return result === undefined ? defaultValue : result;
}

/** Bounds function prototype for [[NumericInput]] component
 * @beta
 * @deprecated use [NumberInput]($ui-core) instead
 */
export type BoundsFunctionProp = number | (() => number | undefined);

/** @internal
 * @deprecated use [NumberInput]($ui-core) instead */
// eslint-disable-next-line deprecation/deprecation
export type ReactStepFunctionProp = number | ((component: ReactNumericInput, direction: string) => number | undefined);

/** Base properties for the [[NumericInput]] component
 * @beta
 * @deprecated use [NumberInput]($ui-core) instead
 */
export interface ReactNumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "min" | "max" | "step" | "onChange" | "defaultValue" | "onInvalid">, CommonProps {
  componentClass?: string;
  defaultValue?: number | string;
  format?: ((value: number | null, strValue: string) => string);
  // eslint-disable-next-line deprecation/deprecation
  max?: BoundsFunctionProp;
  maxLength?: number;
  // eslint-disable-next-line deprecation/deprecation
  min?: BoundsFunctionProp;
  mobile?: boolean | "auto" | (() => boolean);
  noStyle?: boolean;
  noValidate?: boolean | string;
  onBlur?: React.FocusEventHandler<HTMLDivElement | HTMLInputElement>;
  onChange?: ((value: number | null, stringValue: string, input: HTMLInputElement) => void);
  onFocus?: React.FocusEventHandler<HTMLDivElement | HTMLInputElement>;
  onInput?: React.FormEventHandler<HTMLInputElement>;
  onInvalid?: ((error: string, value: number | null, stringValue: string) => void);
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement | HTMLInputElement>;
  onSelect?: React.ReactEventHandler<HTMLInputElement>;
  onValid?: ((value: number | null, stringValue: string) => void);
  parse?: ((value: string) => number | null);
  precision?: number | (() => number | null | undefined);
  snap?: boolean;
  /** @internal */
  // eslint-disable-next-line deprecation/deprecation
  step?: ReactStepFunctionProp;
  strict: boolean;
  value?: number | string;

  /** Indicates whether to set focus to the input element */
  setFocus?: boolean;
}

/** @internal */
interface ReactNumericInputState {
  selectionStart?: number | null;
  selectionEnd?: number | null;
  btnDownHover?: boolean;
  btnDownActive?: boolean;
  btnUpHover?: boolean;
  btnUpActive?: boolean;
  value?: number | null;
  stringValue?: string;
}
/* eslint-enable */

/** @internal
 * @deprecated use [NumberInput]($ui-core) instead */
// istanbul ignore next
// eslint-disable-next-line deprecation/deprecation
export class ReactNumericInput extends React.Component<ReactNumericInputProps, ReactNumericInputState> {

  /**
   * The default behavior is to start from 0, use step of 1 and display
   * integers
   */
  // istanbul ignore next
  public static defaultProps = {
    step: 1,
    min: Number.MIN_SAFE_INTEGER || -9007199254740991,
    max: Number.MAX_SAFE_INTEGER || 9007199254740991,
    precision: null,
    parse: null,
    format: null,
    mobile: "auto",
    strict: false,
    componentClass: "input",
    style: {},
  };

  /**
   * This are the default styles that act as base for all the component
   * instances. One can modify this object to change the default styles
   * of all the widgets on the page.
   */
  private static _style = {

    // The wrapper (span)
    "wrap": {
      position: "relative",
      display: "inline-block",
    },

    "wrap.hasFormControl": {
      display: "block",
    },

    // The increase button arrow (i)
    "arrowUp": {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 0,
      height: 0,
      borderWidth: "0 0.6ex 0.6ex 0.6ex",
      borderColor: "transparent transparent rgba(0, 0, 0, 0.7)",
      borderStyle: "solid",
      margin: "-0.3ex 0 0 -0.56ex",
    },

    // The decrease button arrow (i)
    "arrowDown": {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 0,
      height: 0,
      borderWidth: "0.6ex 0.6ex 0 0.6ex",
      borderColor: "rgba(0, 0, 0, 0.7) transparent transparent",
      borderStyle: "solid",
      margin: "-0.3ex 0 0 -0.56ex",
    },

    // The vertical segment of the plus sign (for mobile only)
    "plus": {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 2,
      height: 10,
      background: "rgba(0,0,0,.7)",
      margin: "-5px 0 0 -1px",
    },

    // The horizontal segment of the plus/minus signs (for mobile only)
    "minus": {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 10,
      height: 2,
      background: "rgba(0,0,0,.7)",
      margin: "-1px 0 0 -5px",
    },

    // Common styles for the up/down buttons (b)
    "btn": {
      position: "absolute",
      right: 2,
      width: "2.26ex",
      borderColor: "rgba(0,0,0,.1)",
      borderStyle: "solid",
      textAlign: "center",
      cursor: "default",
      transition: "all 0.1s",
      background: "rgba(0,0,0,.1)",
      boxShadow: "-1px -1px 3px rgba(0,0,0,.1) inset," +
        "1px 1px 3px rgba(255,255,255,.7) inset",
    },

    "btnUp": {
      top: 2,
      bottom: "50%",
      borderRadius: "2px 2px 0 0",
      borderWidth: "1px 1px 0 1px",
    },

    "btnUp.mobile": {
      width: "3.3ex",
      bottom: 2,
      boxShadow: "none",
      borderRadius: 2,
      borderWidth: 1,
    },

    "btnDown": {
      top: "50%",
      bottom: 2,
      borderRadius: "0 0 2px 2px",
      borderWidth: "0 1px 1px 1px",
    },

    "btnDown.mobile": {
      width: "3.3ex",
      bottom: 2,
      left: 2,
      top: 2,
      right: "auto",
      boxShadow: "none",
      borderRadius: 2,
      borderWidth: 1,
    },

    "btn:hover": {
      background: "rgba(0,0,0,.2)",
    },

    "btn:active": {
      background: "rgba(0,0,0,.3)",
      boxShadow: "0 1px 3px rgba(0,0,0,.2) inset," +
        "-1px -1px 4px rgba(255,255,255,.5) inset",
    },

    "btn:disabled": {
      opacity: 0.5,
      boxShadow: "none",
      cursor: "not-allowed",
    },

    // The input (input[type="text"])
    "input": {
      paddingRight: "3ex",
      boxSizing: "border-box",
      fontSize: "inherit",
    },

    // The input with bootstrap class
    "input:not(.form-control)": {
      border: "1px solid #ccc",
      borderRadius: 2,
      paddingLeft: 4,
      display: "block",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      WebkitAppearance: "none",
      lineHeight: "normal",
    },

    "input.mobile": {
      paddingLeft: " 3.4ex",
      paddingRight: "3.4ex",
      textAlign: "center",
    },

    "input:focus": {},

    "input:disabled": {
      color: "rgba(0, 0, 0, 0.3)",
      textShadow: "0 1px 0 rgba(255, 255, 255, 0.8)",
    },
  };

  /**
   * When click and hold on a button - the speed of auto changing the value.
   * This is a static property and can be modified if needed.
   */
  public static SPEED = 50;

  /**
   * When click and hold on a button - the delay before auto changing the value.
   * This is a static property and can be modified if needed.
   */
  public static DELAY = 500;

  /**
   * The constant indicating up direction (or increasing in general)
   */
  public static DIRECTION_UP = "up";

  /**
   * The constant indicating down direction (or decreasing in general)
   */
  public static DIRECTION_DOWN = "down";

  /**
   * The step timer
   * @type {number}
   */
  private _timer: number = 0;

  /**
   * This holds the last known validation error. We need to compare that with
   * new errors and detect validation changes...
   * @type {string}
   */
  private _valid: string = "";

  private _isStrict: boolean;
  private _ignoreValueChange: boolean = false;
  private _isUnmounted: boolean = true;
  private _inputFocus: boolean = false;

  private _refsWrapper?: HTMLSpanElement;

  /** @internal */
  public refsInput: HTMLInputElement | undefined;

  /**
   * Set the initial state and bind this._stop to the instance.
   */
  // eslint-disable-next-line deprecation/deprecation
  constructor(props: ReactNumericInputProps) {
    super(props);

    this._isStrict = !!this.props.strict;

    this.state = {
      btnDownHover: false,
      btnDownActive: false,
      btnUpHover: false,
      btnUpActive: false,
      stringValue: "",
      ...this._propsToState(this.props, true),
    };
  }

  // eslint-disable-next-line deprecation/deprecation
  private _propsToState(props: ReactNumericInputProps, initialMount = false) {
    const out: ReactNumericInputState = {};

    if (props.hasOwnProperty("value")) {
      out.stringValue = String(
        props.value || props.value === 0 ? props.value : "",
      ).trim();

      out.value = out.stringValue !== "" ?
        this._parse(props.value) :
        null;
    } else if (initialMount && props.hasOwnProperty("defaultValue")) {
      out.stringValue = String(
        props.defaultValue || props.defaultValue === 0 ? props.defaultValue : "",
      ).trim();

      out.value = props.defaultValue !== "" ?
        this._parse(props.defaultValue) :
        null;
    }

    return out;
  }

  /**
   * After the component has been rendered into the DOM, do whatever is
   * needed to "reconnect" it to the outer world, i.e. restore selection,
   * call some of the callbacks, validate etc.
   */
  // eslint-disable-next-line deprecation/deprecation
  public override componentDidUpdate(prevProps: ReactNumericInputProps, prevState: ReactNumericInputState): void {
    if (!this.refsInput)
      return;

    // if new props sent in then update state so new props are rendered
    if (this.props !== prevProps) {
      this._isStrict = !!this.props.strict;
      const nextState = this._propsToState(this.props);
      this.setState(nextState);
      return;
    }

    // Call the onChange if needed. This is placed here because there are
    // many reasons for changing the value and this is the common place
    // that can capture them all
    if (!this._ignoreValueChange // no onChange if re-rendered with different value prop
      && prevState.value !== this.state.value // no onChange if the value remains the same
      && (this.state.value === null || this.state.value === undefined || !isNaN(this.state.value)) // only if changing to number or null
    ) {
      this._invokeEventCallback("onChange", this.state.value, this.refsInput.value, this.refsInput);
    }

    // focus the input is needed (for example up/down buttons set
    // this._inputFocus to true)
    if (this._inputFocus) {
      this.refsInput.focus();

      // Restore selectionStart (if any)
      if (this.state.selectionStart || this.state.selectionStart === 0) {
        this.refsInput.selectionStart = this.state.selectionStart;
      }

      // Restore selectionEnd (if any)
      if (this.state.selectionEnd || this.state.selectionEnd === 0) {
        this.refsInput.selectionEnd = this.state.selectionEnd;
      }
    }

    this.checkValidity();
  }

  /**
   * This is used to clear the timer if any
   */
  public override componentWillUnmount(): void {
    this._isUnmounted = true;
    this._stop();
  }

  /**
   * Adds getValueAsNumber and setValue methods to the input DOM element.
   */
  public override componentDidMount(): void {
    if (!this.refsInput)
      return;

    this._isUnmounted = false;
    (this.refsInput as any).getValueAsNumber = () => this.state.value || 0;

    (this.refsInput as any).setValue = (value: any) => {
      if (!this._isUnmounted)
        this.setState({
          value: this._parse(value),
          stringValue: value,
        });
    };

    // This is a special case! If the component has the "autoFocus" prop
    // and the browser did focus it we have to pass that to the onFocus
    if ((!this._inputFocus && IS_BROWSER && document.activeElement === this.refsInput) || this.props.setFocus) {
      this._inputFocus = true;
      this.refsInput.focus();
      this._invokeEventCallback("onFocus", {
        target: this.refsInput,
        type: "focus",
      });
    }

    this.checkValidity();
  }

  /**
   * Unless noValidate is set to true, the component will check the
   * existing validation state (if any) and will toggle the "has-error"
   * CSS class on the wrapper
   */
  private checkValidity(): void {
    if (!this.refsInput)
      return;

    let valid, validationError = "";

    const supportsValidation = !!this.refsInput.checkValidity; // eslint-disable-line @typescript-eslint/unbound-method

    // noValidate
    const noValidate = !!(
      this.props.noValidate && this.props.noValidate !== "false"
    );

    (this.refsInput as any).noValidate = noValidate;

    // If "noValidate" is set or "checkValidity" is not supported then
    // consider the element valid. Otherwise consider it invalid and
    // make some additional checks below
    valid = noValidate || !supportsValidation;

    if (valid) {
      validationError = "";
    } else {

      // In some browsers once a pattern is set it cannot be removed. The
      // browser sets it to "" instead which results in validation
      // failures...
      if (this.refsInput.pattern === "") {
        this.refsInput.pattern = this.props.required ? ".+" : ".*";
      }

      // Now check validity
      if (supportsValidation) {
        this.refsInput.checkValidity();
        valid = this.refsInput.validity.valid;

        if (!valid) {
          validationError = this.refsInput.validationMessage;
        }
      }

      // Some browsers might fail to validate maxLength
      if (valid && supportsValidation && this.props.maxLength) {
        if (this.refsInput.value.length > this.props.maxLength) {
          validationError = "This value is too long";
        }
      }
    }

    validationError = validationError || (
      valid ? "" : this.refsInput.validationMessage || "Unknown Error"
    );

    const validStateChanged = this._valid !== validationError;
    this._valid = validationError;

    if (!this._refsWrapper)
      return;

    if (validationError) {
      addClass(this._refsWrapper, "has-error");
      if (validStateChanged) {
        this._invokeEventCallback(
          "onInvalid",
          validationError,
          this.state.value,
          this.refsInput.value,
        );
      }
    } else {
      removeClass(this._refsWrapper, "has-error");
      if (validStateChanged) {
        this._invokeEventCallback(
          "onValid",
          this.state.value,
          this.refsInput.value,
        );
      }
    }
  }

  /**
   * Used internally to parse the argument x to it's numeric representation.
   * If the argument cannot be converted to finite number returns 0; If a
   * "precision" prop is specified uses it round the number with that
   * precision (no fixed precision here because the return value is float, not
   * string).
   */
  private _toNumber(x: any): number {
    let n = parseFloat(x);
    if (isNaN(n) || !isFinite(n)) {
      n = 0;
    }

    if (this._isStrict) {
      const precision = access(this.props, "precision", null, this);
      const q = Math.pow(10, precision === null ? 10 : precision);
      // eslint-disable-next-line deprecation/deprecation
      const min = +access(this.props, "min", ReactNumericInput.defaultProps.min, this);
      // eslint-disable-next-line deprecation/deprecation
      const max = +access(this.props, "max", ReactNumericInput.defaultProps.max, this);
      n = Math.min(Math.max(n, min), max);
      n = Math.round(n * q) / q;
    }

    return n;
  }

  /**
   * This is used internally to parse any string into a number. It will
   * delegate to this.props.parse function if one is provided. Otherwise it
   * will just use parseFloat.
   */
  private _parse(x: string | number | undefined): number | null {
    const myX = String(x);
    if (typeof this.props.parse === "function") {
      return this.props.parse(myX);
    }
    return parseFloat(myX);
  }

  /**
   * This is used internally to format a number to its display representation.
   * It will invoke the this.props.format function if one is provided.
   */
  private _format(n: number): string {
    const num: number = this._toNumber(n);
    let str: string = `${num}`;
    const precision = access(this.props, "precision", null, this);

    if (precision !== null) {
      str = num.toFixed(precision);
    }

    if (this.props.format) {
      return this.props.format(num, str);
    }

    return str;
  }

  /**
   * The internal method that actually sets the new value on the input
   */
  private _step(n: number, callback?: () => void): boolean {
    const isStrict = this._isStrict;
    this._isStrict = true;

    const step = +access(
      this.props,
      "step",
      // eslint-disable-next-line deprecation/deprecation
      ReactNumericInput.defaultProps.step,
      this,
      (
        n > 0 ?
          // eslint-disable-next-line deprecation/deprecation
          ReactNumericInput.DIRECTION_UP :
          // eslint-disable-next-line deprecation/deprecation
          ReactNumericInput.DIRECTION_DOWN
      ),
    );

    let num = this._toNumber((this.state.value || 0) + step * n);

    if (this.props.snap) {
      num = Math.round(num / step) * step;
    }

    this._isStrict = isStrict;

    if (num !== this.state.value) {
      if (!this._isUnmounted)
        this.setState({ value: num, stringValue: `${num}` }, callback);
      return true;
    }

    return false;
  }

  /**
   * This binds the Up/Down arrow key listeners
   */
  private _onKeyDown = (...args: any[]): void => {
    args[0].persist();
    this._invokeEventCallback("onKeyDown", ...args);
    const e = args[0];
    if (!e.isDefaultPrevented()) {
      if (e.key === SpecialKey.ArrowUp) {
        e.preventDefault();
        this._step(e.ctrlKey || e.metaKey ? 0.1 : e.shiftKey ? 10 : 1);
      } else if (e.key === SpecialKey.ArrowDown) {
        e.preventDefault();
        this._step(e.ctrlKey || e.metaKey ? -0.1 : e.shiftKey ? -10 : -1);
      } else if (this.refsInput) {
        const value = this.refsInput.value, length = value.length;
        if (e.key === SpecialKey.Backspace) {
          if (this.refsInput.selectionStart === this.refsInput.selectionEnd &&
            this.refsInput.selectionEnd && this.refsInput.selectionEnd > 0 &&
            value.length &&
            value.charAt(this.refsInput.selectionEnd - 1) === ".") {
            e.preventDefault();
            this.refsInput.selectionStart = this.refsInput.selectionEnd = this.refsInput.selectionEnd - 1;
          }
        } else if (e.key === SpecialKey.Delete) {
          if (this.refsInput.selectionStart === this.refsInput.selectionEnd &&
            this.refsInput.selectionEnd && this.refsInput.selectionEnd < length + 1 &&
            value.length &&
            value.charAt(this.refsInput.selectionEnd) === ".") {
            e.preventDefault();
            this.refsInput.selectionStart = this.refsInput.selectionEnd = this.refsInput.selectionEnd + 1;
          }
        }
      }
    }
  };

  /**
   * Stops the widget from auto-changing by clearing the timer (if any)
   */
  private _stop = (): void => {
    if (this._timer) {
      window.clearTimeout(this._timer);
    }
  };

  /**
   * Increments the value with one step and the enters a recursive calls
   * after DELAY. This is bound to the mousedown event on the "up" button
   * and will be stopped on mouseout/mouseup.
   * @param {boolean} _recursive The method is passing this to itself while
   *  it is in recursive mode.
   * @return void
   */
  private increase(_recursive: boolean = false, callback?: () => void): void {
    this._stop();
    this._step(1, callback);
    // eslint-disable-next-line deprecation/deprecation
    const max = +access(this.props, "max", ReactNumericInput.defaultProps.max, this);
    if (this.state.value === undefined || this.state.value === null || isNaN(this.state.value) || +this.state.value < max) {
      this._timer = window.setTimeout(() => {
        this.increase(true);
        // eslint-disable-next-line deprecation/deprecation
      }, _recursive ? ReactNumericInput.SPEED : ReactNumericInput.DELAY);
    }
  }

  /**
   * Decrements the value with one step and the enters a recursive calls
   * after DELAY. This is bound to the mousedown event on the "down" button
   * and will be stopped on mouseout/mouseup.
   * @param {boolean} _recursive The method is passing this to itself while
   *  it is in recursive mode.
   * @return void
   */
  private decrease(_recursive: boolean = false, callback?: () => void): void {
    this._stop();
    this._step(-1, callback);
    // eslint-disable-next-line deprecation/deprecation
    const min = +access(this.props, "min", ReactNumericInput.defaultProps.min, this);
    if (this.state.value === undefined || this.state.value === null || isNaN(this.state.value) || +this.state.value > min) {
      this._timer = window.setTimeout(() => {
        this.decrease(true);
        // eslint-disable-next-line deprecation/deprecation
      }, _recursive ? ReactNumericInput.SPEED : ReactNumericInput.DELAY);
    }
  }

  /**
   * Handles the mousedown event on the up/down buttons. Changes The
   * internal value and sets up a delay for auto increment/decrement
   * (until mouseup or mouseleave)
   */
  private onMouseDown(dir: "up" | "down", callback?: () => void): void {
    if (dir === "down") {
      this.decrease(false, callback);
    } else if (dir === "up") {
      this.increase(false, callback);
    }
  }

  /**
   * Handles the touchstart event on the up/down buttons. Changes The
   * internal value and DOES NOT sets up a delay for auto increment/decrement.
   * Note that this calls e.preventDefault() so the event is not used for
   * creating a virtual mousedown after it
   */
  private onTouchStart(dir: "up" | "down", e: Event): void {
    e.preventDefault();
    if (dir === "down") {
      this.decrease();
    } else if (dir === "up") {
      this.increase();
    }
  }

  private _onTouchEnd = (e: Event): void => {
    e.preventDefault();
    this._stop();
  };

  /**
   * Helper method to invoke event callback functions if they are provided
   * in the props.
   * @param {string} callbackName The name of the function prop
   * @param {*[]} args Any additional argument are passed thru
   */
  private _invokeEventCallback(callbackName: string, ...args: any[]): void {
    if (this.props.hasOwnProperty(callbackName)) {
      const callback = (this.props as any)[callbackName];
      if (typeof callback === "function") {
        callback.call(null, ...args);
      }
    }
  }

  /**
   * Renders an input wrapped in relative span and up/down buttons
   * @return {Element}
   */
  public override render(): JSX.Element {
    const state = this.state;
    const css: { [key: string]: any } = {};

    // eslint-disable-next-line prefer-const
    let { mobile, noStyle, ...props } = this.props;

    const {
      // These are ignored in rendering
      step, min, max, precision, parse, format, snap, componentClass, // eslint-disable-line @typescript-eslint/no-unused-vars
      value, type, style, defaultValue, onInvalid, onValid, strict, setFocus, // eslint-disable-line @typescript-eslint/no-unused-vars

      // The rest are passed to the input
      ...rest
    } = props;

    noStyle = noStyle || style === false;

    // Build the styles
    // eslint-disable-next-line guard-for-in, deprecation/deprecation
    for (const x in ReactNumericInput._style) {
      css[x] = Object.assign(
        {},
        // eslint-disable-next-line deprecation/deprecation
        (ReactNumericInput._style as any)[x],
        style ? (style as any)[x] || {} : {},
      );
    }

    const hasFormControl = props.className && (/\bform-control\b/).test(
      props.className,
    );

    if (mobile === "auto") {
      mobile = IS_BROWSER && "ontouchstart" in document;
    }

    if (typeof mobile === "function") {
      mobile = mobile.call(this);
    }
    mobile = !!mobile;

    const attrs = {
      wrap: {
        style: noStyle ? null : css.wrap,
        className: "react-numeric-input",
        ref: (e: HTMLSpanElement) => { this._refsWrapper = e; },
        onMouseUp: undefined,
        onMouseLeave: undefined,
      },
      input: {
        ref: (e: HTMLInputElement) => { this.refsInput = e; },
        type: "text",
        style: noStyle ? null : Object.assign(
          {},
          css.input,
          !hasFormControl ?
            css["input:not(.form-control)"] :
            {},
          this._inputFocus ? css["input:focus"] : {},
        ),
        value: "",
        ...rest,
      },
      btnUp: {
        onMouseEnter: undefined,
        onMouseDown: undefined,
        onMouseUp: undefined,
        onMouseLeave: undefined,
        onTouchStart: undefined,
        onTouchEnd: undefined,
        style: noStyle ? null : Object.assign(
          {},
          css.btn,
          css.btnUp,
          props.disabled || props.readOnly ?
            css["btn:disabled"] :
            state.btnUpActive ?
              css["btn:active"] :
              state.btnUpHover ?
                css["btn:hover"] :
                {},
        ),
      },
      btnDown: {
        onMouseEnter: undefined,
        onMouseDown: undefined,
        onMouseUp: undefined,
        onMouseLeave: undefined,
        onTouchStart: undefined,
        onTouchEnd: undefined,
        style: noStyle ? null : Object.assign(
          {},
          css.btn,
          css.btnDown,
          props.disabled || props.readOnly ?
            css["btn:disabled"] :
            state.btnDownActive ?
              css["btn:active"] :
              state.btnDownHover ?
                css["btn:hover"] :
                {},
        ),
      },
    };

    const stringValue = String(
      // if state.stringValue is set and not empty
      state.stringValue ||

      // else if state.value is set and not null|undefined
      (state.value || state.value === 0 ? state.value : "") ||

      // or finally use ""
      "",
    );

    const loose = !this._isStrict && (this._inputFocus || this._isUnmounted);

    // incomplete number
    if (loose && RE_INCOMPLETE_NUMBER.test(stringValue)) {
      attrs.input.value = stringValue;
    } else if (loose && stringValue && !RE_NUMBER.test(stringValue)) {
      attrs.input.value = stringValue;
    } else if (state.value || state.value === 0) {
      attrs.input.value = this._format(state.value);
    } else {
      attrs.input.value = "";
    }

    if (hasFormControl && !noStyle) {
      Object.assign(attrs.wrap.style, css["wrap.hasFormControl"]);
    }

    // mobile
    if (mobile && !noStyle) {
      Object.assign(attrs.input.style, css["input.mobile"]);
      Object.assign(attrs.btnUp.style, css["btnUp.mobile"]);
      Object.assign(attrs.btnDown.style, css["btnDown.mobile"]);
    }

    // Attach event listeners if the widget is not disabled
    if (!props.disabled && !props.readOnly) {
      Object.assign(attrs.wrap, {
        onMouseUp: this._stop,
        onMouseLeave: this._stop,
      });

      Object.assign(attrs.btnUp, {
        onTouchStart: this.onTouchStart.bind(this, "up"),
        onTouchEnd: this._onTouchEnd,
        onMouseEnter: () => {
          if (!this._isUnmounted)
            this.setState({
              btnUpHover: true,
            });
        },
        onMouseLeave: () => {
          this._stop();
          if (!this._isUnmounted)
            this.setState({
              btnUpHover: false,
              btnUpActive: false,
            });
        },
        onMouseUp: () => {
          if (!this._isUnmounted)
            this.setState({
              btnUpHover: true,
              btnUpActive: false,
            });
        },
        onMouseDown: (...args: any[]) => {
          args[0].preventDefault();
          args[0].persist();
          this._inputFocus = true;
          if (!this._isUnmounted)
            this.setState({
              btnUpHover: true,
              btnUpActive: true,
            }, () => {
              this._invokeEventCallback("onFocus", ...args);
              this.onMouseDown("up");
            });

        },
      });

      Object.assign(attrs.btnDown, {
        onTouchStart: this.onTouchStart.bind(this, "down"),
        onTouchEnd: this._onTouchEnd,
        onMouseEnter: () => {
          if (!this._isUnmounted)
            this.setState({
              btnDownHover: true,
            });
        },
        onMouseLeave: () => {
          this._stop();
          if (!this._isUnmounted)
            this.setState({
              btnDownHover: false,
              btnDownActive: false,
            });
        },
        onMouseUp: () => {
          if (!this._isUnmounted)
            this.setState({
              btnDownHover: true,
              btnDownActive: false,
            });
        },
        onMouseDown: (...args: any[]) => {
          args[0].preventDefault();
          args[0].persist();
          this._inputFocus = true;
          if (!this._isUnmounted)
            this.setState({
              btnDownHover: true,
              btnDownActive: true,
            }, () => {
              this._invokeEventCallback("onFocus", ...args);
              this.onMouseDown("down");
            });
        },
      });

      Object.assign(attrs.input, {
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const original = e.target.value;
          let val: number | null = this._parse(original);
          if (val === null || isNaN(val)) {
            val = null;
          }
          if (!this._isUnmounted)
            this.setState({
              value: this._isStrict ? this._toNumber(val) : val,
              stringValue: original,
            });
        },
        onKeyDown: this._onKeyDown,
        onInput: (...args: any[]) => {
          this._invokeEventCallback("onInput", ...args);
        },
        onSelect: (...args: any[]) => {
          this._invokeEventCallback("onSelect", ...args);
        },
        onFocus: (...args: any[]) => {
          args[0].persist();
          this._inputFocus = true;
          const val = this._parse(args[0].target.value);
          const stringVal = val || val === 0 ? `${val}` : "";
          // istanbul ignore else
          if (!this._isUnmounted && val !== this.state.value && stringVal !== this.state.stringValue)
            this.setState({
              value: val,
              stringValue: stringVal,
            }, () => {
              this._invokeEventCallback("onFocus", ...args);
            });
        },
        onBlur: (...args: any[]) => {
          const isStrict = this._isStrict;
          this._isStrict = true;
          args[0].persist();
          this._inputFocus = false;
          const val = this._parse(args[0].target.value);
          // istanbul ignore else
          if (!this._isUnmounted && val !== this.state.value)
            this.setState({
              value: val,
            }, () => {
              this._invokeEventCallback("onBlur", ...args);
              this._isStrict = isStrict;
            });
        },
      });
    } else {
      if (!noStyle && props.disabled) {
        Object.assign(attrs.input.style, css["input:disabled"]);
      }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const InputTag = componentClass || "input";

    if (mobile) {
      return (
        <span {...attrs.wrap}>
          <InputTag {...attrs.input} />
          <b {...attrs.btnUp}>
            <i style={noStyle ? null : css.minus} />
            <i style={noStyle ? null : css.plus} />
          </b>
          <b {...attrs.btnDown}>
            <i style={noStyle ? null : css.minus} />
          </b>
        </span>
      );
    }

    return (
      <span {...attrs.wrap}>
        <InputTag {...attrs.input} />
        <b {...attrs.btnUp}>
          <i style={noStyle ? null : css.arrowUp} />
        </b>
        <b {...attrs.btnDown}>
          <i style={noStyle ? null : css.arrowDown} />
        </b>
      </span>
    );
  }
}
