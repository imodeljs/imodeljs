/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Text
 */

import * as React from "react";
import { StyledText } from "./StyledText";
import { TextProps } from "./TextProps";

/** Styled title text React functional component
 * @public
 * @deprecated Use Title in itwinui-react instead
 */
export function Title2(props: TextProps) {
  return <StyledText {...props} mainClassName="uicore-text-title-2" />;
}
