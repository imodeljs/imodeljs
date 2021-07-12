/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./BackArrow.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps, useTargeted } from "@bentley/ui-core";

/** Properties of [[BackArrow]] component.
 * @alpha
 */
export interface BackArrowProps extends CommonProps, NoChildrenProps {
  /** Function called when arrow is clicked. */
  onClick?: () => void;
  /** Function called when pointer up event is received. */
  onPointerUp?: () => void;
}

function BackArrowComponent(props: BackArrowProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const targeted = useTargeted(ref);
  const className = classnames(
    "nz-toolbar-item-expandable-group-backArrow",
    targeted && "nz-targeted",
    props.className);
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={className}
      onClick={props.onClick}
      onPointerUp={props.onPointerUp}
      ref={ref}
      style={props.style}
      role="button"
      tabIndex={-1}
    />
  );
}

/** Back arrow used in [[NestedGroup]] component.
 * @alpha
 */
export class BackArrow extends React.PureComponent<BackArrowProps> {
  public override render() {
    return <BackArrowComponent {...this.props} />;
  }
}
