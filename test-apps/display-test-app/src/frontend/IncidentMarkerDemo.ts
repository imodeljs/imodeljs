/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Logger } from "@bentley/bentleyjs-core";
import { AngleSweep, Arc3d, Point2d, Point3d, XAndY, XYAndZ } from "@bentley/geometry-core";
import { AxisAlignedBox3d, ColorByName, ColorDef } from "@bentley/imodeljs-common";
import {
  BeButton, BeButtonEvent, Cluster, DecorateContext, GraphicType, imageElementFromUrl, IModelApp, Marker, MarkerImage, MarkerSet, MessageBoxIconType,
  MessageBoxType, Tool,
} from "@bentley/imodeljs-frontend";

// cspell:ignore lerp

/** Example Marker to show an *incident*. Each incident has an *id*, a *severity*, and an *icon*. */
class IncidentMarker extends Marker {
  private static _size = Point2d.create(30, 30);
  private static _imageSize = Point2d.create(40, 40);
  private static _imageOffset = Point2d.create(0, 30);
  private static _amber = ColorDef.create(ColorByName.amber);
  private static _sweep360 = AngleSweep.create360();
  private _color: ColorDef;

  /** uncomment the next line to make the icon only show when the cursor is over an incident marker. */
  // public get wantImage() { return this._isHilited; }

  /** Get a color based on severity by interpolating Green(0) -> Amber(15) -> Red(30)  */
  public static makeColor(severity: number): ColorDef {
    return (severity <= 16 ? ColorDef.green.lerp(this._amber, (severity - 1) / 15.) :
      this._amber.lerp(ColorDef.red, (severity - 16) / 14.));
  }

  // when someone clicks on our marker, open a message box with the severity of the incident.
  public override onMouseButton(ev: BeButtonEvent): boolean {
    if (ev.button === BeButton.Data && ev.isDown)
      IModelApp.notifications.openMessageBox(MessageBoxType.LargeOk, `severity = ${this.severity}`, MessageBoxIconType.Information); // eslint-disable-line @typescript-eslint/no-floating-promises
    return true;
  }

  /** Create a new IncidentMarker */
  constructor(location: XYAndZ, public severity: number, public id: number, icon: HTMLImageElement) {
    super(location, IncidentMarker._size);
    this._color = IncidentMarker.makeColor(severity); // color interpolated from severity
    this.setImage(icon); // save icon
    this.imageOffset = IncidentMarker._imageOffset; // move icon up by 30 pixels so the bottom of the flag is at the incident location in the view.
    this.imageSize = IncidentMarker._imageSize; // 40x40
    this.title = `Severity: ${severity}<br>Id: ${id}`; // tooltip
    this.setScaleFactor({ low: .2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
    this.label = id.toString();
  }

  /**
   * For this demo, add a WorldDecoration that draws a circle with a radius of 200cm centered at the incident location.
   * WorldDecorations are in world coordinates, so the circle will change size as you zoom in/out. Also, they are drawn with the z-buffer enabled, so
   * the circle may be obscured by other geometry in front of in the view. This can help the user understand the point that the marker relates to,
   * but that effect isn't always desireable.
   *
   * World decorations for markers are completely optional. If you don't want anything drawn with WorldDecorations, don't follow this example.
   *
   */
  public override addMarker(context: DecorateContext) {
    super.addMarker(context);
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const ellipse = Arc3d.createScaledXYColumns(this.worldLocation, context.viewport.rotation.transpose(), .2, .2, IncidentMarker._sweep360);
    // draw the circle the color of the marker, but with some transparency.
    let color = this._color;
    builder.setSymbology(ColorDef.white, color, 1);
    color = color.withTransparency(200);
    builder.addArc(ellipse, false, false);
    builder.setBlankingFill(color);
    builder.addArc(ellipse, true, true);
    context.addDecorationFromBuilder(builder);
  }
}

/** A Marker used to show a cluster of incidents */
class IncidentClusterMarker extends Marker {
  private _clusterColor: string;
  // public get wantImage() { return this._isHilited; }

  // draw the cluster as a white circle with an outline color based on what's in the cluster
  public override drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = this._clusterColor;
    ctx.fillStyle = "white";
    ctx.lineWidth = 5;
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Create a new cluster marker with label and color based on the content of the cluster */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<IncidentMarker>, image: Promise<MarkerImage>) {
    super(location, size);

    // get the top 10 incidents by severity
    const sorted: IncidentMarker[] = [];
    const maxLen = 10;
    cluster.markers.forEach((marker) => {
      if (maxLen > sorted.length || marker.severity > sorted[sorted.length - 1].severity) {
        const index = sorted.findIndex((val) => val.severity < marker.severity);
        if (index === -1)
          sorted.push(marker);
        else
          sorted.splice(index, 0, marker);
        if (sorted.length > maxLen)
          sorted.length = maxLen;
      }
    });

    this.imageOffset = new Point3d(0, 28);
    this.imageSize = new Point2d(30, 30);
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = "black";
    this.labelFont = "bold 14px sans-serif";

    let title = "";
    sorted.forEach((marker) => {
      if (title !== "")
        title += "<br>";
      title += `Severity: ${marker.severity} Id: ${marker.id}`;
    });
    if (cluster.markers.length > maxLen)
      title += "<br>...";

    const div = document.createElement("div"); // Use HTML as markup isn't supported for string.
    div.innerHTML = title;
    this.title = div;
    this._clusterColor = IncidentMarker.makeColor(sorted[0].severity).toHexString();
    this.setImage(image);
  }
}

/** A MarkerSet to hold incidents. This class supplies to `getClusterMarker` method to create IncidentClusterMarkers. */
class IncidentMarkerSet extends MarkerSet<IncidentMarker> {
  protected getClusterMarker(cluster: Cluster<IncidentMarker>): Marker {
    return IncidentClusterMarker.makeFrom(cluster.markers[0], cluster, IncidentMarkerDemo.decorator!.warningSign);
  }
}

/** This demo shows how to use MarkerSets to cluster markers that overlap on the screen. It creates a set of 500
 * "incidents" at random locations within the ProjectExtents. For each incident, it creates an IncidentMarker with an Id and
 * with a random value between 1-30 for "severity", and one of 5 possible icons.
 */
export class IncidentMarkerDemo {
  private _awaiting = false;
  private _loading?: Promise<any>;
  private _images: Array<HTMLImageElement | undefined> = [];
  public readonly incidents = new IncidentMarkerSet();
  private static _numMarkers = 500;
  public static decorator?: IncidentMarkerDemo; // static variable so we can tell if the demo is active.

