/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tooltip
 */

/* eslint-disable deprecation/deprecation */

import "./Tooltip.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { Popup } from "../popup/Popup";
import { RelativePosition } from "@bentley/ui-abstract";

/** Available tooltip placements.
 * @beta
 * @deprecated Use Placement in itwinui-react instead
 */
export type TooltipPlacement = "bottom" | "left" | "right" | "top";

/** Properties for the [[Tooltip]] component
 * @beta
 * @deprecated Use TooltipProps in itwinui-react instead
 */
export interface TooltipProps extends CommonProps {
  /** Tooltip content. */
  children?: React.ReactNode;
  /** Target element of a tooltip. */
  target?: HTMLElement;
  /** Allows to control tooltip visibility state. */
  visible?: boolean;
  /** Preferred tooltip placement. Defaults to `top`. */
  placement?: TooltipPlacement;
}

/** Component that displays tooltip for a specified target element.
 * @beta
 * @deprecated Use Tooltip in itwinui-react instead
 */
export function Tooltip(props: TooltipProps) {
  const { visible, target, placement } = props;
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const mouseenter = () => {
      setOpen(true);
    };
    const mouseleave = () => {
      setOpen(false);
    };
    visible === undefined && target && target.addEventListener("mouseenter", mouseenter);
    visible === undefined && target && target.addEventListener("mouseleave", mouseleave);
    return () => {
      visible === undefined && target && target.removeEventListener("mouseenter", mouseenter);
      visible === undefined && target && target.removeEventListener("mouseleave", mouseleave);
    };
  }, [visible, target]);
  const className = classnames(
    "core-tooltip-tooltip",
    props.className,
  );
  return (
    <Popup
      className={className}
      isOpen={props.visible === undefined ? open : props.visible}
      position={placementToPosition(placement)}
      showShadow={false}
      target={target}
    >
      {props.children}
    </Popup>
  );
}

/** @internal */
export function placementToPosition(placement: TooltipPlacement | undefined): RelativePosition {
  switch (placement) {
    case "bottom":
      return RelativePosition.Bottom;
    case "left":
      return RelativePosition.Left;
    case "right":
      return RelativePosition.Right;
    case undefined:
    case "top":
      return RelativePosition.Top;
  }
}
