/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./FloatingWidget.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Point, PointProps, Rectangle, useRefs } from "@bentley/ui-core";
import { assert } from "@bentley/bentleyjs-core";
import { useDragResizeHandle, UseDragResizeHandleArgs, useIsDraggedItem } from "../base/DragManager";
import { NineZoneDispatchContext } from "../base/NineZone";
import { FloatingWidgetState, WidgetState } from "../base/NineZoneState";
import { WidgetContentContainer } from "./ContentContainer";
import { WidgetTabBar } from "./TabBar";
import { Widget, WidgetProvider, WidgetStateContext } from "./Widget";
import { PointerCaptorArgs, usePointerCaptor } from "../base/PointerCaptor";

type FloatingWidgetEdgeHandle = "left" | "right" | "top" | "bottom";
type FloatingWidgetCornerHandle = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** @internal */
export type FloatingWidgetResizeHandle = FloatingWidgetEdgeHandle | FloatingWidgetCornerHandle;

/** @internal */
export interface FloatingWidgetProps {
  floatingWidget: FloatingWidgetState;
  widget: WidgetState;
  defaultStyle?: React.CSSProperties;
  transitionStyle?: React.CSSProperties;
}

/** @internal */
export const FloatingWidget = React.memo<FloatingWidgetProps>(function FloatingWidget(props) { // eslint-disable-line @typescript-eslint/naming-convention, no-shadow
  const { id, animateTransition } = props.floatingWidget;
  const { minimized } = props.widget;
  const className = React.useMemo(() => classnames(
    minimized && "nz-minimized",
  ), [minimized]);
  const widgetStyle = animateTransition ? props.transitionStyle : props.defaultStyle;
  return (
    <FloatingWidgetIdContext.Provider value={id}>
      <FloatingWidgetContext.Provider value={props.floatingWidget}>
        <WidgetProvider
          widget={props.widget}
        >
          <FloatingWidgetComponent
            className={className}
            style={widgetStyle}
          />
        </WidgetProvider>
      </FloatingWidgetContext.Provider>
    </FloatingWidgetIdContext.Provider>
  );
});

/** @internal */
export const FloatingWidgetIdContext = React.createContext<FloatingWidgetState["id"] | undefined>(undefined); // eslint-disable-line @typescript-eslint/naming-convention
FloatingWidgetIdContext.displayName = "nz:FloatingWidgetIdContext";

/** @internal */
export const FloatingWidgetContext = React.createContext<FloatingWidgetState | undefined>(undefined); // eslint-disable-line @typescript-eslint/naming-convention
FloatingWidgetContext.displayName = "nz:FloatingWidgetContext";

const FloatingWidgetComponent = React.memo<CommonProps>(function FloatingWidgetComponent(props) { // eslint-disable-line @typescript-eslint/no-shadow, @typescript-eslint/naming-convention
  const widget = React.useContext(WidgetStateContext);
  const floatingWidgetId = React.useContext(FloatingWidgetIdContext);
  assert(!!widget);
  assert(!!floatingWidgetId);
  const item = React.useMemo(() => ({
    id: floatingWidgetId,
    type: "widget" as const,
  }), [floatingWidgetId]);
  const dragged = useIsDraggedItem(item);
  const className = classnames(
    "nz-widget-floatingWidget",
    dragged && "nz-dragged",
    props.className,
  );
  return (
    <Widget
      className={className}
      style={props.style}
    >
      <WidgetTabBar separator={!widget.minimized} />
      <WidgetContentContainer />
      <FloatingWidgetHandle handle="left" />
      <FloatingWidgetHandle handle="top" />
      <FloatingWidgetHandle handle="right" />
      <FloatingWidgetHandle handle="bottom" />
      <FloatingWidgetHandle handle="topLeft" />
      <FloatingWidgetHandle handle="topRight" />
      <FloatingWidgetHandle handle="bottomLeft" />
      <FloatingWidgetHandle handle="bottomRight" />
    </Widget>
  );
});

interface FloatingWidgetHandleProps {
  handle: FloatingWidgetResizeHandle;
}

const FloatingWidgetHandle = React.memo<FloatingWidgetHandleProps>(function FloatingWidgetHandle(props) { // eslint-disable-line @typescript-eslint/no-shadow, @typescript-eslint/naming-convention
  const id = React.useContext(FloatingWidgetIdContext);
  const dispatch = React.useContext(NineZoneDispatchContext);
  const { handle } = props;
  const relativePosition = React.useRef<Point>(new Point());
  assert(id !== undefined);
  const onDrag = React.useCallback<NonNullable<UseDragResizeHandleArgs["onDrag"]>>((pointerPosition) => {
    assert(!!ref.current);
    const bounds = Rectangle.create(ref.current.getBoundingClientRect());
    const newRelativePosition = bounds.topLeft().getOffsetTo(pointerPosition);
    const offset = relativePosition.current.getOffsetTo(newRelativePosition);
    const resizeBy = getResizeBy(handle, offset);
    dispatch({
      type: "FLOATING_WIDGET_RESIZE",
      id,
      resizeBy,
    });
  }, [dispatch, handle, id]);
  const handleDragStart = useDragResizeHandle({
    handle,
    widgetId: id,
    onDrag,
  });
  const handlePointerDown = React.useCallback((args: PointerCaptorArgs) => {
    assert(!!ref.current);
    const bounds = Rectangle.create(ref.current.getBoundingClientRect());
    const initialPointerPosition = new Point(args.clientX, args.clientY);
    relativePosition.current = bounds.topLeft().getOffsetTo(initialPointerPosition);
    handleDragStart({
      initialPointerPosition,
    });
    dispatch({
      type: "FLOATING_WIDGET_BRING_TO_FRONT",
      id,
    });
  }, [dispatch, handleDragStart, id]);
  const pointerCaptorRef = usePointerCaptor(handlePointerDown);
  const ref = React.useRef<HTMLDivElement>(null);
  const refs = useRefs(ref, pointerCaptorRef);
  const className = classnames(
    "nz-widget-floatingWidget_handle",
    `nz-${handle}`,
  );
  return (
    <div
      className={className}
      ref={refs}
    />
  );
});

/** @internal */
export function getResizeBy(handle: FloatingWidgetResizeHandle, offset: PointProps) {
  switch (handle) {
    case "left":
      return new Rectangle(-offset.x);
    case "top":
      return new Rectangle(0, -offset.y);
    case "right":
      return new Rectangle(0, 0, offset.x);
    case "bottom":
      return new Rectangle(0, 0, 0, offset.y);
    case "topLeft":
      return new Rectangle(-offset.x, -offset.y);
    case "topRight":
      return new Rectangle(0, -offset.y, offset.x);
    case "bottomLeft":
      return new Rectangle(-offset.x, 0, 0, offset.y);
    case "bottomRight":
      return new Rectangle(0, 0, offset.x, offset.y);
  }
}
