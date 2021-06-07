/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { assert, dispose, Id64Array, Id64String } from "@bentley/bentleyjs-core";
import { Angle, ClipShape, ClipVector, Constant, Matrix3d, Point2d, Point3d, PolyfaceBuilder, Range2d, Range3d, StrokeOptions, Transform } from "@bentley/geometry-core";
import {
  AxisAlignedBox3d, ColorDef, Feature, FeatureTable, Frustum, Gradient, GraphicParams, HiddenLine, PackedFeatureTable, Placement2d, RenderMaterial, RenderTexture, SheetProps, TextureMapping, ViewAttachmentProps, ViewDefinition2dProps, ViewFlagOverrides, ViewStateProps,
} from "@bentley/imodeljs-common";
import { CategorySelectorState } from "./CategorySelectorState";
import { DisplayStyle2dState } from "./DisplayStyleState";
import { IModelConnection } from "./IModelConnection";
import { GraphicBuilder, GraphicType } from "./render/GraphicBuilder";
import { RenderGraphic } from "./render/RenderGraphic";
import { GraphicBranch } from "./render/GraphicBranch";
import { Frustum2d } from "./Frustum2d";
import { Scene } from "./render/Scene";
import { Decorations } from "./render/Decorations";
import { MockRender } from "./render/MockRender";
import { RenderClipVolume } from "./render/RenderClipVolume";
import { RenderMemory } from "./render/RenderMemory";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { DecorateContext, SceneContext } from "./ViewContext";
import { ViewRect } from "./ViewRect";
import { IModelApp } from "./IModelApp";
import { CoordSystem } from "./CoordSystem";
import { OffScreenViewport, Viewport } from "./Viewport";
import { ViewState, ViewState2d } from "./ViewState";
import { DrawingViewState } from "./DrawingViewState";
import { createDefaultViewFlagOverrides, DisclosedTileTreeSet, TileGraphicType } from "./tile/internal";
import { imageBufferToPngDataUrl, openImageDataUrlInNewWindow } from "./ImageUtil";

// cSpell:ignore ovrs

/** Describes the geometry and styling of a sheet border decoration.
 * The sheet border decoration mimics a sheet of paper with a drop shadow.
 */
class SheetBorder {
  private _rect: Point2d[];
  private _shadow: Point2d[];
  private _gradient: Gradient.Symb;

  private constructor(rect: Point2d[], shadow: Point2d[], gradient: Gradient.Symb) {
    this._rect = rect;
    this._shadow = shadow;
    this._gradient = gradient;
  }

  /** Create a new sheet border. If a context is supplied, points are transformed to view coordinates. */
  public static create(width: number, height: number, context?: DecorateContext) {
    // Rect
    const rect: Point3d[] = [
      Point3d.create(0, height),
      Point3d.create(0, 0),
      Point3d.create(width, 0),
      Point3d.create(width, height),
      Point3d.create(0, height)];
    if (context) {
      context.viewport.worldToViewArray(rect);
    }

    // Shadow
    const shadowWidth = .01 * Math.sqrt(width * width + height * height);
    const shadow: Point3d[] = [
      Point3d.create(shadowWidth, 0),
      Point3d.create(shadowWidth, -shadowWidth),
      Point3d.create(width + shadowWidth, -shadowWidth),
      Point3d.create(width + shadowWidth, height - shadowWidth),
      Point3d.create(width, height - shadowWidth),
      Point3d.create(width, 0),
      Point3d.create(shadowWidth, 0),
    ];
    if (context) {
      context.viewport.worldToViewArray(shadow);
    }

    // Gradient
    const gradient = new Gradient.Symb();
    gradient.mode = Gradient.Mode.Linear;
    gradient.angle = Angle.createDegrees(-45);
    gradient.keys = [{ value: 0, color: ColorDef.from(25, 25, 25) }, { value: 0.5, color: ColorDef.from(150, 150, 150) }];

    // Copy over points
    const rect2d: Point2d[] = [];
    for (const point of rect)
      rect2d.push(Point2d.createFrom(point));
    const shadow2d: Point2d[] = [];
    for (const point of shadow)
      shadow2d.push(Point2d.createFrom(point));

    return new SheetBorder(rect2d, shadow2d, gradient);
  }

  public getRange(): Range2d {
    const range = Range2d.createArray(this._rect);
    const shadowRange = Range2d.createArray(this._shadow);
    range.extendRange(shadowRange);
    return range;
  }

