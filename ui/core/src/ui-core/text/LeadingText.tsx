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

/** Styled leading text React functional component
 * @public
 * @deprecated Use Leading in itwinui-react instead
 */
export function LeadingText(props: TextProps) {
  return <StyledText {...props} mainClassName="uicore-text-leading" />;
}
