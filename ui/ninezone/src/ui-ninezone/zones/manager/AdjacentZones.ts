/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import { getZoneCell, WidgetZoneId, ZonesManager, ZonesManagerProps } from "./Zones";

/** @internal */
export abstract class AdjacentZonesStrategy {
  public abstract getInitial(zoneId: WidgetZoneId, isInFooterMode: boolean): WidgetZoneId | undefined;

  public constructor(public readonly manager: ZonesManager) {
  }

  public getSingleMergedZone(isMergedVertically: boolean) {
    return isMergedVertically;
  }

  public reduceToFirstZone() {
    return true;
  }

  public getCurrent(zoneId: WidgetZoneId, props: ZonesManagerProps): WidgetZoneId[] {
    const zone = props.zones[zoneId];
    const widgets = zone.widgets;
    if (widgets.length > 1) {
      const cell0 = getZoneCell(widgets[0]);
      const cell1 = getZoneCell(widgets[1]);
      const isMergedVertically = cell0.isColumnAlignedWith(cell1);
      if (this.getSingleMergedZone(isMergedVertically)) {
        const reduceToFirst = this.reduceToFirstZone();
        const singleZone = reduceToFirst ? Math.min(...widgets) as WidgetZoneId : Math.max(...widgets) as WidgetZoneId;
        const initial = this.getInitial(singleZone, props.isInFooterMode);
        return initial === undefined ? [] : [initial];
      }
      return widgets.reduce((prev: WidgetZoneId[], current) => {
        const initial = this.getInitial(current, props.isInFooterMode);
        if (initial)
          prev.push(initial);
        return prev;
      }, []);
    }

    const initialZone = this.getInitial(zoneId, props.isInFooterMode);
    if (!initialZone)
      return [];

    const mergedTo = this.manager.findZoneWithWidget(initialZone, props);
    if (zone.widgets.length === 1 && zone.widgets[0] === zone.id && props.zones[initialZone].widgets.length === 0 && mergedTo) {
      return [mergedTo.id];
    }

    return [initialZone];
  }
}

/** @internal */
export class LeftZones extends AdjacentZonesStrategy {
  public override getSingleMergedZone(isMergedVertically: boolean): boolean {
    return !isMergedVertically;
  }

  public getInitial(zoneId: WidgetZoneId, isInFooterMode: boolean): WidgetZoneId | undefined {
    switch (zoneId) {
      case 2:
        return 1;
      case 3:
        return 2;
      case 8:
        if (isInFooterMode)
          return undefined;
        return 7;
      case 9:
        if (isInFooterMode)
          return undefined;
        return 8;
    }
    return undefined;
  }
}

/** @internal */
export class RightZones extends AdjacentZonesStrategy {
  public override getSingleMergedZone(isMergedVertically: boolean): boolean {
    return !isMergedVertically;
  }

  public override reduceToFirstZone(): boolean {
    return false;
  }

  public getInitial(zoneId: WidgetZoneId, isInFooterMode: boolean): WidgetZoneId | undefined {
    switch (zoneId) {
      case 1:
        return 2;
      case 2:
        return 3;
      case 7:
        if (isInFooterMode)
          return undefined;
        return 8;
      case 8:
        if (isInFooterMode)
          return undefined;
        return 9;
    }
    return undefined;
  }
}

/** @internal */
export class TopZones extends AdjacentZonesStrategy {
  public getInitial(zoneId: WidgetZoneId): WidgetZoneId | undefined {
    switch (zoneId) {
      case 4:
        return 1;
      case 6:
        return 3;
      case 7:
        return 4;
      case 9:
        return 6;
    }
    return undefined;
  }
}

/** @internal */
export class BottomZones extends AdjacentZonesStrategy {
  public override reduceToFirstZone(): boolean {
    return false;
  }

  public getInitial(zoneId: WidgetZoneId): WidgetZoneId | undefined {
    switch (zoneId) {
      case 1:
        return 4;
      case 3:
        return 6;
      case 4:
        return 7;
      case 6:
        return 9;
    }
    return undefined;
  }
}