  /** Add this border to the given GraphicBuilder. */
  public addToBuilder(builder: GraphicBuilder) {
    const lineColor = ColorDef.black;
    const fillColor = ColorDef.black;

    const params = new GraphicParams();
    params.fillColor = fillColor;
    params.gradient = this._gradient;

    builder.activateGraphicParams(params);
    builder.addShape2d(this._shadow, Frustum2d.minimumZDistance);

    builder.setSymbology(lineColor, fillColor, 2);
    builder.addLineString2d(this._rect, 0);
  }
}

/** The information required to instantiate an Attachment object. See ViewAttachmentsInfo */
interface ViewAttachmentInfo extends ViewAttachmentProps {
  attachedView: ViewState;
}

/** The information required to instantiate an ViewAttachments object to draw ViewAttachments into a sheet. The list of view attachment Ids is
 * supplied to SheetViewState via the constructor. The corresponding ViewAttachmentProps for each attachment are obtained asynchronously in
 * SheetViewState.load(). The Attachments object is created in SheetViewState.attachToViewport and disposed of in SheetViewState.detachFromViewport.
 */
class ViewAttachmentsInfo {
  private _attachments: Id64Array | ViewAttachmentInfo[];

  private constructor(attachments: Id64Array | ViewAttachmentInfo[]) {
    this._attachments = attachments;
  }

  public get isLoaded(): boolean {
    return 0 === this._attachments.length || "string" !== typeof this._attachments[0];
  }

  public get viewAttachmentProps(): Array<Readonly<ViewAttachmentProps>> {
    return this.isLoaded ? this._props : [];
  }

  private get _props(): ViewAttachmentInfo[] {
    assert(this.isLoaded);
    return this._attachments as ViewAttachmentInfo[];
  }

  private get _ids(): Id64Array {
    assert(!this.isLoaded);
    return this._attachments as Id64Array;
  }

  public static fromJSON(ids: Id64Array = []): ViewAttachmentsInfo {
    return new ViewAttachmentsInfo(ids);
  }

  public toJSON(): Id64Array {
    return this.isLoaded ? this._props.map((x) => x.id!) : [...this._ids];
  }

  public clone(): ViewAttachmentsInfo {
    // No reason to clone the array.
    return new ViewAttachmentsInfo(this._attachments);
  }

  public async load(iModel: IModelConnection): Promise<void> {
    if (this.isLoaded)
      return;

    const attachmentProps = await iModel.elements.getProps(this._ids) as ViewAttachmentInfo[];
    const promises = [];
    for (const attachment of attachmentProps) {
      const loadView = async () => {
        try {
          const view = await iModel.views.load(attachment.view.id);
          return view;
        } catch (_) {
          return undefined;
        }
      };

      promises.push(loadView());
    }

    const views = await Promise.all(promises);
    assert(views.length === attachmentProps.length);

    const attachments = [];
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      if (view && !(view instanceof SheetViewState)) {
        const props = attachmentProps[i];
        props.attachedView = view;
        attachments.push(props);
      }
    }

    this._attachments = attachments;
  }

  public createAttachments(sheetView: SheetViewState): ViewAttachments | undefined {
    return this.isLoaded ? new ViewAttachments(this._props, sheetView) : undefined;
  }
}

/** The set of view attachments to be displayed in a Viewport via a SheetViewState. Allocated when the view becomes attached to a Viewport;
 * disposed of when it becomes detached from the viewport.
 */
class ViewAttachments {
  private readonly _attachments: Attachment[] = [];
  public maxDepth = Frustum2d.minimumZDistance;

  public constructor(infos: ViewAttachmentInfo[], sheetView: SheetViewState) {
    for (const info of infos) {
      const drawAsRaster = info.jsonProperties?.displayOptions?.drawAsRaster || info.attachedView.isCameraEnabled();
      const ctor = drawAsRaster ? RasterAttachment : OrthographicAttachment;
      const attachment = new ctor(info.attachedView, info, sheetView);
      this._attachments.push(attachment);
      this.maxDepth = Math.max(this.maxDepth, attachment.zDepth);
    }
  }

  public dispose(): void {
    for (const attachment of this._attachments)
      attachment.dispose();

    this._attachments.length = 0;
  }

  public [Symbol.iterator](): Iterator<Attachment> {
    return this._attachments[Symbol.iterator]();
  }

  /** For tests. */
  public get attachments(): Object[] {
    return this._attachments;
  }

  public get isEmpty(): boolean {
    return 0 === this._attachments.length;
  }

  public get areAllTileTreesLoaded(): boolean {
    return this._attachments.every((x) => x.areAllTileTreesLoaded);
  }

