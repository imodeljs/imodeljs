/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Widget.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Rectangle, SizeProps } from "@bentley/ui-core";
import { assert } from "@bentley/bentleyjs-core";
import { useDragWidget, UseDragWidgetArgs } from "../base/DragManager";
import { getUniqueId, MeasureContext, NineZoneDispatchContext, TabsStateContext } from "../base/NineZone";
import { TabState, WidgetState } from "../base/NineZoneState";
import { PanelSideContext } from "../widget-panels/Panel";
import { FloatingWidgetIdContext } from "./FloatingWidget";

/** @internal */
export interface WidgetProviderProps {
  widget: WidgetState;
  children?: React.ReactNode;
}

/** @internal */
export const WidgetProvider = React.memo<WidgetProviderProps>(function WidgetProvider(props) { // eslint-disable-line @typescript-eslint/naming-convention, no-shadow
  return (
    <WidgetStateContext.Provider value={props.widget}>
      <WidgetIdContext.Provider value={props.widget.id}>
        <ActiveTabIdContext.Provider value={props.widget.activeTabId}>
          {props.children}
        </ActiveTabIdContext.Provider>
      </WidgetIdContext.Provider>
    </WidgetStateContext.Provider>
  );
});

/** @internal */
export interface WidgetProps extends CommonProps {
  children?: React.ReactNode;
  onTransitionEnd?(): void;
}

/** @internal */
export interface WidgetComponent {
  measure: () => SizeProps;
}

/** @internal */
export const Widget = React.memo( // eslint-disable-line react/display-name, @typescript-eslint/naming-convention
  React.forwardRef<WidgetComponent, WidgetProps>(
    function Widget(props, ref) { // eslint-disable-line @typescript-eslint/naming-convention
      const dispatch = React.useContext(NineZoneDispatchContext);
      const side = React.useContext(PanelSideContext);
      const id = React.useContext(WidgetIdContext);
      const floatingWidgetId = React.useContext(FloatingWidgetIdContext);
      const measureNz = React.useContext(MeasureContext);
      const activeTab = useActiveTab();
      const elementRef = React.useRef<HTMLDivElement>(null);
      const widgetId = floatingWidgetId === undefined ? id : floatingWidgetId;
      const onDragStart = React.useCallback<NonNullable<UseDragWidgetArgs["onDragStart"]>>((updateId, initialPointerPosition) => {
        assert(!!elementRef.current);
        if (floatingWidgetId !== undefined)
          return;
        const nzBounds = measureNz();
        let bounds = Rectangle.create(elementRef.current.getBoundingClientRect());

        const size = restrainInitialWidgetSize(bounds.getSize(), nzBounds.getSize());
        bounds = bounds.setSize(size);

        if (activeTab && activeTab.preferredFloatingWidgetSize) {
          bounds = bounds.setSize(activeTab.preferredFloatingWidgetSize);
        }

        // Pointer is outside of tab area. Need to re-adjust widget bounds so that tab is behind pointer
        if (initialPointerPosition.x > bounds.right) {
          const offset = initialPointerPosition.x - bounds.right + 20;
          bounds = bounds.offsetX(offset);
        }

        // Adjust bounds to be relative to 9z origin
        bounds = bounds.offset({ x: -nzBounds.left, y: -nzBounds.top });

        const newFloatingWidgetId = getUniqueId();
        updateId(newFloatingWidgetId);
        side && dispatch({
          type: "PANEL_WIDGET_DRAG_START",
          newFloatingWidgetId,
          id,
          bounds,
          side,
        });
      }, [activeTab, dispatch, floatingWidgetId, id, side, measureNz]);
      useDragWidget({
        widgetId,
        onDragStart,
      });
      React.useEffect(() => {
        const listener = (e: Event) => {
          const el = e.target as HTMLElement;
          assert (!!el);
          let targetElement = el.offsetParent;
          // istanbul ignore else
          if (!targetElement)
            targetElement = el;

          if (targetElement && targetElement.classList.contains("nz-widget-sendBack")){
            floatingWidgetId && dispatch({
              type: "FLOATING_WIDGET_SET_ANIMATE_TRANSITION",
              id: floatingWidgetId,
              animateTransition: true,
            });
          // istanbul ignore next
          } else {
            floatingWidgetId && dispatch({
              type: "FLOATING_WIDGET_BRING_TO_FRONT",
              id: floatingWidgetId,
            });
          }
        };
        const element = elementRef.current!;
        element.addEventListener("click", listener);
        return () => {
          element.removeEventListener("click", listener);
        };
      }, [dispatch, floatingWidgetId]);
      const measure = React.useCallback<WidgetContextArgs["measure"]>(() => {
        const bounds = elementRef.current!.getBoundingClientRect();
        return bounds;
      }, []);
      const widgetContextValue = React.useMemo<WidgetContextArgs>(() => ({
        measure,
      }), [measure]);
      React.useImperativeHandle(ref, () => ({
        measure,
      }), [measure]);
      const className = classnames(
        "nz-widget-widget",
        props.className,
      );
      return (
        <WidgetContext.Provider value={widgetContextValue}>
          <div
            className={className}
            onTransitionEnd={props.onTransitionEnd}
            ref={elementRef}
            style={props.style}
          >
            {props.children}
          </div>
        </WidgetContext.Provider>
      );
    }),
);

/** @internal */
export const WidgetIdContext = React.createContext<WidgetState["id"]>(null!); // eslint-disable-line @typescript-eslint/naming-convention
WidgetIdContext.displayName = "nz:WidgetIdContext";

/** @internal */
export const WidgetStateContext = React.createContext<WidgetState | undefined>(undefined); // eslint-disable-line @typescript-eslint/naming-convention
WidgetStateContext.displayName = "nz:WidgetStateContext";

/** @internal */
export const ActiveTabIdContext = React.createContext<WidgetState["activeTabId"]>(null!); // eslint-disable-line @typescript-eslint/naming-convention
ActiveTabIdContext.displayName = "nz:ActiveTabIdContext";

/** @internal */
export interface WidgetContextArgs {
  measure: () => SizeProps;
}

/** @internal */
export const WidgetContext = React.createContext<WidgetContextArgs>(null!); // eslint-disable-line @typescript-eslint/naming-convention
WidgetContext.displayName = "nz:WidgetContext";

const minWidth = 200;
const minHeight = 200;

/** @internal */
export function restrainInitialWidgetSize(size: SizeProps, nzSize: SizeProps): SizeProps {
  const width = Math.max(Math.min(nzSize.width / 3, size.width), minWidth);
  const height = Math.max(Math.min(nzSize.height / 3, size.height), minHeight);
  return {
    width,
    height,
  };
}

/** @internal */
export function useActiveTab(): TabState | undefined {
  const widget = React.useContext(WidgetStateContext);
  const tabs = React.useContext(TabsStateContext);
  assert(!!widget);
  const tabId = widget.activeTabId;
  return tabs[tabId];
}
