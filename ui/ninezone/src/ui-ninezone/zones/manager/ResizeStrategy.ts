/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Zone
 */

import { Rectangle, RectangleProps } from "@bentley/ui-core";
import { HorizontalAnchor } from "../../widget/Stacked";
import { WidgetZoneId, ZonesManager, ZonesManagerProps } from "./Zones";

/** @internal */
export const RECTANGULAR_DEFAULT_MIN_HEIGHT = 220;
/** @internal */
export const RECTANGULAR_DEFAULT_MIN_WIDTH = 296;

/** @internal */
export interface ResizeStrategy {
  getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps): number;
  tryResize(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps): ZonesManagerProps;
  tryResizeFloating(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps): ZonesManagerProps;
}

/** @internal */
export abstract class GrowStrategy implements ResizeStrategy {
  public abstract getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps): WidgetZoneId[];
  public abstract getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps): number;
  public abstract getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps): number;
  public abstract getShrinkStrategy(): ResizeStrategy;
  public abstract resize(bounds: RectangleProps, growBy: number): RectangleProps;

  public getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps): number {
    if (!this.manager.isResizable(zoneId))
      return 0;

    const zone = props.zones[zoneId];
    const zonesToShrink = this.getZonesToShrink(zoneId, props);
    if (zonesToShrink.length === 0) {
      return this.getDistanceToRoot(zone.bounds, props.zonesBounds);
    }

    return zonesToShrink.reduce((min, zoneToShrinkId) => {
      const distance = this.getDistanceToZoneToShrink(zoneId, zoneToShrinkId, props);
      const shrinkStrategy = this.getShrinkStrategy();
      const shrinkBy = shrinkStrategy.getMaxResize(zoneToShrinkId, props);
      const total = distance + shrinkBy;
      return Math.min(min, total);
    }, Number.MAX_SAFE_INTEGER);
  }

  public tryResize(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps) {
    const zone = props.zones[zoneId];
    const maxResize = this.getMaxResize(zoneId, props);
    const growBy = Math.min(resizeBy, maxResize);
    if (growBy === 0)
      return props;

    const zonesToShrink = this.getZonesToShrink(zoneId, props);
    zonesToShrink.forEach((zoneToShrink) => {
      const distance = this.getDistanceToZoneToShrink(zoneId, zoneToShrink, props);
      const shrinkBy = Math.max(0, growBy - distance);
      const shrinkStrategy = this.getShrinkStrategy();
      props = shrinkStrategy.tryResize(zoneToShrink, shrinkBy, props);
    });

    const bounds = this.resize(zone.bounds, growBy);
    props = {
      ...props,
      zones: {
        ...props.zones,
        [zoneId]: {
          ...props.zones[zoneId],
          bounds,
        },
      },
    };
    return props;
  }

  public tryResizeFloating(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps) {
    const zone = props.zones[zoneId];
    if (!zone.floating)
      throw new ReferenceError();

    const distanceToRoot = this.getDistanceToRoot(zone.floating.bounds, props.zonesBounds);
    const growBy = Math.min(resizeBy, distanceToRoot);

    const bounds = this.resize(zone.floating.bounds, growBy);
    return this.manager.setZoneFloatingBounds(zoneId, bounds, props);
  }

  public constructor(public readonly manager: ZonesManager) {
  }
}

/** @internal */
export class GrowTop extends GrowStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.topZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps) {
    return bounds.top;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId];
    const zone = props.zones[zoneId];
    return zone.bounds.top - zoneToShrink.bounds.bottom;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkBottom;
  }

  public resize(bounds: RectangleProps, growBy: number) {
    return Rectangle.create(bounds).inset(0, -growBy, 0, 0).toProps();
  }
}

/** @internal */
export class GrowBottom extends GrowStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.bottomZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps) {
    const root = Rectangle.createFromSize(Rectangle.create(zonesBounds).getSize());
    return root.bottom - bounds.bottom;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId];
    const zone = props.zones[zoneId];
    return zoneToShrink.bounds.top - zone.bounds.bottom;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkTop;
  }

  public resize(bounds: RectangleProps, growBy: number) {
    return Rectangle.create(bounds).inset(0, 0, 0, -growBy).toProps();
  }
}

/** @internal */
export class GrowLeft extends GrowStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.leftZones.getCurrent(zoneId, props);
  }

  public override getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    let maxResize = super.getMaxResize(zoneId, props);
    const zone = props.zones[zoneId];
    const widget = props.widgets[zoneId];
    if (!zone.floating && widget.horizontalAnchor === HorizontalAnchor.Right) {
      const initialBounds = this.manager.getInitialBounds(zoneId, props);
      const distanceToInitial = zone.bounds.left - initialBounds.left;
      maxResize = Math.min(distanceToInitial, maxResize);
    }
    return maxResize;
  }

  public getDistanceToRoot(bounds: RectangleProps) {
    return bounds.left;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId];
    const zone = props.zones[zoneId];
    return zone.bounds.left - zoneToShrink.bounds.right;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkRight;
  }

  public resize(bounds: RectangleProps, growBy: number) {
    return Rectangle.create(bounds).inset(-growBy, 0, 0, 0).toProps();
  }
}