  public discloseTileTrees(trees: DisclosedTileTreeSet): void {
    for (const attachment of this._attachments)
      trees.disclose(attachment);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const attachment of this._attachments)
      attachment.collectStatistics(stats);
  }

  public addToScene(context: SceneContext): void {
    for (const attachment of this._attachments)
      attachment.addToScene(context);
  }
}

/** A view of a [SheetModel]($backend).
 * @public
 */
export class SheetViewState extends ViewState2d {
  /** The width and height of the sheet in world coordinates. */
  public readonly sheetSize: Point2d;
  private _attachmentsInfo: ViewAttachmentsInfo;
  private _attachments?: ViewAttachments;
  private readonly _viewedExtents: AxisAlignedBox3d;

  public get attachmentIds(): Id64Array {
    return this._attachmentsInfo.toJSON();
  }

  /** @internal */
  public static get className() { return "SheetViewDefinition"; }

  public static createFromProps(viewStateData: ViewStateProps, iModel: IModelConnection): SheetViewState {
    const cat = new CategorySelectorState(viewStateData.categorySelectorProps, iModel);
    const displayStyleState = new DisplayStyle2dState(viewStateData.displayStyleProps, iModel);

    // use "new this" so subclasses are correct
    return new this(viewStateData.viewDefinitionProps as ViewDefinition2dProps, iModel, cat, displayStyleState, viewStateData.sheetProps!, viewStateData.sheetAttachments!);
  }

  public toProps(): ViewStateProps {
    const props = super.toProps();

    props.sheetAttachments = this._attachmentsInfo.toJSON();

    // For sheetProps all that is actually used is the size, so just null out everything else.
    const codeProps = { spec: "", scope: "", value: "" };
    props.sheetProps = {
      model: "",
      code: codeProps,
      classFullName: "",
      width: this.sheetSize.x,
      height: this.sheetSize.y,
      scale: 1,
    };

    return props;
  }

  /** Strictly for testing. @internal */
  public get viewAttachmentProps(): Array<Readonly<ViewAttachmentProps>> {
    return this._attachmentsInfo.viewAttachmentProps;
  }

  /** Strictly for testing. @internal */
  public get attachments(): Object[] | undefined {
    return this._attachments?.attachments;
  }

  /** @internal override */
  public isDrawingView(): this is DrawingViewState { return false; }

  public constructor(props: ViewDefinition2dProps, iModel: IModelConnection, categories: CategorySelectorState, displayStyle: DisplayStyle2dState, sheetProps: SheetProps, attachments: Id64Array) {
    super(props, iModel, categories, displayStyle);
    if (categories instanceof SheetViewState) {
      // we are coming from clone...
      this.sheetSize = categories.sheetSize.clone();
      this._attachmentsInfo = categories._attachmentsInfo.clone();
      this._viewedExtents = categories._viewedExtents.clone();
    } else {
      this.sheetSize = Point2d.create(sheetProps.width, sheetProps.height);
      this._attachmentsInfo = ViewAttachmentsInfo.fromJSON(attachments);

      const extents = new Range3d(0, 0, 0, this.sheetSize.x, this.sheetSize.y, 0);
      const margin = 1.1;
      extents.scaleAboutCenterInPlace(margin);
      this._viewedExtents = extents;
    }
  }

  public getOrigin() {
    const origin = super.getOrigin();
    if (this._attachments)
      origin.z = -this._attachments.maxDepth;

    return origin;
  }

  public getExtents() {
    const extents = super.getExtents();
    if (this._attachments)
      extents.z = this._attachments.maxDepth + Frustum2d.minimumZDistance;

    return extents;
  }

  /** Disclose *all* TileTrees currently in use by this view. This set may include trees not reported by [[forEachTileTreeRef]] - e.g., those used by view attachments, map-draped terrain, etc.
   * @internal override
   */
  public discloseTileTrees(trees: DisclosedTileTreeSet): void {
    super.discloseTileTrees(trees);
    if (this._attachments)
      trees.disclose(this._attachments);
  }

  /** @internal override */
  public collectNonTileTreeStatistics(stats: RenderMemory.Statistics): void {
    super.collectNonTileTreeStatistics(stats);
    if (this._attachments)
      this._attachments.collectStatistics(stats);
  }

  /** @internal override */
  public get defaultExtentLimits() {
    return { min: Constant.oneMillimeter, max: this.sheetSize.magnitude() * 10 };
  }

  /** @internal override */
  public getViewedExtents(): AxisAlignedBox3d {
    return this._viewedExtents;
  }

  /** Load the size and attachment for this sheet, as well as any other 2d view state characteristics.
   * @internal override
   */
  public async load(): Promise<void> {
    await super.load();
    await this._attachmentsInfo.load(this.iModel);
  }

