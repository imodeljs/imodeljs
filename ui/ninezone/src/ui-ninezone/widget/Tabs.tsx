/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Tabs.scss";
import * as React from "react";
import { useResizeObserver } from "@bentley/ui-core";
import { assert } from "@bentley/bentleyjs-core";
import { TabsStateContext } from "../base/NineZone";
import { getChildKey, useOverflow } from "../tool-settings/Docked";
import { isHorizontalPanelSide, PanelSideContext } from "../widget-panels/Panel";
import { WidgetOverflow } from "./Overflow";
import { WidgetTabProvider } from "./Tab";
import { WidgetTabTarget } from "./TabTarget";
import { WidgetStateContext } from "./Widget";

/** @internal */
export const WidgetTabs = React.memo(function WidgetTabs() { // eslint-disable-line @typescript-eslint/naming-convention, no-shadow
  const tabs = React.useContext(TabsStateContext);
  const side = React.useContext(PanelSideContext);
  const widget = React.useContext(WidgetStateContext);
  assert(!!widget);
  const activeTabIndex = widget.tabs.indexOf(widget.activeTabId);
  const children = React.useMemo<React.ReactNode>(() => {
    return widget.tabs.map((tabId, index, array) => {
      const firstInactive = activeTabIndex + 1 === index;
      const tabState = tabs[tabId];
      // istanbul ignore next
      if (!tabState)
        return null;

      return (
        <React.Fragment
          key={tabId}
        >
          {index === 0 && <WidgetTabTarget
            tabIndex={index}
            first
          />}
          <WidgetTabProvider
            first={index === 0}
            firstInactive={firstInactive}
            last={index === array.length - 1}
            tab={tabs[tabId]}
          />
          <WidgetTabTarget
            tabIndex={index}
          />
        </React.Fragment>
      );
    });
  }, [widget, tabs, activeTabIndex]);
  const [overflown, handleResize, handleOverflowResize, handleEntryResize] = useOverflow(children, activeTabIndex);
  const horizontal = side && isHorizontalPanelSide(side);
  const ref = useResizeObserver(handleResize);
  const childrenArray = React.useMemo(() => React.Children.toArray(children), [children]);
  const tabChildren = childrenArray.reduce<Array<[string, React.ReactNode]>>((acc, child, index) => {
    const key = getChildKey(child, index);
    if (!overflown) {
      acc.push([key, child]);
      return acc;
    }
    if (horizontal && widget.minimized)
      return acc;
    overflown.indexOf(key) < 0 && acc.push([key, child]);
    return acc;
  }, []);
  const panelChildren = tabChildren.length !== childrenArray.length ? childrenArray.map<[string, React.ReactNode]>((child, index) => {
    const key = getChildKey(child, index);
    return [key, child];
  }) : [];
  return (
    <div
      className="nz-widget-tabs"
      ref={ref}
      role="tablist"
    >
      {tabChildren.map(([key, child], index, array) => {
        return (
          <WidgetTabsEntryProvider
            children={child} // eslint-disable-line react/no-children-prop
            key={key}
            id={key}
            lastNotOverflown={index === array.length - 1 && panelChildren.length > 0}
            getOnResize={handleEntryResize}
          />
        );
      })}
      <WidgetOverflow
        hidden={overflown && panelChildren.length === 0}
        onResize={handleOverflowResize}
      >
        {panelChildren.map(([key, child]) => {
          return (
            <React.Fragment
              key={key}
            >
              {child}
            </React.Fragment>
          );
        })}
      </WidgetOverflow>
    </div>
  );
});

interface WidgetTabsEntryContextArgs {
  readonly lastNotOverflown: boolean;
  readonly onResize?: (w: number) => void;
}

/** @internal */
export const WidgetTabsEntryContext = React.createContext<WidgetTabsEntryContextArgs | undefined>(undefined); // eslint-disable-line @typescript-eslint/naming-convention
WidgetTabsEntryContext.displayName = "nz:WidgetTabsEntryContext";

/** @internal */
export interface WidgetTabsEntryContextProviderProps {
  children?: React.ReactNode;
  id: string;
  getOnResize: (id: string) => (w: number) => void;
  lastNotOverflown: boolean;
}

/** @internal */
export const WidgetTabsEntryProvider = React.memo<WidgetTabsEntryContextProviderProps>(function WidgetTabsEntryProvider(props) { // eslint-disable-line @typescript-eslint/naming-convention, no-shadow
  return (
    <WidgetTabsEntryContext.Provider value={{
      lastNotOverflown: props.lastNotOverflown,
      onResize: props.getOnResize(props.id),
    }}>
      {props.children}
    </WidgetTabsEntryContext.Provider>
  );
});
