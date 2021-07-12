/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import * as React from "react";
import { withStatusFieldProps } from "../statusbar/withStatusFieldProps";
import { ConditionalField } from "./ConditionalField";
import { StatusFieldProps } from "./StatusFieldProps";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ConditionalFieldWithProps = withStatusFieldProps(ConditionalField);

/** Properties for a FooterModeField component
 * @public
 */
export interface FooterModeFieldProps extends StatusFieldProps {
  /** Field content. */
  children?: React.ReactNode;
}

/**
 * A component that renders its children if the StatusBar is in Footer mode.
 * @public
 */
export class FooterModeField extends React.PureComponent<FooterModeFieldProps> {

  public override render(): React.ReactNode {
    const { children, ...otherProps } = this.props as any;

    return (
      <ConditionalFieldWithProps {...otherProps} boolFunc={(props: StatusFieldProps): boolean => props.isInFooterMode} >
        {(isInFooterMode: boolean) => isInFooterMode && children}
      </ConditionalFieldWithProps>
    );
  }
}