  /** @internal override */
  public createScene(context: SceneContext): void {
    super.createScene(context);
    if (this._attachments)
      this._attachments.addToScene(context);
  }

  /** @internal override */
  public get secondaryViewports(): Iterable<Viewport> {
    const attachments = this._attachments;
    if (!attachments)
      return super.secondaryViewports;

    function* iterator() {
      for (const attachment of attachments!) {
        const vp = attachment.viewport;
        if (vp)
          yield vp;
      }
    }

    return {
      [Symbol.iterator]: () => iterator(),
    };
  }

  /** @internal */
  private async queryAttachmentIds(): Promise<Id64Array> {
    const ecsql = `SELECT ECInstanceId as attachmentId FROM bis.ViewAttachment WHERE model.Id=${this.baseModelId}`;
    const ids: string[] = [];
    for await (const row of this.iModel.query(ecsql))
      ids.push(row.attachmentId);

    return ids;
  }

  /** @internal override */
  public async changeViewedModel(modelId: Id64String): Promise<void> {
    await super.changeViewedModel(modelId);
    const attachmentIds = await this.queryAttachmentIds();
    this._attachmentsInfo = ViewAttachmentsInfo.fromJSON(attachmentIds);

    assert(undefined === this._attachments);
  }

  /** @internal override */
  public attachToViewport(): void {
    super.attachToViewport();
    assert(undefined === this._attachments);
    this._attachments = this._attachmentsInfo.createAttachments(this);
  }

  /** @internal override */
  public detachFromViewport(): void {
    super.detachFromViewport();
    this._attachments = dispose(this._attachments);
  }

  /** @internal override */
  public get areAllTileTreesLoaded(): boolean {
    return super.areAllTileTreesLoaded && (!this._attachments || this._attachments.areAllTileTreesLoaded);
  }

  /** Create a sheet border decoration graphic. */
  private createBorder(width: number, height: number, context: DecorateContext): RenderGraphic {
    const border = SheetBorder.create(width, height, context);
    const builder = context.createGraphicBuilder(GraphicType.ViewBackground);
    border.addToBuilder(builder);
    return builder.finish();
  }

  /** @internal override */
  public decorate(context: DecorateContext): void {
    super.decorate(context);
    if (this.sheetSize !== undefined) {
      const border = this.createBorder(this.sheetSize.x, this.sheetSize.y, context);
      context.setViewBackground(border);
    }
  }

  /** @internal override */
  public computeFitRange(): Range3d {
    const size = this.sheetSize;
    if (0 >= size.x || 0 >= size.y)
      return super.computeFitRange();
    return new Range3d(0, 0, -1, size.x, size.y, 1);
  }
}

/** A mostly no-op RenderTarget for an Attachment.
 * its Scene and symbology overrides.
 */
class AttachmentTarget extends MockRender.OffScreenTarget {
  private readonly _attachment: OrthographicAttachment;

  public constructor(attachment: OrthographicAttachment) {
    // The dimensions don't matter - we're not drawing anything.
    const rect = new ViewRect(1, 1);
    super(IModelApp.renderSystem, rect);
    this._attachment = attachment;
  }

  public changeScene(scene: Scene): void {
    this._attachment.scene = scene;
  }

  public overrideFeatureSymbology(ovrs: FeatureSymbology.Overrides): void {
    this._attachment.symbologyOverrides = ovrs;
  }
}

/** Draws the contents of a view attachment into a sheet view. */
interface Attachment {
  readonly areAllTileTreesLoaded: boolean;
  addToScene: (context: SceneContext) => void;
  discloseTileTrees: (trees: DisclosedTileTreeSet) => void;
  readonly zDepth: number;
  collectStatistics: (stats: RenderMemory.Statistics) => void;
  viewAttachmentProps: ViewAttachmentProps;
  dispose(): void;
  readonly viewport?: Viewport;
}

/** Draws the contents a 2d or orthographic 3d view directly into a sheet view.
 * We select tiles for the view in the context of a light-weight offscreen viewport with a no-op RenderTarget, then
 * collect the resultant graphics and add them to the sheet view's scene.
 */
class OrthographicAttachment {
  private readonly _viewport: OffScreenViewport;
  private readonly _props: ViewAttachmentProps;
  private readonly _sheetModelId: Id64String;
  private readonly _viewFlagOverrides: ViewFlagOverrides;
  private readonly _toSheet: Transform;
  private readonly _fromSheet: Transform;
  private readonly _sizeInMeters: Point2d;
  private readonly _range: Range3d;
  private readonly _viewRect = new ViewRect(0, 0, 1, 1);
  private readonly _originalFrustum = new Frustum();
  private readonly _clipVolume?: RenderClipVolume;
  private readonly _hiddenLineSettings?: HiddenLine.Settings;
  private readonly _scale: { x: number, y: number };
  private _debugFeatureTable?: PackedFeatureTable;
  public scene?: Scene;
  public symbologyOverrides: FeatureSymbology.Overrides;
  public readonly zDepth: number;

