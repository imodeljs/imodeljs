/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Hooks
 */

import { useEffect, useState } from "react";
import { IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { ActiveContentChangedEventArgs, ContentViewManager } from "../content/ContentViewManager";

/** React hook that maintains the active viewport.
 * @public
 */
export function useActiveViewport(): ScreenViewport | undefined {
  const [activeViewport, setActiveViewport] = useState(IModelApp.viewManager.selectedView);
  useEffect(() => {
    const onActiveContentChanged = (_args: ActiveContentChangedEventArgs) => {
      setActiveViewport(IModelApp.viewManager.selectedView);
    };

    // IModelApp.viewManager.onSelectedViewportChanged will often fire before UI components have mounted
    // so use ContentViewManager.onActiveContentChangedEvent which will always trigger once all stage components
    // are loaded and when the IModelApp.viewManager.selectedView changes.
    ContentViewManager.onActiveContentChangedEvent.addListener(onActiveContentChanged);
    return () => {
      ContentViewManager.onActiveContentChangedEvent.removeListener(onActiveContentChanged);
    };
  }, []);
  return activeViewport;
}