/** @internal */
export class GrowRight extends GrowStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.rightZones.getCurrent(zoneId, props);
  }

  public override getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    let maxResize = super.getMaxResize(zoneId, props);
    const zone = props.zones[zoneId];
    const widget = props.widgets[zoneId];
    if (!zone.floating && widget.horizontalAnchor === HorizontalAnchor.Left) {
      const initialBounds = this.manager.getInitialBounds(zoneId, props);
      const distanceToInitial = initialBounds.right - zone.bounds.right;
      maxResize = Math.min(distanceToInitial, maxResize);
    }
    return maxResize;
  }

  public getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps) {
    const root = Rectangle.createFromSize(Rectangle.create(zonesBounds).getSize());
    return root.right - bounds.right;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId];
    const zone = props.zones[zoneId];
    return zoneToShrink.bounds.left - zone.bounds.right;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkLeft;
  }

  public resize(bounds: RectangleProps, growBy: number) {
    return Rectangle.create(bounds).inset(0, 0, -growBy, 0).toProps();
  }
}

/** @internal */
export abstract class ShrinkStrategy implements ResizeStrategy {
  public abstract getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps): number;
  public abstract getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps): number;
  public abstract getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps): WidgetZoneId[];
  public abstract getShrinkStrategy(): ResizeStrategy;
  public abstract getMinSize(): number;
  public abstract getCurrentSize(bounds: RectangleProps): number;
  public abstract resize(bounds: RectangleProps, shrinkBy: number, moveBy: number): RectangleProps;

  public constructor(public readonly manager: ZonesManager) {
  }

  public getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps): number {
    if (!this.manager.isResizable(zoneId))
      return 0;

    const zone = props.zones[zoneId];
    const maxShrinkSelfBy = this.getMaxShrinkSelfBy(zone.bounds);
    const zonesToShrink = this.getZonesToShrink(zoneId, props);
    if (zonesToShrink.length === 0) {
      const distanceToRoot = this.getDistanceToRoot(zone.bounds, props.zonesBounds);
      return maxShrinkSelfBy + distanceToRoot;
    }

    return zonesToShrink.reduce((min, zoneToShrinkId) => {
      const distance = this.getDistanceToZoneToShrink(zoneId, zoneToShrinkId, props);
      const shrinkStrategy = this.getShrinkStrategy();
      const shrinkBy = shrinkStrategy.getMaxResize(zoneToShrinkId, props);
      const total = distance + shrinkBy + maxShrinkSelfBy;
      return Math.min(min, total);
    }, Number.MAX_SAFE_INTEGER);
  }

  public tryResize(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps) {
    const zone = props.zones[zoneId];
    const maxResize = this.getMaxResize(zoneId, props);
    resizeBy = Math.min(resizeBy, maxResize);
    if (resizeBy === 0)
      return props;

    const maxShrinkSelfBy = this.getMaxShrinkSelfBy(zone.bounds);
    const shrinkSelfBy = Math.min(maxShrinkSelfBy, resizeBy);
    const zonesToShrink = this.getZonesToShrink(zoneId, props);
    zonesToShrink.forEach((zoneToShrink) => {
      const distance = this.getDistanceToZoneToShrink(zoneId, zoneToShrink, props);
      const moveSelfBy = Math.max(0, Math.min(resizeBy - shrinkSelfBy, distance));
      const shrinkBy = Math.max(0, resizeBy - shrinkSelfBy - moveSelfBy);
      const shrinkStrategy = this.getShrinkStrategy();
      props = shrinkStrategy.tryResize(zoneToShrink, shrinkBy, props);
    });

    const bounds = this.resize(zone.bounds, shrinkSelfBy, resizeBy - shrinkSelfBy);
    props = {
      ...props,
      zones: {
        ...props.zones,
        [zoneId]: {
          ...props.zones[zoneId],
          bounds,
        },
      },
    };
    return props;
  }

  public tryResizeFloating(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps) {
    const zone = props.zones[zoneId];
    if (!zone.floating)
      throw new ReferenceError();

    const maxShrinkSelfBy = this.getMaxShrinkSelfBy(zone.floating.bounds);
    const shrinkSelfBy = Math.min(resizeBy, maxShrinkSelfBy);

    const bounds = this.resize(zone.floating.bounds, shrinkSelfBy, 0);
    return {
      ...props,
      zones: {
        ...props.zones,
        [zoneId]: {
          ...props.zones[zoneId],
          floating: {
            ...props.zones[zoneId].floating,
            bounds,
          },
        },
      },
    };
  }

  public getMaxShrinkSelfBy(bounds: RectangleProps): number {
    const minSize = this.getMinSize();
    const currentSize = this.getCurrentSize(bounds);
    const shrinkSelfBy = Math.max(0, currentSize - minSize);
    return shrinkSelfBy;
  }
}

/** @internal */
export abstract class ShrinkVerticalStrategy extends ShrinkStrategy {
  public getMinSize(): number {
    return RECTANGULAR_DEFAULT_MIN_HEIGHT;
  }