  public get view(): ViewState {
    return this._viewport.view;
  }

  public get viewAttachmentProps() {
    return this._props;
  }

  public get viewport(): Viewport {
    return this._viewport;
  }

  public constructor(view: ViewState, props: ViewAttachmentProps, sheetView: SheetViewState) {
    this.symbologyOverrides = new FeatureSymbology.Overrides(view);
    const target = new AttachmentTarget(this);
    this._viewport = OffScreenViewport.createViewport(view, target, true);

    this._props = props;
    this._sheetModelId = sheetView.baseModelId;
    this._viewFlagOverrides = new ViewFlagOverrides(view.viewFlags);

    const applyClip = true; // set to false for debugging
    this._viewFlagOverrides.setShowClipVolume(applyClip);
    this._viewFlagOverrides.setApplyLighting(false);
    this._viewFlagOverrides.setShowShadows(false);

    const placement = Placement2d.fromJSON(props.placement);
    const range = placement.calculateRange();
    this._range = range;
    this._sizeInMeters = new Point2d(range.xLength(), range.yLength());

    // Compute transform from attached view's world coordinates to sheet's world coordinates.
    // NB: We obtain the extents and origin from the *viewport* not the *view* - they may have been adjusted by the viewport.
    const applySkew = true; // set to false for debugging
    const skew = applySkew ? view.getAspectRatioSkew() : 1;
    const extents = this._viewport.viewingSpace.viewDelta.clone();
    const zDepth = Math.abs(extents.z);
    const scaleX = this._sizeInMeters.x / Math.abs(extents.x);
    const scaleY = skew * this._sizeInMeters.y / Math.abs(extents.y);
    this._scale = { x: 1 / scaleX, y: 1 / scaleY };

    const zBias = Frustum2d.depthFromDisplayPriority(props.jsonProperties?.displayPriority ?? 0);
    this.zDepth = 1.01 * (zDepth - zBias); // give a little padding so that geometry right up against far plane doesn't get clipped.

    // View origin is at the *back* of the view. Align *front* of view based on display priority.
    const viewRot = view.getRotation();
    const viewOrg = viewRot.multiplyVector(this._viewport.viewingSpace.viewOrigin);
    viewOrg.z += zDepth;
    viewRot.multiplyTransposeVectorInPlace(viewOrg);

    const matrix = Matrix3d.createScale(scaleX, scaleY, 1);
    matrix.multiplyMatrixMatrix(viewRot, matrix);
    const origin = Matrix3d.xyzMinusMatrixTimesXYZ(viewOrg, matrix, viewOrg);
    const attachmentOrigin = Point3d.createFrom(placement.origin);
    attachmentOrigin.z = zBias;
    const viewOrgToAttachment = attachmentOrigin.minus(viewOrg);
    origin.addInPlace(viewOrgToAttachment);
    this._toSheet = Transform.createRefs(origin, matrix);
    this._fromSheet = this._toSheet.inverse()!;

    // ###TODO? If we also apply the attachment's clip to the attached view, we may get additional culling during tile selection.
    // However the attached view's frustum is already clipped by intersection with sheet view's frustum, and additional clipping planes
    // introduce additional computation, so possibly not worth it.

    // Transform the view's clip (if any) to sheet space
    let viewClip = view.viewFlags.clipVolume ? view.getViewClip()?.clone() : undefined;
    if (viewClip)
      viewClip.transformInPlace(this._toSheet);
    else
      viewClip = ClipVector.createEmpty();

    let sheetClip;
    if (undefined !== props.jsonProperties?.clip)
      sheetClip = ClipVector.fromJSON(props.jsonProperties?.clip);

    if (sheetClip && sheetClip.isValid) {
      // Clip to view attachment's clip. NB: clip is in sheet coordinate space.
      for (const clip of sheetClip.clips)
        viewClip.clips.push(clip);
    } else {
      // Clip to view attachment's bounding box
      viewClip.appendShape([
        Point3d.create(this._range.low.x, this._range.low.y),
        Point3d.create(this._range.high.x, this._range.low.y),
        Point3d.create(this._range.high.x, this._range.high.y),
        Point3d.create(this._range.low.x, this._range.high.y),
      ]);
    }

    this._clipVolume = IModelApp.renderSystem.createClipVolume(viewClip);

    // Save off the original frustum (potentially adjusted by viewport).
    this._viewport.setupFromView();
    this._viewport.viewingSpace.getFrustum(CoordSystem.World, true, this._originalFrustum);

    const applyHiddenLineSettings = true; // for debugging edge display, set to false...
    const style = view.displayStyle;
    if (style.is3d() && applyHiddenLineSettings)
      this._hiddenLineSettings = style.settings.hiddenLineSettings;
  }

