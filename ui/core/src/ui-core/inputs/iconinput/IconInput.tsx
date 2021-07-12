/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import "./IconInput.scss";
import classnames from "classnames";
import * as React from "react";
import { Input, InputProps } from "../Input";   // NEEDSWORK - for nativeKeyHandler

/** Properties for the [[IconInput]] component
 * @public
 */
export interface IconInputProps extends Omit<InputProps, "size"> {    // eslint-disable-line deprecation/deprecation
  /** Icon displayed to the left of the Input field within the IconInput component */
  icon: React.ReactNode;
  /** CSS class name for the IconInput component container div */
  containerClassName?: string;
  /** Provides ability to return reference to HTMLInputElement */
  ref?: React.Ref<HTMLInputElement>;
  /** Modify size of the input. */
  size?: "small" | "large";
}

/** Input component with icon to the left of the input field
 * @public
 */
const ForwardRefIconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  function ForwardRefIconInput(props, ref) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { icon, containerClassName, size, ...otherProps } = props;

    // NEEDSWORK: still using ui-core Input component because of `nativeKeyHandler` prop
    return (
      <div className={classnames("core-iconInput-container", containerClassName)} >
        {/* eslint-disable-next-line deprecation/deprecation */}
        <Input ref={ref} {...otherProps} />
        <div className="core-iconInput-icon">
          {icon}
        </div>
      </div>
    );
  });

/** Input component with icon to the left of the input field
 * @public
 */
export const IconInput: (props: IconInputProps) => JSX.Element | null = ForwardRefIconInput;
