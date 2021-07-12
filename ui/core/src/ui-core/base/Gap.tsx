/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Base
 */

import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Properties for the [[Gap]] component.
 * @public
 */
export interface GapProps extends CommonProps {
  size?: string;
}

/** Horizontal gap or space React component. Defaults to 10px.
 * @public
 */
export function Gap(props: GapProps) {
  const { size, style, ...rest } = props;
  const paddingLeft = size ?? "10px";

  return (
    <span style={{ ...style, paddingLeft }} {...rest} />
  );
}