  public dispose(): void {
    this._viewport.dispose();
  }

  public discloseTileTrees(trees: DisclosedTileTreeSet): void {
    trees.disclose(this._viewport);
  }

  public addToScene(context: SceneContext): void {
    if (context.viewport.freezeScene)
      return;

    if (!context.viewport.view.viewsCategory(this._props.category))
      return;

    const wantBounds = context.viewport.wantViewAttachmentBoundaries;
    const wantClipShapes = context.viewport.wantViewAttachmentClipShapes;
    if (wantBounds || wantClipShapes) {
      const builder = context.createSceneGraphicBuilder();
      if (wantBounds) {
        builder.setSymbology(ColorDef.red, ColorDef.red, 2);
        builder.addRangeBox(this._range);
      }

      if (wantClipShapes && this._clipVolume) {
        builder.setSymbology(ColorDef.blue, ColorDef.blue, 2);
        for (const prim of this._clipVolume.clipVector.clips) {
          if (!(prim instanceof ClipShape))
            continue; // ###TODO handle non-shape primitives, if any such ever encountered

          const pts = [];
          const tf = prim.transformFromClip;
          for (const pt of prim.polygon) {
            const tfPt = tf ? tf.multiplyPoint3d(pt) : pt;
            pts.push(new Point2d(tfPt.x, tfPt.y));
          }

          builder.addLineString2d(pts, 0);
        }
      }

      // Put into a Batch so that we can see tooltip with attachment Id on mouseover.
      const batch = context.target.renderSystem.createBatch(builder.finish(), this.getDebugFeatureTable(), this._range);
      context.outputGraphic(batch);
    }

    if (!context.viewport.wantViewAttachments)
      return;

    // Pixel size used to compute size of ViewRect so that tiles of appropriate LOD are selected.
    const pixelSize = context.viewport.getPixelSizeAtPoint();
    if (0 === pixelSize)
      return;

    // Adjust attached view frustum based on intersection with sheet view frustum.
    const attachFrustum = this._originalFrustum.transformBy(this._toSheet);
    const attachFrustumRange = attachFrustum.toRange();
    const sheetFrustum = context.viewport.getWorldFrustum();
    const sheetFrustumRange = sheetFrustum.toRange();
    const intersect = attachFrustumRange.intersect(sheetFrustumRange);
    if (intersect.isNull)
      return;

    attachFrustum.initFromRange(intersect);
    attachFrustum.transformBy(this._fromSheet, attachFrustum);
    this._viewport.setupViewFromFrustum(attachFrustum);

    // Adjust view rect based on size of attachment on screen so that tiles of appropriate LOD are selected.
    const width = this._sizeInMeters.x * intersect.xLength() / attachFrustumRange.xLength();
    const height = this._sizeInMeters.y * intersect.yLength() / attachFrustumRange.yLength();
    this._viewRect.width = Math.max(1, Math.round(width / pixelSize));
    this._viewRect.height = Math.max(1, Math.round(height / pixelSize));
    this._viewport.setRect(this._viewRect);

    // Propagate settings from on-screen viewport.
    this._viewport.debugBoundingBoxes = context.viewport.debugBoundingBoxes;
    this._viewport.setTileSizeModifier(context.viewport.tileSizeModifier);

    // Create the scene.
    this._viewport.renderFrame();

    const scene = this.scene;
    if (!scene)
      return;

    // Extract scene graphics and insert into on-screen scene context.
    const options = {
      clipVolume: this._clipVolume,
      hline: this._hiddenLineSettings,
      frustum: {
        is3d: this.view.is3d(),
        scale: this._scale,
      },
    };

    const outputGraphics = (source: RenderGraphic[]) => {
      if (0 === source.length)
        return;

      const graphics = new GraphicBranch();
      graphics.setViewFlagOverrides(this._viewFlagOverrides);
      graphics.symbologyOverrides = this.symbologyOverrides;

      for (const graphic of source)
        graphics.entries.push(graphic);

      const branch = context.createGraphicBranch(graphics, this._toSheet, options);
      context.outputGraphic(branch);
    };

    outputGraphics(scene.foreground);
    context.withGraphicType(TileGraphicType.BackgroundMap, () => outputGraphics(scene.background));
    context.withGraphicType(TileGraphicType.Overlay, () => outputGraphics(scene.overlay));

    // Report tile statistics to sheet view's viewport.
    const tileAdmin = IModelApp.tileAdmin;
    const selectedAndReady = tileAdmin.getTilesForViewport(this._viewport);
    const requested = tileAdmin.getRequestsForViewport(this._viewport);
    tileAdmin.addExternalTilesForViewport(context.viewport, {
      requested: requested?.size ?? 0,
      selected: selectedAndReady?.selected.size ?? 0,
      ready: selectedAndReady?.ready.size ?? 0,
    });
  }

