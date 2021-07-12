/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Logger } from "@bentley/bentleyjs-core";
import { AngleSweep, Arc3d, Point2d, Point3d, XAndY, XYAndZ } from "@bentley/geometry-core";
import { AxisAlignedBox3d, ColorByName, ColorDef, NpcCenter } from "@bentley/imodeljs-common";
import {
  BeButton, BeButtonEvent, Cluster, DecorateContext, GraphicType, HitDetail, imageElementFromUrl, IModelApp, Marker, MarkerImage, MarkerSet,
  MessageBoxIconType, MessageBoxType,
} from "@bentley/imodeljs-frontend";

// cSpell:ignore lerp

export class ExampleGraphicDecoration {
  // __PUBLISH_EXTRACT_START__ View_Graphic_Decoration
  /** Add a world decoration to display 3d graphics showing the project extents interspersed with the scene graphics. */
  public decorate(context: DecorateContext): void {
    // Check view type, project extents is only applicable to show in spatial views.
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined);
    // Set edge color to white or black depending on current view background color and set line weight to 2.
    builder.setSymbology(vp.getContrastToBackgroundColor(), ColorDef.black, 2);
    // Add range box edge geometry to builder.
    builder.addRangeBox(vp.iModel.projectExtents);
    context.addDecorationFromBuilder(builder);
  }
  // __PUBLISH_EXTRACT_END__
}

export class ExamplePickableGraphicDecoration {
  // __PUBLISH_EXTRACT_START__ Pickable_View_Graphic_Decoration
  protected _decoId?: string;

  /** Add a pickable decoration that will display interspersed with the scene graphics. */
  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    // Get next available Id to represent our decoration for it's life span.
    if (undefined === this._decoId)
      this._decoId = vp.iModel.transientIds.next;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._decoId);
    builder.setSymbology(vp.getContrastToBackgroundColor(), ColorDef.black, 2);
    builder.addRangeBox(vp.iModel.projectExtents);
    context.addDecorationFromBuilder(builder);
  }

  /** Return true if supplied Id represents a pickable decoration created by this decorator. */
  public testDecorationHit(id: string): boolean { return id === this._decoId; }

  /** Return localized tooltip message for the decoration identified by HitDetail.sourceId. */
  public async getDecorationToolTip(_hit: HitDetail): Promise<HTMLElement | string> { return "Project Extents"; }
  // __PUBLISH_EXTRACT_END__
}

export class ExampleCanvasDecoration {
  // __PUBLISH_EXTRACT_START__ Canvas_Decoration
  /** Add a canvas decoration using CanvasRenderingContext2D to show a plus symbol. */
  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    const size = Math.floor(vp.pixelsPerInch * 0.25) + 0.5;
    const sizeOutline = size + 1;
    const position = context.viewport.npcToView(NpcCenter); position.x = Math.floor(position.x) + 0.5; position.y = Math.floor(position.y) + 0.5;
    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      // Show black outline (with shadow) around white line for good visibility regardless of view background color.
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 3;
      ctx.moveTo(-sizeOutline, 0);
      ctx.lineTo(sizeOutline, 0);
      ctx.moveTo(0, -sizeOutline);
      ctx.lineTo(0, sizeOutline);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.shadowColor = "black";
      ctx.shadowBlur = 5;
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size);
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration });
  }
  // __PUBLISH_EXTRACT_END__
}

// __PUBLISH_EXTRACT_START__ MarkerSet_Decoration
/** Example Marker to show an *incident*. Each incident has an *id*, a *severity*, and an *icon*. */
class IncidentMarker extends Marker {
  private static _size = Point2d.create(30, 30);
  private static _imageSize = Point2d.create(40, 40);
  private static _imageOffset = Point2d.create(0, 30);
  private static _amber = ColorDef.create(ColorByName.amber);
  private static _sweep360 = AngleSweep.create360();
  private _color: ColorDef;

