/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "@bentley/bentleyjs-core";
import { Angle, AuxChannel, AuxChannelData, AuxChannelDataType, IModelJson, Point3d, Polyface, PolyfaceAuxData, PolyfaceBuilder, StrokeOptions, Transform } from "@bentley/geometry-core";
import {
  AnalysisStyle, AnalysisStyleProps, ColorByName, ColorDef, RenderMode, ThematicGradientColorScheme, ThematicGradientMode, ThematicGradientSettingsProps,
} from "@bentley/imodeljs-common";
import {
  DecorateContext, GraphicType, IModelApp, RenderGraphicOwner, StandardViewId, Viewport,
} from "@bentley/imodeljs-frontend";
import { Viewer } from "./Viewer";

type AnalysisMeshType = "Cantilever" | "Flat with waves";

interface AnalysisMesh {
  readonly type: AnalysisMeshType;
  readonly polyface: Polyface;
  readonly styles: Map<string, AnalysisStyle | undefined>;
}

function populateAnalysisStyles(mesh: AnalysisMesh, displacementScale: number): void {
  const auxdata = mesh.polyface.data.auxData;
  if (!auxdata)
    return;

  mesh.styles.set("None", undefined);
  for (const channel of auxdata.channels) {
    if (undefined === channel.name || !channel.isScalar)
      continue;

    const displacementChannel = auxdata.channels.find((x) => x.inputName === channel.inputName && x.dataType === AuxChannelDataType.Vector);
    const thematicSettings: ThematicGradientSettingsProps = {};
    if (channel.name.endsWith("Height")) {
      thematicSettings.colorScheme = ThematicGradientColorScheme.SeaMountain;
      thematicSettings.mode = ThematicGradientMode.SteppedWithDelimiter;
    }

    assert(undefined !== channel.scalarRange);
    const props: AnalysisStyleProps = {
      scalar: {
        channelName: channel.name,
        range: channel.scalarRange,
        thematicSettings,
      },
    };

    let name = channel.name;
    if (undefined !== displacementChannel?.name) {
      props.displacement = { channelName: displacementChannel.name, scale: displacementScale };
      const exaggeration = 1 !== displacementScale ? "" : ` X ${displacementScale}`;
      name = `${name} and ${displacementChannel.name}${exaggeration}`;
    }

    mesh.styles.set(name, AnalysisStyle.fromJSON(props));
  }
}

async function createCantilever(): Promise<Polyface> {
  const response = await fetch("Cantilever.json");
  const polyface = IModelJson.Reader.parse(await response.json()) as Polyface;
  assert(polyface instanceof Polyface);

  const transform = Transform.createScaleAboutPoint(new Point3d(), 30);
  polyface.tryTransformInPlace(transform);

  return polyface;
}

/** Demonstrate the addition of analytical data to a polyface.
 * This is a purely fictional example intended to demonstrate concepts of [[PolyfaceAuxData]] concepts only.
 * Create a polyface representing a flat mesh with superimposed waves and associated [[PolyfaceAuxData]]  to display displacement, height and slope data.
 * A vector [[AuxChannel]] is created to represent displacement and two scalar [[AuxChannel]] are created to represent height and slope.
 * Note that data between inputs are interpolated so motion will still remain relatively smooth even with only three inputs in the radial waves.
 */
