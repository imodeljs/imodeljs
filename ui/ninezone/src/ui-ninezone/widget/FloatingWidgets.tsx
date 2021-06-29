/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { FloatingWidgetsStateContext, MeasureContext, WidgetsStateContext } from "../base/NineZone";
import { FloatingWidget} from "./FloatingWidget";
import { FloatingTab } from "./FloatingTab";
import { Transition, TransitionGroup } from "react-transition-group";
import { PointProps, Rectangle } from "@bentley/ui-core";
import { CssProperties } from "../utilities/Css";
import { WidgetContentContainersContext } from "./ContentManager";
import { FloatingWidgetHomeState } from "../base/NineZoneState";

/** This component renders all floating widgets.
 * @internal
 */
export const FloatingWidgets = React.memo(function FloatingWidgets() { // eslint-disable-line @typescript-eslint/naming-convention, no-shadow
  const floatingWidgets = React.useContext(FloatingWidgetsStateContext);
  const widgets = React.useContext(WidgetsStateContext);
  const containers = React.useContext(WidgetContentContainersContext);
  const measureNz = React.useContext(MeasureContext);

  return (
    <>
      <TransitionGroup>
        {floatingWidgets.allIds.map((floatingWidgetId) => {
          const widget = widgets[floatingWidgetId];
          const floatingWidget = floatingWidgets.byId[floatingWidgetId];
          const boundsRect = Rectangle.create(floatingWidget.bounds);
          const finalPosition = boundsRect.topLeft();
          let startPosition: PointProps = finalPosition;
          const homeWidgetId = floatingWidget.home.widgetId;
          const homeWidgetState = homeWidgetId ? widgets[homeWidgetId] : null;
          const homeWidgetContainer = homeWidgetState ? containers[homeWidgetState.activeTabId] : null;
          if (homeWidgetContainer) {
            const bounds = Rectangle.create(homeWidgetContainer.getBoundingClientRect());
            startPosition = bounds.topLeft();
          } else {
            const nzBounds = measureNz();
            startPosition = getAnimateStartPoint(floatingWidget.home, nzBounds);
          }

          const { height, width } = boundsRect.getSize();
          const useAnimatedTransitions = floatingWidget.animateTransition;
          const position = useAnimatedTransitions ? startPosition : finalPosition;
          const defaultStyle = {
            ...CssProperties.transformFromPosition(position),
            height: widget.minimized ? undefined : height,
            width,
            opacity:  useAnimatedTransitions ? 0 : undefined,
          };
          const duration = useAnimatedTransitions ? 200 : 0;
          const transitionStyles: { [id: string]: React.CSSProperties } = {
            entering: { opacity: 0, transition: `all ${duration}ms ease-in-out` },
            entered:  { opacity: 1, transform: `translate(${finalPosition.x}px, ${finalPosition.y}px)`, transition: `all ${duration}ms ease-in-out`},
            exiting:  { opacity: 1, transform: `translate(${startPosition.x}px, ${startPosition.y}px)`, transition: `all ${duration}ms ease-in-out` },
            exited:  { opacity: 0 },
          };
          return (
            <Transition
              key={floatingWidgetId}
              in={true}
              timeout={duration}
              appear={true}
              exit={true}
            >
              {(state) =>(
                <FloatingWidget
                  floatingWidget={floatingWidget}
                  widget={widget}
                  defaultStyle={defaultStyle}
                  transitionStyle={{
                    ...defaultStyle,
                    ...transitionStyles[state],
                  }}
                />
              )}
            </Transition>
          );
        })}
      </TransitionGroup>
      <FloatingTab />
    </>
  );
});
/** @internal */
export function getAnimateStartPoint(home: FloatingWidgetHomeState, nzBounds: Rectangle) {
  let x = 0;
  let y = 0;
  switch (home.side) {
    case "bottom":
      if (home.widgetIndex === 0)
        x = nzBounds.left;
      else if (home.widgetIndex === 1)
        x = nzBounds.left + (nzBounds.getWidth()/2);
        // istanbul ignore else
      else if (home.widgetIndex === 2)
        x = nzBounds.right;
      return { x, y: nzBounds.bottom};
    case "top":
      if (home.widgetIndex === 0)
        x = nzBounds.left;
      else if (home.widgetIndex === 1)
        x = nzBounds.left + (nzBounds.getWidth()/2);
        // istanbul ignore else
      else if (home.widgetIndex === 2)
        x = nzBounds.right;
      return { x, y: nzBounds.top };
    case "left":
      if (home.widgetIndex === 0)
        y = nzBounds.top;
      else if (home.widgetIndex === 1)
        y = nzBounds.top + (nzBounds.getHeight()/2);
        // istanbul ignore else
      else if (home.widgetIndex === 2)
        y = nzBounds.bottom;
      return { x: nzBounds.left, y };
    case "right":
      if (home.widgetIndex === 0)
        y = nzBounds.top;
      else if (home.widgetIndex === 1)
        y = nzBounds.top + (nzBounds.getHeight()/2);
        // istanbul ignore else
      else if (home.widgetIndex === 2)
        y = nzBounds.bottom;
      return { x:nzBounds.right, y};
  }
}