  // uncomment the next line to make the icon only show when the cursor is over an incident marker.
  // public get wantImage() { return this._isHilited; }

  /** Get a color based on severity by interpolating Green(0) -> Amber(15) -> Red(30)  */
  public static makeColor(severity: number): ColorDef {
    return (severity <= 16 ? ColorDef.green.lerp(this._amber, (severity - 1) / 15.) :
      this._amber.lerp(ColorDef.red, (severity - 16) / 14.));
  }

  public override onMouseButton(ev: BeButtonEvent): boolean {
    if (ev.button === BeButton.Data) {
      if (ev.isDown) {
        IModelApp.notifications.openMessageBox(MessageBoxType.LargeOk, `severity = ${this.severity}`, MessageBoxIconType.Information); // eslint-disable-line @typescript-eslint/no-floating-promises
      }
    }
    return true;
  }

  /** Create a new IncidentMarker */
  constructor(location: XYAndZ, public severity: number, public id: number, icon: HTMLImageElement) {
    super(location, IncidentMarker._size);
    this._color = IncidentMarker.makeColor(severity); // color interpolated from severity
    this.setImage(icon); // save icon
    this.imageOffset = IncidentMarker._imageOffset; // move icon up by 30 pixels
    this.imageSize = IncidentMarker._imageSize; // 40x40
    this.title = `Severity: ${severity}<br>Id: ${id}`; // tooltip
    this.setScaleFactor({ low: .2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)

    // it would be better to use "this.label" here for a pure text string. We'll do it this way just to show that you can use HTML too
    this.htmlElement = document.createElement("div");
    this.htmlElement.innerHTML = id.toString(); // just put the id of the incident as text
  }

  public override addMarker(context: DecorateContext) {
    super.addMarker(context);
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const ellipse = Arc3d.createScaledXYColumns(this.worldLocation, context.viewport.rotation.transpose(), .2, .2, IncidentMarker._sweep360);
    builder.setSymbology(ColorDef.white, this._color, 1);
    builder.addArc(ellipse, false, false);
    builder.setBlankingFill(this._color);
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

    this.title = title;
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
  private _incidents = new IncidentMarkerSet();
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

  // load all images. After they're loaded, make the incident markers
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
        this._incidents.markers.add(new IncidentMarker(pos, 1 + Math.round(Math.random() * 29), i, img));
    }
    this._loading = undefined;
  }

  public constructor(extents: AxisAlignedBox3d) {
    this.loadAll(extents); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext) {
    if (!context.viewport.view.isSpatialView())
      return;

    if (undefined === this._loading) {
      this._incidents.addDecoration(context);
      return;
    }

    // if we're still loading, just mark this viewport as needing decorations when all loads are complete
    if (!this._awaiting) {
      this._awaiting = true;
      this._loading.then(() => {
        context.viewport.invalidateDecorations();
        this._awaiting = false;
      }).catch(() => undefined);
    }
  }

  /** Turn the markers on and off. Each time it runs it creates a new random set of incidents. */
  public static toggle(extents: AxisAlignedBox3d) {
    if (undefined === IncidentMarkerDemo.decorator) {
      // start the demo by creating the IncidentMarkerDemo object and adding it as a ViewManager decorator.
      IncidentMarkerDemo.decorator = new IncidentMarkerDemo(extents);
      IModelApp.viewManager.addDecorator(IncidentMarkerDemo.decorator);
    } else {
      // stop the demo
      IModelApp.viewManager.dropDecorator(IncidentMarkerDemo.decorator);
      IncidentMarkerDemo.decorator = undefined;
    }
  }
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Application_LogoCard

IModelApp.applicationLogoCard = () => {
  return IModelApp.makeLogoCard({ iconSrc: "MyApp.png", heading: "My Great Application", notice: "Example Application<br>Version 2.0" });
};

// __PUBLISH_EXTRACT_END__