  private getDebugFeatureTable(): PackedFeatureTable {
    if (this._debugFeatureTable)
      return this._debugFeatureTable;

    const featureTable = new FeatureTable(1, this._sheetModelId);
    featureTable.insert(new Feature(this._props.id));
    this._debugFeatureTable = PackedFeatureTable.pack(featureTable);
    return this._debugFeatureTable;
  }

  public get areAllTileTreesLoaded(): boolean {
    return this.view.areAllTileTreesLoaded;
  }

  public collectStatistics(_stats: RenderMemory.Statistics): void {
    // Handled by discloseTileTrees()
  }
}

function createRasterAttachmentViewport(_view: ViewState, _rect: ViewRect, _attachment: RasterAttachment): OffScreenViewport {
  class RasterAttachmentViewport extends OffScreenViewport {
    private _sceneContext?: SceneContext;
    private _isSceneReady = false;
    private readonly _attachment: RasterAttachment;

    public constructor(view: ViewState, rect: ViewRect, attachment: RasterAttachment) {
      super(IModelApp.renderSystem.createOffscreenTarget(rect));
      this._attachment = attachment;
      this._isAspectRatioLocked = true;
      this.changeView(view);
    }

    public createSceneContext(): SceneContext {
      assert(!this._isSceneReady);

      this._sceneContext = super.createSceneContext();
      return this._sceneContext;
    }

    public renderFrame(): void {
      assert(!this._isSceneReady);

      this.clearSceneContext();
      super.renderFrame();

      if (undefined !== this._sceneContext) {
        this._isSceneReady = !this._sceneContext.hasMissingTiles && this.view.areAllTileTreesLoaded;
        if (this._isSceneReady)
          this._attachment.produceGraphics(this._sceneContext);

        this._sceneContext = undefined;
      }
    }

    private clearSceneContext(): void {
      this._sceneContext = undefined;
    }

    public addDecorations(_decorations: Decorations): void {
      // ###TODO: skybox, ground plane, possibly grid. DecorateContext requires a ScreenViewport...
    }
  }

  return new RasterAttachmentViewport(_view, _rect, _attachment);
}

/** Draws a 3d view with camera enabled into a sheet view by producing an image of the view's contents offscreen. */
class RasterAttachment {
  private readonly _props: ViewAttachmentProps;
  private readonly _placement: Placement2d;
  private readonly _transform: Transform;
  public readonly zDepth: number;
  private _viewport?: OffScreenViewport;
  private _graphics?: RenderGraphic;

  public constructor(view: ViewState, props: ViewAttachmentProps, sheetView: SheetViewState) {
    // Render to a 2048x2048 view rect. Scale in Y to preserve aspect ratio.
    const maxSize = 2048;
    const rect = new ViewRect(0, 0, maxSize, maxSize);
    const height = maxSize * view.getAspectRatio() * view.getAspectRatioSkew();
    const skew = maxSize / height;
    view.setAspectRatioSkew(skew);

    if (true !== props.jsonProperties?.displayOptions?.preserveBackground) {
      // Make background color 100% transparent so that Viewport.readImage() will discard transparent pixels.
      const bgColor = sheetView.displayStyle.backgroundColor.withAlpha(0);
      view.displayStyle.backgroundColor = bgColor;
    }

    this._viewport = createRasterAttachmentViewport(view, rect, this);
    this._props = props;
    this._placement = Placement2d.fromJSON(props.placement);
    this._transform = this._placement.transform;
    this.zDepth = Frustum2d.depthFromDisplayPriority(props.jsonProperties?.displayPriority ?? 0);
  }

  public dispose(): void {
    this._viewport?.dispose();
  }

  public get viewAttachmentProps() {
    return this._props;
  }

  public get viewport(): Viewport | undefined {
    return this._viewport;
  }

  public get areAllTileTreesLoaded() {
    return this._viewport?.areAllTileTreesLoaded ?? true;
  }

