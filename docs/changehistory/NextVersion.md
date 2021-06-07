---
publish: false
---
# NextVersion

## UI Changes

### Cube Navigation Aid

The enums HitBoxX, HitBoxY, and HitBoxZ used by the CubeNavigationAid have been renamed to CubeNavigationHitBoxX, CubeNavigationHitBoxY, and CubeNavigationHitBoxZ, respectively. The old enums are deprecated.

### TimelineComponent and TimelineComponentDataProvider

The incomplete milestones feature was removed from the TimelineComponent and TimelineComponentDataProvider in preparation to move the APIs to @public.

## New IModel events

[IModel]($common)s now emit events when their properties change.

* [IModel.onProjectExtentsChanged]($common)
* [IModel.onGlobalOriginChanged]($common)
* [IModel.onEcefLocationChanged]($common)
* [IModel.onGeographicCoordinateSystemChanged]($common)
* [IModel.onRootSubjectChanged]($common)
* [IModel.onNameChanged]($common)

Within [IpcApp]($frontend)-based applications, [BriefcaseConnection]($frontend)s now automatically synchronize their properties in response to such events produced by changes on the backend. For example, if [BriefcaseDb.projectExtents]($backend) is modified, [BriefcaseConnection.projectExtents]($frontend) will be updated to match and both the BriefcaseDb and BriefcaseConnection will emit an `onProjectExtentsChanged` event.

## Reality model APIs

Several APIs relating to reality models have been introduced, in some cases replacing previous `beta` APIs. A reality model can be displayed in a [Viewport]($frontend) in one of two ways:
* Adding to the [ViewState]($frontend)'s [ModelSelector]($backend) the Id of a persistent [SpatialModelState]($frontend) containing a URL pointing to a 3d tileset; or
* Attaching to the [DisplayStyleState]($frontend) a [ContextRealityModel]($common) with a URL pointing to a 3d tileset.

The set of [ContextRealityModels]($common) attached to a display style can be accessed and modified via [DisplayStyleSettings.contextRealityModels]($common).

Spatial classification can be applied to a reality model using [ContextRealityModel.classifiers]($common) or [SpatialModelState.classifiers]($frontend). The [SpatialClassifier]($common) APIs replace the previous `beta` APIs in the `SpatialClassificationProps` namespace.

Portions of a reality model can be masked by other models using [ContextRealityModel.planarClipMaskSettings]($common) or, for persistent models, [DisplayStyleSettings.planarClipMasks]($common).

The color, transparency, locatability, and "emphasized" state of a reality model can be overridden using [ContextRealityModel.appearanceOverrides]($common) or, for persistent models, [DisplayStyleSettings.modelAppearanceOverrides]($common).

A reality model displaying simple building meshes for locations all over the world obtained from [OpenStreetMap Buildings](https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/) can be enabled via [DisplayStyleState.setOSMBuildingDisplay]($frontend).

## Popout Widgets

IModelApps, that use AppUi version "2", can now specify if a Widget can support being "popped-out" to a child popup window. The child window runs in the same javascript context as the parent application window. See [Child Window Manager]($docs/learning/ui/framework/ChildWindows.md) for more details.

## External textures

The external textures feature is now enabled by default.

Previously, by default the images for textured materials would be embedded in the tile contents. This increased the size of the tile, consumed bandwidth, and imposed other penalties. The external textures feature, however, requires only the Id of the texture element to be included in the tile; the image can then be requested separately. Texture images are cached, so the image need only be requested once no matter how many tiles reference it.

Additionally, if a dimension of the external texture exceeds the client's maximum supported texture size, the image will be downsampled to adhere to that limit before being transmitted to the client.

To disable external textures, pass a `TileAdmin` to [IModelApp.startup]($frontend) with the feature disabled as follows:

```ts
  const tileAdminProps: TileAdmin.Props = { enableExternalTextures: false };
  const tileAdmin = TileAdmin.create(tileAdminProps);
  IModelApp.startup({ tileAdmin });
```

Disabling this feature will incur a performance penalty. The option to disable this feature will likely be removed in the future.

## Presentation

### Associating content items with given input

Sometimes there's a need to associate content items with given input. For example, when requesting child elements' content based on given parent keys, we may want to know which child element content item is related to which
given parent key. That information has been made available through [Item.inputKeys]($presentation-common) attribute. Because getting this information may be somewhat expensive and is needed only occasionally, it's only set
when content is requested with [ContentFlags.IncludeInputKeys]($presentation-common) flag.

### Custom category nesting

A new `requiredSchemas` attribute was added to [Ruleset]($presentation-common), [Rule]($presentation-common) and [SubCondition]($presentation-common) definitions. The attribute allows specifying ECSchema requirements for rules and avoid using them when requirements are not met. See the [schema requirements page](../learning/presentation/SchemaRequirements.md) for more details.

## Promoted APIs

The following APIs have been promoted to `public`. Public APIs are guaranteed to remain stable for the duration of the current major version of a package.

### [@bentley/bentleyjs-core](https://www.itwinjs.org/reference/bentleyjs-core)

* [ReadonlySortedArray.findEquivalent]($bentleyjs-core) and [ReadonlySortedArray.indexOfEquivalent]($bentleyjs-core) for locating an element based on a custom criterion.
* [CompressedId64Set.sortAndCompress]($bentleyjs-core) for conveniently producing a compact representation of a set of [Id64String]($bentleyjs-core)s.

