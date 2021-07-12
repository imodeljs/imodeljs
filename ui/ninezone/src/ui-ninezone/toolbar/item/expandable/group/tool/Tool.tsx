/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Tool.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, useTargeted } from "@bentley/ui-core";

/** Properties of [[GroupTool]] component.
 * @alpha
 */
export interface GroupToolProps extends CommonProps {
  /** Additional content, besides icon and label. */
  children?: React.ReactNode;
  /** Tool icon. */
  icon?: React.ReactNode;
  /** Describes if the item is active. */
  isActive?: boolean;
  /** Describes if the item is disabled. */
  isDisabled?: boolean;
  /** Describes if the item is focused. */
  isFocused?: boolean;
  /** Tool label. */
  label?: string;
  /** Function called when the item is clicked. */
  onClick?: () => void;
  /** Function called when pointer up event is received. */
  onPointerUp?: () => void;
  /** A badge to draw. */
  badge?: React.ReactNode;
}

function GroupToolComponent(props: GroupToolProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const targeted = useTargeted(ref);
  const itemClassName = classnames(
    "nz-toolbar-item-expandable-group-tool-item",
    props.isActive && "nz-active",
    props.isFocused && "nz-focused",
    props.isDisabled && "nz-disabled",
    props.onPointerUp && "nz-pointer-up",
    targeted && "nz-targeted",
    props.className);
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={itemClassName}
      onClick={props.isDisabled ? undefined : props.onClick}
      onPointerUp={props.isDisabled ? undefined : props.onPointerUp}
      ref={ref}
      style={props.style}
    >
      <div className="nz-icon">
        {props.icon}
        {props.badge &&
          <div className="nz-badge">
            {props.badge}
          </div>
        }
      </div>
      <div className="nz-label">
        {props.label}
      </div>
      {props.children}
    </div>
  );
}

/** Tool entry of tool group panel. Used in [[GroupColumn]].
 * @alpha
 */
export class GroupTool extends React.PureComponent<GroupToolProps> {
  public override render() {
    return <GroupToolComponent {...this.props} />;
  }
}