  public addToScene(context: SceneContext): void {
    // ###TODO: check viewport.wantViewAttachmentClipShapes
    if (!context.viewport.view.viewsCategory(this._props.category))
      return;

    if (context.viewport.wantViewAttachmentBoundaries) {
      const builder = context.createSceneGraphicBuilder(this._transform);
      builder.setSymbology(ColorDef.red, ColorDef.red, 2);
      builder.addRangeBox(Range3d.createRange2d(this._placement.bbox));
      context.outputGraphic(builder.finish());
    }

    if (!context.viewport.wantViewAttachments)
      return;

    if (this._graphics) {
      context.outputGraphic(this._graphics);
      return;
    }

    if (undefined === this._viewport)
      return;

    this._viewport.debugBoundingBoxes = context.viewport.debugBoundingBoxes;
    this._viewport.setTileSizeModifier(context.viewport.tileSizeModifier);

    this._viewport.renderFrame();
    if (this._graphics)
      context.outputGraphic(this._graphics);
  }

  public discloseTileTrees(trees: DisclosedTileTreeSet) {
    if (this._viewport)
      trees.disclose(this._viewport);
  }

  public produceGraphics(context: SceneContext): void {
    assert(context.viewport === this._viewport);
    this._graphics = this.createGraphics(this._viewport);
    this._viewport = dispose(this._viewport);

    if (undefined !== this._graphics)
      context.outputGraphic(this._graphics);
  }

  private createGraphics(vp: Viewport): RenderGraphic | undefined {
    // Create a texture from the contents of the view.
    const image = vp.readImage(vp.viewRect, undefined, false);
    if (undefined === image)
      return undefined;

    const debugImage = false; // set to true to open a window displaying the captured image.
    if (debugImage) {
      const url = imageBufferToPngDataUrl(image, false);
      if (url)
        openImageDataUrlInNewWindow(url, "Attachment");
    }

    const textureParams = new RenderTexture.Params();
    const texture = IModelApp.renderSystem.createTextureFromImageBuffer(image, vp.iModel, textureParams);
    if (undefined === texture)
      return undefined;

    // Create a material for the texture
    const graphicParams = new GraphicParams();
    const materialParams = new RenderMaterial.Params();
    materialParams.textureMapping = new TextureMapping(texture, new TextureMapping.Params());
    graphicParams.material = IModelApp.renderSystem.createMaterial(materialParams, vp.iModel);

    // Apply the texture to a rectangular polyface.
    const depth = this.zDepth;
    const east = this._placement.bbox.low.x;
    const west = this._placement.bbox.high.x;
    const north = this._placement.bbox.low.y;
    const south = this._placement.bbox.high.y;
    const corners = [
      Point3d.create(east, north, depth),
      Point3d.create(west, north, depth),
      Point3d.create(west, south, depth),
      Point3d.create(east, south, depth),
    ];
    const params = [
      Point2d.create(0, 0),
      Point2d.create(1, 0),
      Point2d.create(1, 1),
      Point2d.create(0, 1),
    ];

    const strokeOptions = new StrokeOptions();
    strokeOptions.needParams = strokeOptions.shouldTriangulate = true;
    const polyfaceBuilder = PolyfaceBuilder.create(strokeOptions);
    polyfaceBuilder.addQuadFacet(corners, params);
    const polyface = polyfaceBuilder.claimPolyface();

    const graphicBuilder = IModelApp.renderSystem.createGraphicBuilder(Transform.createIdentity(), GraphicType.Scene, vp, this._props.id);
    graphicBuilder.activateGraphicParams(graphicParams);
    graphicBuilder.addPolyface(polyface, false);
    const graphic = graphicBuilder.finish();

    // Wrap the polyface in a GraphicBranch.
    const branch = new GraphicBranch(true);
    const vfOvrs = createDefaultViewFlagOverrides({ clipVolume: true, shadows: false, lighting: false, thematic: false });
    branch.setViewFlagOverrides(vfOvrs);
    branch.symbologyOverrides = new FeatureSymbology.Overrides();
    branch.entries.push(graphic);

    // Apply the attachment's clip, if any.
    let clipVolume;
    if (this._props.jsonProperties?.clip) {
      const clipVector = ClipVector.fromJSON(this._props.jsonProperties?.clip);
      if (clipVector.isValid)
        clipVolume = IModelApp.renderSystem.createClipVolume(clipVector);
    }

    return IModelApp.renderSystem.createGraphicBranch(branch, this._transform, { clipVolume });
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    if (this._graphics)
      this._graphics.collectStatistics(stats);
  }
}
