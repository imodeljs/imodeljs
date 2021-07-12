/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { WidgetProps } from "./WidgetProps";

/** Widget React component.
 * A Widget is a collection of UI components tied to a particular Zone that allows the user to view and/or modify data relevant to their current context.
 * @public
 */
export class Widget extends React.Component<WidgetProps> {

  constructor(props: WidgetProps) {
    super(props);
  }

  public override render() {
    return null;
  }

}