### [@bentley/imodeljs-common](https://www.itwinjs.org/reference/imodeljs-common/)

* [RenderSchedule]($common) for defining scripts to visualize changes in an iModel over time.

### [@bentley/imodeljs-frontend](https://www.itwinjs.org/reference/imodeljs-frontend/)

* [LookAndMoveTool]($frontend) for using videogame-like mouse and keyboard controls to navigate a 3d view.
* [Viewport.antialiasSamples]($frontend) and [ViewManager.setAntialiasingAllViews]($frontend) for applying [antialiasing](https://en.wikipedia.org/wiki/Multisample_anti-aliasing) to make viewport images appear smoother.

### [@bentley/imodeljs-backend package](https://www.itwinjs.org/reference/imodeljs-backend)

* [TxnManager]($backend) for managing local changes to a [BriefcaseDb]($backend).
The arguments for the @beta protected static methods called during modifications have been changed to be more consistent and extensible:
* [IModelDb.generateElementGraphics]($backend) for generating [RenderGraphic]($frontend)s from [GeometricElement]($backend)s or arbitrary geometry streams.
* [IModelDb.getGeometryContainment]($backend) for computing the containment of a set of [GeometricElement]($backend)s within a [ClipVector]($geometry-core).
* [Element]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`
* [Model]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`
* [ElementAspect]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`

In addition, new protected static methods were added:
* [Element]($backend) `[onChildInsert, onChildInserted, onChildUpdate, onChildUpdated, onChildDelete, onChildDeleted, onChildAdd, onChildAdded, onChildDrop, onChildDropped]`

### [@bentley/webgl-compatibility](https://www.itwinjs.org/reference/webgl-compatibility/)

* [queryRenderCompatibility]($webgl-compatibility) for querying the client system's compatibility with the iTwin.js rendering system.

## Breaking API changes

During the course of routine improvement and stabilization of formerly `alpha` and `beta` APIs, some such APIs have changed. No breaking changes have been made to `public` APIs.

### [@bentley/imodeljs-common](https://www.itwinjs.org/reference/imodeljs-common/)

The following APIs have been replaced:

* [DisplayStyleSettings]($common):
  * `getModelPlanarClipMask`, `overrideModelPlanarClipMask`, and `dropModelPlanarClipMaskOverride`: use the `get`, `set`, and `delete` methods, respectively, of [DisplayStyleSettings.planarClipMasks]($common).
  * `onRealityModelPlanarClipMaskChanged`: use [DisplayStyleSettings.onPlanarClipMaskChanged]($common) for changes to [DisplayStyleSettings.planarClipMasks]($common) and [DisplayStyleSettings.contextRealityModels]($common)'s `onPlanarClipMaskChanged` event for [ContextRealityModel]($common)s.
* `SpatialClassificationProps` namespace: use [SpatialClassifier]($common) instead.

### [@bentley/imodeljs-frontend](https://www.itwinjs.org/reference/imodeljs-frontend/)

* Most properties and methods of [ContextRealityModelState]($frontend) have moved to its new base class, [ContextRealityModel]($common).
* The [SpatialClassifiers]($common) class has moved to imodeljs-common.
* `Viewport.setOSMBuildingDisplay` has been replaced by [DisplayStyleState.setOSMBuildingDisplay]($frontend).
* The following [DisplayStyleState]($frontend) APIs have been replaced:
  * Methods identifying [ContextRealityModel]($common)s by array index have been replaced with APIs that take a [ContextRealityModel]($common) object. If your existing code has an array index, you can use it to index into the arrays exposed by [DisplayStyleState.contextRealityModelStates]($frontend) and the `models` property of [DisplayStyleSettings.contextRealityModels]($common).
  * `getModelAppearanceOverride`, `overrideModelAppearance`, `dropModelAppearanceOverride`: use the `get`, `set`, and `delete` methods of [DisplayStyleSettings.modelAppearanceOverrides]($common).
  * `getRealityModelAppearanceOverride`, `overrideRealityModelAppearance`, `dropRealityModelAppearanceOverride`: use [ContextRealityModel.appearanceOverrides]($common).
  * `modelAppearanceOverrides`: use [DisplayStyleSettings.modelAppearanceOverrides]($common).
  * `getRealityModelPlanarClipMask`, `overrideRealityModelPlanarClipMask`, `dropRealityModelPlanarClipMask`: use [ContextRealityModel.planarClipMaskSettings]($common).

### [@bentley/imodeljs-backend](https://www.itwinjs.org/reference/imodeljs-backend/)

To make it easier to use async APIs while exporting a schema, [IModelExportHandler.onExportSchema]($backend) has been made async and must return a promise.  For example, serialization APIs can be async, and previously to have custom async schema serialization, one would have to manually synchronize around their call to [IModelExporter.exportSchemas]($backend).

[IModelTransformer.shouldExportSchema]($backend) now gets a [SchemaKey]($ecschema-metadata) schema key as argument, instead of a full [Schema]($ecschema-metadata). If you
need to check the full schema, return `true` in shouldExportSchema and in [IModelExportHandler.onExportSchema]($backend), you can use the schema object to check and then
return early.