function createFlatMeshWithWaves(): Polyface {
  const options = StrokeOptions.createForFacets();
  options.shouldTriangulate = true;
  const builder = PolyfaceBuilder.create(options);
  const nDimensions = 100;
  const spacing = 1.0;

  /* Create a simple flat mesh with 10,000 points (100x100) */
  for (let iRow = 0; iRow < nDimensions - 1; iRow++) {
    for (let iColumn = 0; iColumn < nDimensions - 1; iColumn++) {
      const quad = [
        Point3d.create(iRow * spacing, iColumn * spacing, 0.0),
        Point3d.create((iRow + 1) * spacing, iColumn * spacing, 0.0),
        Point3d.create((iRow + 1) * spacing, (iColumn + 1) * spacing, 0.0),
        Point3d.create(iRow * spacing, (iColumn + 1) * spacing),
      ];
      builder.addQuadFacet(quad);
    }
  }

  const polyface = builder.claimPolyface();
  const zeroScalarData = [], zeroDisplacementData = [], radialHeightData = [], radialSlopeData = [], radialDisplacementData = [];
  const radius = nDimensions * spacing / 2.0;
  const center = new Point3d(radius, radius, 0.0);
  const maxHeight = radius / 4.0;
  const auxChannels = [];

  /** Create a radial wave - start and return to zero  */
  for (let i = 0; i < polyface.data.point.length; i++) {
    const angle = Angle.pi2Radians * polyface.data.point.distanceIndexToPoint(i, center)! / radius;
    const height = maxHeight * Math.sin(angle);
    const slope = Math.abs(Math.cos(angle));

    zeroScalarData.push(0.0);
    zeroDisplacementData.push(0.0);
    zeroDisplacementData.push(0.0);
    zeroDisplacementData.push(0.0);

    radialHeightData.push(height);
    radialSlopeData.push(slope);
    radialDisplacementData.push(0.0);
    radialDisplacementData.push(0.0);
    radialDisplacementData.push(height);
  }

  // Static Channels.
  auxChannels.push(new AuxChannel([new AuxChannelData(0.0, radialDisplacementData)], AuxChannelDataType.Vector, "Static Radial Displacement", "Radial: Static"));
  auxChannels.push(new AuxChannel([new AuxChannelData(1.0, radialHeightData)], AuxChannelDataType.Distance, "Static Radial Height", "Radial: Static"));
  auxChannels.push(new AuxChannel([new AuxChannelData(1.0, radialSlopeData)], AuxChannelDataType.Scalar, "Static Radial Slope", "Radial: Static"));

  // Animated Channels.
  const radialDisplacementDataVector = [new AuxChannelData(0.0, zeroDisplacementData), new AuxChannelData(1.0, radialDisplacementData), new AuxChannelData(2.0, zeroDisplacementData)];
  const radialHeightDataVector = [new AuxChannelData(0.0, zeroScalarData), new AuxChannelData(1.0, radialHeightData), new AuxChannelData(2.0, zeroScalarData)];
  const radialSlopeDataVector = [new AuxChannelData(0.0, zeroScalarData), new AuxChannelData(1.0, radialSlopeData), new AuxChannelData(2.0, zeroScalarData)];

  auxChannels.push(new AuxChannel(radialDisplacementDataVector, AuxChannelDataType.Vector, "Animated Radial Displacement", "Radial: Time"));
  auxChannels.push(new AuxChannel(radialHeightDataVector, AuxChannelDataType.Distance, "Animated Radial Height", "Radial: Time"));
  auxChannels.push(new AuxChannel(radialSlopeDataVector, AuxChannelDataType.Scalar, "Animated Radial Slope", "Radial: Time"));

  /** Create linear waves -- 10 separate frames.  */
  const waveHeight = radius / 20.0;
  const waveLength = radius / 2.0;
  const frameCount = 10;
  const linearDisplacementDataVector = [], linearHeightDataVector = [], linearSlopeDataVector = [];

  for (let i = 0; i < frameCount; i++) {
    const fraction = i / (frameCount - 1);
    const waveCenter = waveLength * fraction;
    const linearHeightData = [], linearSlopeData = [], linearDisplacementData = [];

    for (let j = 0; j < polyface.data.point.length; j++) {
      const point = polyface.data.point.getPoint3dAtUncheckedPointIndex(j);
      const theta = Angle.pi2Radians * (point.x - waveCenter) / waveLength;
      const height = waveHeight * Math.sin(theta);
      const slope = Math.abs(Math.cos(theta));

      linearHeightData.push(height);
      linearSlopeData.push(slope);
      linearDisplacementData.push(0.0);
      linearDisplacementData.push(0.0);
      linearDisplacementData.push(height);
    }
    linearDisplacementDataVector.push(new AuxChannelData(i, linearDisplacementData));
    linearHeightDataVector.push(new AuxChannelData(i, linearHeightData));
    linearSlopeDataVector.push(new AuxChannelData(i, linearSlopeData));
  }
  auxChannels.push(new AuxChannel(linearDisplacementDataVector, AuxChannelDataType.Vector, "Linear Displacement", "Linear: Time"));
  auxChannels.push(new AuxChannel(linearHeightDataVector, AuxChannelDataType.Distance, "Linear Height", "Linear: Time"));
  auxChannels.push(new AuxChannel(linearSlopeDataVector, AuxChannelDataType.Scalar, "Linear Slope", "Linear: Time"));

  polyface.data.auxData = new PolyfaceAuxData(auxChannels, polyface.data.pointIndex);
  return polyface;
}