  public getCurrentSize(bounds: RectangleProps): number {
    return Rectangle.create(bounds).getHeight();
  }
}

/** @internal */
export abstract class ShrinkHorizontalStrategy extends ShrinkStrategy {
  public getMinSize(): number {
    return RECTANGULAR_DEFAULT_MIN_WIDTH;
  }

  public getCurrentSize(bounds: RectangleProps): number {
    return Rectangle.create(bounds).getWidth();
  }
}

/** @internal */
export class ShrinkTop extends ShrinkVerticalStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.bottomZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps) {
    const root = Rectangle.createFromSize(Rectangle.create(zonesBounds).getSize());
    return root.bottom - bounds.bottom;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId].bounds;
    const zone = props.zones[zoneId].bounds;
    return zoneToShrink.top - zone.bottom;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkTop;
  }

  public resize(bounds: RectangleProps, shrinkBy: number, moveBy: number) {
    const shrunk = Rectangle.create(bounds).inset(0, shrinkBy, 0, 0);
    return shrunk.offsetY(moveBy).toProps();
  }
}

/** @internal */
export class ShrinkBottom extends ShrinkVerticalStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.topZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps) {
    return bounds.top;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId].bounds;
    const zone = props.zones[zoneId].bounds;
    return zone.top - zoneToShrink.bottom;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkBottom;
  }

  public resize(bounds: RectangleProps, shrinkBy: number, moveBy: number) {
    const shrunk = Rectangle.create(bounds).inset(0, 0, 0, shrinkBy);
    return shrunk.offsetY(-moveBy).toProps();
  }
}

/** @internal */
export class ShrinkLeft extends ShrinkHorizontalStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.rightZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps, zonesBounds: RectangleProps) {
    const root = Rectangle.createFromSize(Rectangle.create(zonesBounds).getSize());
    return root.right - bounds.right;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId].bounds;
    const zone = props.zones[zoneId].bounds;
    return zoneToShrink.left - zone.right;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkLeft;
  }

  public resize(bounds: RectangleProps, shrinkBy: number, moveBy: number) {
    const shrunk = Rectangle.create(bounds).inset(shrinkBy, 0, 0, 0);
    return shrunk.offsetX(moveBy).toProps();
  }
}

/** @internal */
export class ShrinkRight extends ShrinkHorizontalStrategy {
  public getZonesToShrink(zoneId: WidgetZoneId, props: ZonesManagerProps) {
    return this.manager.leftZones.getCurrent(zoneId, props);
  }

  public getDistanceToRoot(bounds: RectangleProps) {
    return bounds.left;
  }

  public getDistanceToZoneToShrink(zoneId: WidgetZoneId, zoneToShrinkId: WidgetZoneId, props: ZonesManagerProps) {
    const zoneToShrink = props.zones[zoneToShrinkId].bounds;
    const zone = props.zones[zoneId].bounds;
    return zone.left - zoneToShrink.right;
  }

  public getShrinkStrategy() {
    return this.manager.shrinkRight;
  }

  public resize(bounds: RectangleProps, shrinkBy: number, moveBy: number) {
    const shrunk = Rectangle.create(bounds).inset(0, 0, shrinkBy, 0);
    return shrunk.offsetX(-moveBy).toProps();
  }
}

/** @internal */
export class UpdateWindowResizeSettings implements ResizeStrategy {
  public constructor(
    public readonly manager: ZonesManager,
    public readonly resizeStrategy: ResizeStrategy,
  ) {
  }

  public getMaxResize(zoneId: WidgetZoneId, props: ZonesManagerProps): number {
    return this.resizeStrategy.getMaxResize(zoneId, props);
  }
  public tryResizeFloating(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps): ZonesManagerProps {
    return this.resizeStrategy.tryResizeFloating(zoneId, resizeBy, props);
  }

  public tryResize(zoneId: WidgetZoneId, resizeBy: number, props: ZonesManagerProps) {
    props = this.resizeStrategy.tryResize(zoneId, resizeBy, props);

    const manager = this.manager.getZoneManager(zoneId);
    const zonesBoundsRect = Rectangle.create(props.zonesBounds);
    const bounds = Rectangle.create(props.zones[zoneId].bounds);
    const width = Math.floor(bounds.getWidth());
    if (width <= manager.windowResize.minWidth) {
      manager.windowResize.hMode = "Minimum";
    } else {
      manager.windowResize.hMode = "Percentage";
    }
    const zonesWidth = zonesBoundsRect.getWidth();
    manager.windowResize.hStart = bounds.left / zonesWidth;
    manager.windowResize.hEnd = bounds.right / zonesWidth;

    const height = Math.floor(bounds.getHeight());
    if (height <= manager.windowResize.minHeight) {
      manager.windowResize.vMode = "Minimum";
    } else {
      manager.windowResize.vMode = "Percentage";
    }
    const zonesHeight = zonesBoundsRect.getHeight();
    manager.windowResize.vStart = bounds.top / zonesHeight;
    manager.windowResize.vEnd = bounds.bottom / zonesHeight;

    return props;
  }
}
