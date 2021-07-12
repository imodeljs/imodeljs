/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StagePanels
 */

import {
  NestedStagePanelKey, NestedStagePanelsId, NestedStagePanelsManager, NestedStagePanelsManagerProps,
} from "../stage-panels/manager/NestedStagePanels";
import { WidgetZoneId } from "../zones/manager/Zones";
import { NineZoneStagePanelsManager, NineZoneStagePanelsManagerProps } from "./StagePanels";

/** Properties used by [[NineZoneNestedStagePanelsManager]].
 * @alpha
 */
export interface NineZoneNestedStagePanelsManagerProps extends NestedStagePanelsManagerProps {
  readonly panels: { readonly [id: string]: NineZoneStagePanelsManagerProps };
}

/** Class used to manage [[NineZoneNestedStagePanelsManagerProps]].
 * @alpha
 */
export class NineZoneNestedStagePanelsManager extends NestedStagePanelsManager {
  private _nzManagers?: Map<string | number, NineZoneStagePanelsManager>;

  public addWidget<TProps extends NineZoneNestedStagePanelsManagerProps>(widget: WidgetZoneId, panel: NestedStagePanelKey<TProps>, paneIndex: number | undefined, props: TProps): TProps {
    const panels = props.panels[panel.id];
    const manager = this.getPanelsManager(panel.id);
    const updatedPanels = manager.addWidget(widget, panel.type, paneIndex, panels);
    if (panels === updatedPanels)
      return props;

    return {
      ...props,
      panels: {
        ...props.panels,
        [panel.id]: updatedPanels,
      },
    };
  }

  public removeWidget<TProps extends NineZoneNestedStagePanelsManagerProps>(widget: WidgetZoneId, panel: NestedStagePanelKey<TProps>, props: TProps): TProps {
    const panels = props.panels[panel.id];
    const manager = this.getPanelsManager(panel.id);
    const updatedPanels = manager.removeWidget(widget, panel.type, panels);
    if (panels === updatedPanels)
      return props;

    return {
      ...props,
      panels: {
        ...props.panels,
        [panel.id]: updatedPanels,
      },
    };
  }

  public override getPanelsManager<TProps extends NestedStagePanelsManagerProps>(id: NestedStagePanelsId<TProps>): NineZoneStagePanelsManager {
    if (!this._nzManagers)
      this._nzManagers = new Map();
    let manager = this._nzManagers.get(id);
    if (!manager) {
      manager = new NineZoneStagePanelsManager();
      this._nzManagers.set(id, manager);
    }
    return manager;
  }
}