  public get warningSign() { return this._images[0]; }

  // Load one image, logging if there was an error
  private async loadOne(src: string) {
    try {
      return await imageElementFromUrl(src); // note: "return await" is necessary inside try/catch
    } catch (err) {
      const msg = `Could not load image ${src}`;
      Logger.logError("IncidentDemo", msg);
      console.log(msg); // eslint-disable-line no-console
    }
    return undefined;
  }

  // load all images. After they're loaded, make the incident markers.
  // If there will be a lot of markers displayed, it's best to draw images without scaling.
  // The Warning_sign.svg used in this example is quite large and is always being scaled down.
  private async loadAll(extents: AxisAlignedBox3d) {
    const loads = [
      this.loadOne("Warning_sign.svg"), // must be first, see "get warningSign()" above
      this.loadOne("Hazard_biological.svg"),
      this.loadOne("Hazard_electric.svg"),
      this.loadOne("Hazard_flammable.svg"),
      this.loadOne("Hazard_toxic.svg"),
      this.loadOne("Hazard_tripping.svg"),
    ];
    await (this._loading = Promise.all(loads)); // this is a member so we can tell if we're still loading
    for (const img of loads)
      this._images.push(await img);

    const len = this._images.length;
    const pos = new Point3d();
    for (let i = 0; i < IncidentMarkerDemo._numMarkers; ++i) {
      pos.x = extents.low.x + (Math.random() * extents.xLength());
      pos.y = extents.low.y + (Math.random() * extents.yLength());
      pos.z = extents.low.z + (Math.random() * extents.zLength());
      const img = this._images[(i % len) + 1];
      if (undefined !== img)
        this.incidents.markers.add(new IncidentMarker(pos, 1 + Math.round(Math.random() * 29), i, img));
    }
    this._loading = undefined;
  }

  public constructor(extents: AxisAlignedBox3d) {
    this.loadAll(extents); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext) {
    if (!context.viewport.view.isSpatialView())
      return;

    if (undefined === this._loading) {
      this.incidents.addDecoration(context);
      return;
    }

    // if we're still loading, just mark this viewport as needing decorations when all loads are complete
    if (!this._awaiting) {
      this._awaiting = true;
      this._loading.then(() => {
        context.viewport.invalidateCachedDecorations(this);
        this._awaiting = false;
      }).catch(() => undefined);
    }
  }

  /** start the demo by creating the IncidentMarkerDemo object and adding it as a ViewManager decorator. */
  private static start(extents: AxisAlignedBox3d) {
    IncidentMarkerDemo.decorator = new IncidentMarkerDemo(extents);
    IModelApp.viewManager.addDecorator(IncidentMarkerDemo.decorator);

    // hook the event for viewport changing and stop the demo. This is called when the view is closed too. */
    IncidentMarkerDemo.decorator.incidents.viewport!.onChangeView.addOnce(() => this.stop());
  }

  /** stop the demo */
  private static stop() {
    if (IncidentMarkerDemo.decorator)
      IModelApp.viewManager.dropDecorator(IncidentMarkerDemo.decorator);
    IncidentMarkerDemo.decorator = undefined;
  }

  /** Turn the markers on and off. Each time it runs it creates a new random set of incidents. */
  public static toggle(extents: AxisAlignedBox3d) {
    if (undefined === IncidentMarkerDemo.decorator)
      this.start(extents);
    else
      this.stop();
  }
}

export class IncidentMarkerDemoTool extends Tool {
  public static override toolId = "ToggleIncidentMarkers";
  public override run(_args: any[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp && vp.view.isSpatialView())
      IncidentMarkerDemo.toggle(vp.view.iModel.projectExtents);

    return true;
  }
}