async function createMesh(type: AnalysisMeshType, displacementScale = 1): Promise<AnalysisMesh> {
  const polyface = "Flat with waves" === type ? createFlatMeshWithWaves() : await createCantilever();
  const styles = new Map<string, AnalysisStyle | undefined>();
  const mesh = { type, polyface,styles };
  populateAnalysisStyles(mesh, displacementScale);
  return mesh;
}

class AnalysisDecorator {
  public readonly mesh: AnalysisMesh;
  private readonly _viewport: Viewport;
  private readonly _id: string;
  private _graphic?: RenderGraphicOwner;
  private _dispose?: () => void;

  public constructor(viewport: Viewport, mesh: AnalysisMesh) {
    this._viewport = viewport;
    this.mesh = mesh;
    this._id = viewport.iModel.transientIds.next;

    const removeDisposalListener = viewport.onDisposed.addOnce(() => this.dispose());
    const removeAnalysisStyleListener = viewport.addOnAnalysisStyleChangedListener(() => {
      this._graphic?.disposeGraphic();
      this._graphic = undefined;
    });

    this._dispose = () => {
      removeAnalysisStyleListener();
      removeDisposalListener();
    };

    IModelApp.viewManager.addDecorator(this);
  }

  public dispose(): void {
    if (!this._dispose) {
      assert(undefined === this._graphic);
      return;
    }

    this._graphic?.disposeGraphic();
    this._graphic = undefined;
    this._dispose();
    this._dispose = undefined;
    IModelApp.viewManager.dropDecorator(this);
  }

  public decorate(context: DecorateContext): void {
    if (context.viewport !== this._viewport)
      return;

    if (!this._graphic) {
      const builder = context.createGraphicBuilder(GraphicType.Scene, undefined, this._id);
      const color = ColorDef.fromTbgr(ColorByName.darkSlateBlue);
      builder.setSymbology(color, color, 1);
      builder.addPolyface(this.mesh.polyface, false);
      this._graphic = IModelApp.renderSystem.createGraphicOwner(builder.finish());
    }

    context.addDecoration(GraphicType.Scene, this._graphic);
  }
}

export async function openAnalysisStyleExample(viewer: Viewer): Promise<void> {
  const meshes = await Promise.all([createMesh("Cantilever", 100), createMesh("Flat with waves")]);
  let decorator = new AnalysisDecorator(viewer.viewport, meshes[0]);

  const meshPicker = document.createElement("select");
  meshPicker.className = "viewList";
  viewer.toolBar.element.appendChild(meshPicker);
  for (const mesh of meshes) {
    const option = document.createElement("option");
    option.innerText = mesh.type;
    option.value = mesh.type;
    meshPicker.appendChild(option);
  }

  meshPicker.selectedIndex = 0;
  meshPicker.onchange = () => {
    const type = meshPicker.value as AnalysisMeshType;
    if (type !== decorator.mesh.type) {
      decorator.dispose();
      decorator = new AnalysisDecorator(viewer.viewport, meshes[meshPicker.selectedIndex]);
      populateStylePicker();
    }
  };

  const stylePicker = document.createElement("select");
  stylePicker.className = "viewList";
  viewer.toolBar.element.appendChild(stylePicker);
  stylePicker.onchange = () => {
    viewer.viewport.displayStyle.settings.analysisStyle = decorator.mesh.styles.get(stylePicker.value);
  };

  function populateStylePicker(): void {
    while (stylePicker.firstChild)
      stylePicker.removeChild(stylePicker.firstChild);

    for (const name of decorator.mesh.styles.keys()) {
      const option = document.createElement("option");
      option.innerText = option.value = name;
      stylePicker.appendChild(option);
    }

    viewer.viewport.displayStyle.settings.analysisStyle = undefined;
  }

  populateStylePicker();

  assert(viewer.viewport.view.is3d());
  viewer.viewport.setStandardRotation(StandardViewId.Iso);
  viewer.viewport.zoomToVolume(viewer.viewport.iModel.projectExtents);

  const viewFlags = viewer.viewport.viewFlags.clone();
  viewFlags.renderMode = RenderMode.SolidFill;
  viewer.viewport.viewFlags = viewFlags;

  viewer.viewport.view.getDisplayStyle3d().settings.environment = {
    sky: {
      display: true,
      twoColor: true,
      nadirColor: 0xdfefff,
      zenithColor: 0xffefdf,
    },
  };
}
