/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Hooks
 */

import { useEffect, useState } from "react";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { SessionStateActionId } from "../redux/SessionState";
import { SyncUiEventArgs, SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";

/** React hook that maintains the active IModelConnection. For this hook to work properly the
 * IModelConnection must be set using UiFramework.setIModelConnection method. This also requires
 * that the host app includes the UiFramework reducer into its Redux store.
 * @public
 */
export function useActiveIModelConnection(): IModelConnection | undefined {
  const [activeConnection, setActiveConnection] = useState(UiFramework.getIModelConnection());
  useEffect(() => {
    const handleSyncUiEvent = (args: SyncUiEventArgs): void => {
      const eventIds = [SessionStateActionId.SetIModelConnection];
      // istanbul ignore else
      if (eventIds.some((value: string): boolean => args.eventIds.has(value.toLowerCase()))) {
        setActiveConnection(UiFramework.getIModelConnection());
      }
    };

    SyncUiEventDispatcher.onSyncUiEvent.addListener(handleSyncUiEvent);
    return () => {
      SyncUiEventDispatcher.onSyncUiEvent.removeListener(handleSyncUiEvent);
    };
  }, [activeConnection]);

  return activeConnection;
}
