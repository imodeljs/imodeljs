/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import classnames from "classnames";
import * as React from "react";
import { Input as ITwinUI_Input } from "@itwin/itwinui-react";
import { useRefs } from "../utils/hooks/useRefs";
import { CommonProps } from "../utils/Props";

/** Properties for the [[Input]] component
 * @public
 * @deprecated Use InputProps in itwinui-react instead
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, CommonProps {
  /** Indicates whether to set focus to the input element */
  setFocus?: boolean;
  /** Native keydown event handler */
  nativeKeyHandler?: (e: KeyboardEvent) => void;
  /** Provides ability to return reference to HTMLInputElement */
  ref?: React.Ref<HTMLInputElement>;
}

// Defined using following pattern (const Input at bottom) to ensure useful API documentation is extracted
const ForwardRefInput = React.forwardRef<HTMLInputElement, InputProps>(   // eslint-disable-line deprecation/deprecation
  function ForwardRefInput(props, ref) {
    const { className, style, setFocus, nativeKeyHandler, ...otherProps } = props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const inputElementRef = React.useRef<HTMLInputElement>();
    const refs = useRefs(inputElementRef, ref);  // combine ref needed for target with the forwardRef needed by the Parent when parent is a Type Editor.

    React.useEffect(() => {
      const currentElement = inputElementRef.current;
      const currentHandler = nativeKeyHandler;

      if (currentElement && currentHandler) {
        currentElement.addEventListener("keydown", currentHandler);
      }
      return () => {
        if (currentHandler && currentElement) {
          currentElement.removeEventListener("keydown", currentHandler);
        }
      };
    }, [nativeKeyHandler]);

    React.useEffect(() => {
      if (inputElementRef.current && setFocus)
        inputElementRef.current.focus();
    }, [setFocus]);

    const handleFocus = React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
      event.currentTarget.select();
    }, []);

    return (
      <ITwinUI_Input ref={refs} type="text" {...otherProps} onFocus={handleFocus}
        className={classnames("uicore-inputs-input", className)} style={style} />
    );
  }
);

/** Basic text input, is a wrapper for the `<input type="text">` HTML element.
 * @public
 * @deprecated Use Input in itwinui-react instead
 */
export const Input: (props: InputProps) => JSX.Element | null = ForwardRefInput;  // eslint-disable-line deprecation/deprecation
