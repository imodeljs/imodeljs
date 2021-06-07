# 2.16.0 Change Notes

Overview:

- [Promoted APIs](#promoted-apis)
- Breaking Changes:
  - [Breaking API changes](#breaking-api-changes)
- [Obtaining element geometry on the frontend](#obtaining-element-geometry-on-the-frontend)
- Visualization
  - [Clipping enhancements](#clipping-enhancements)
    - [Colorization](#colorization)
    - [Model clip groups](#model-clip-groups)
    - [Nested clip volumes](#nested-clip-volumes)
  - [Grid display enhancements](#grid-display-enhancements)
  - [Schedule script enhancements](#schedule-script-enhancements)
  - [Querying visible elements](#querying-visible-elements)
  - [Creating graphics](#creating-graphics)
  - [Map tile trees refactoring](#map-tile-trees-refactoring)
- [Presentation](#presentation-changes)
  - [InstanceLabelOverride enhancements](#instancelabeloverride-enhancements)
  - [Custom category renderers](#custom-category-renderers)
  - [Custom category nesting](#custom-category-nesting)
  - [Presentation rule schema requirements](#presentation-rule-schema-requirements)

## Obtaining element geometry on the frontend

Until now, an element's [GeometryStreamProps]($common) was only available on the backend - [IModelConnection.Elements.getProps]($frontend) always omits the geometry. [IModelConnection.Elements.loadProps]($frontend) has been introduced to provide greater control over which properties are returned. It accepts the Id, federation Guid, or [Code]($common) of the element of interest, and optionally an [ElementLoadOptions]($common) specifying which properties to include or exclude. For example, the following code queries for and iterates over the geometry of a [GeometricElement3d]($backend):

```ts
  function printGeometryStream(elementId: Id64String, iModel: IModelConnection): void {
    const props = await iModel.elements.loadProps(elementId, { wantGeometry: true }) as GeometricElement3dProps;
    assert(undefined !== props, `Element ${elementId} does not exist`);
    const iterator = GeometryStreamIterator.fromGeometricElement3d(props);
    for (const entry of iterator)
      console.log(JSON.stringify(entry));
  }
```

Keep in mind that geometry streams can be extremely large. They may also contain data like [BRepEntity.DataProps]($common) that cannot be interpreted on the frontend; for this reason BRep data is omitted from the geometry stream, unless explicitly requested via [ElementLoadOptions.wantBRepData]($common).

## Clipping enhancements

The contents of a [ViewState]($frontend) can be clipped by applying a [ClipVector]($geometry-core) to the view via [ViewState.setViewClip]($frontend). Several enhancements have been made to this feature:

### Colorization

[ClipStyle.insideColor]($common) and [ClipStyle.outsideColor]($common) can be used to colorize geometry based on whether it is inside or outside of the clip volume. If the outside color is defined, then that geometry will be drawn in the specified color instead of being clipped. These properties replace the beta [Viewport]($frontend) methods `setInsideColor` and `setOutsideColor` and are saved in the [DisplayStyle]($backend).

### Model clip groups

[ModelClipGroups]($common) can be used to apply additional clip volumes to groups of models. Try it out with an [interactive demo](https://www.itwinjs.org/sample-showcase/?group=Viewer+Features&sample=swiping-viewport-sample). Note that [ViewFlags.clipVolume]($common) applies **only** to the view clip - model clips apply regardless of view flags.

### Nested clip volumes

Clip volumes now nest. For example, if you define a view clip, a model clip group, and a schedule script that applies its own clip volume, then geometry will be clipped by the **intersection** of all three clip volumes. Previously, only one clip volume could be active at a time.

## Grid display enhancements

The planar grid that is displayed when [ViewFlags.grid]($common) is now displayed with a shader rather than as explicit geometry.  This improved the overall appearance and efficiency of the grid display and corrects several anomalies when grid display was unstable at the horizon of a perspective view.  The view frustum is now expanded as necessary when grids are displayed to avoid truncating the grid to the displayed geometry.

## Schedule script enhancements

The [RenderSchedule]($common) API for defining how to animate the contents of a view over time has been cleaned up and expanded. A new [RenderTimeline]($backend) element class has been introduced with version 1.0.13 of the BisCore ECSchema, to host a [RenderSchedule.Script]($common). `DisplayStyleSettings.scheduleScriptProps` has been deprecated in favor of [DisplayStyleSettings.renderTimeline]($common) specifying the Id of the RenderTimeline element hosting the script to be applied to the display style. A [DisplayStyleState]($frontend)'s schedule script is now loaded asynchronously via [DisplayStyleState.load]($frontend) - this is done automatically by [ViewState.load]($frontend) but must be done manually for display styles obtained through other means.

Sometimes it is useful to make the elements animated by the script more visible by de-emphasizing elements unaffected by the script. The appearance of non-animated elements can now be controlled by [EmphasizeElements.unanimatedAppearance]($frontend).

## Querying visible elements

The new `@beta` API [Viewport.queryVisibleFeatures]($frontend) can be used to determine the set of [Feature]($common)s - typically, elements - that are currently visible in the viewport. The API offers a choice between two criteria that can be used to determine visibility:

- The feature lit up at least one pixel on the screen. Pixels drawn behind other, transparent pixels are not included in this criterion. Pixel-based queries can be constrained to a sub-region of the viewport.
- The feature is included in at least one [Tile]($frontend) currently being displayed by the viewport. By this criterion, if a [ClipVector]($geometry-core) is clipping the contents of the viewport, a feature contained in a tile that intersects the clip volume is considered visible even if the feature's geometry would be completely clipped out.

## Creating graphics

The new [GraphicBuilderOptions]($frontend) makes it easier to create a [GraphicBuilder]($frontend) and enables some additional features. [DecorateContext.createGraphic]($frontend) and [RenderSystem.createGraphic]($frontend) have been added, superseding [DecorateContext.createGraphicBuilder]($frontend) and [RenderSystem.createGraphicBuilder]($frontend). Each accepts a GraphicBuilderOptions specifying only those aspects of the GraphicBuilder that the caller wishes to customize. In particular, the behavior of pickable decorations can be customized using [GraphicBuilderOptions.pickable]($frontend):

- [PickableGraphicOptions.noHilite]($frontend) and [PickableGraphicOptions.noFlash]($frontend) can prevent pickable graphics from being flashed and/or hilited by tools.
- [PickableGraphicOptions.locateOnly]($frontend) allows a pickable graphic to be located by tools but not drawn to the screen.

## Map tile trees refactoring

The map tile trees have been moved from [DisplayStyleState]($frontend) to [Viewport]($frontend).  This enables the maps to be maintained correctly when viewports are synchronized.  This will primarily not affect applications except calls to [ViewState.areAllTileTreesLoaded]($frontend) should replaced with [Viewport.areAllTileTreesLoaded]($frontend) if the map tile trees should be tested.

## Presentation changes

### InstanceLabelOverride enhancements

The [InstanceLabelOverride]($presentation-common) rule was enhanced with abilities to compose label using related instance values:

- A `propertySource` attribute was added to [InstanceLabelOverridePropertyValueSpecification]($presentation-common) to allow picking a
property value from a related instance.

- A new [InstanceLabelOverrideRelatedInstanceLabelSpecification]($presentation-common) was added to allow taking label of a related
instance. The related instance, possibly being a of a different ECClass, might have some different label overrides of its own.

### Custom category renderers

[VirtualizedPropertyGrid]($ui-components) now allows developers to fully customize displayed category contents, if the category is assigned a custom renderer via Presentation Rules. You can read more about that in our [Category customization learning page](../learning/presentation/Customization/PropertyCategoryRenderers.md).

### Custom category nesting

A new `parentId` attribute was added to [PropertyCategorySpecification]($presentation-common) to provide nesting abilities. See more details in our [property categorization page](../learning/presentation/Content/PropertyCategorization.md#category-nesting).

### Presentation rule schema requirements

A new `requiredSchemas` attribute was added to [Ruleset]($presentation-common), [Rule]($presentation-common) and [SubCondition]($presentation-common) definitions. The attribute allows specifying ECSchema requirements for rules and avoid using them when requirements are not met. See the [schema requirements page](../learning/presentation/SchemaRequirements.md) for more details.

## Promoted APIs

The following APIs have been promoted to `public`. Public APIs are guaranteed to remain stable for the duration of the current major version of a package.

### [@bentley/webgl-compatibility](https://www.itwinjs.org/reference/webgl-compatibility/)

- [queryRenderCompatibility]($webgl-compatibility) for querying the client system's compatibility with the iTwin.js rendering system.
- [WebGLRenderCompatibilityInfo]($webgl-compatibility) for summarizing the client system's compatibility.
- [WebGLFeature]($webgl-compatibility) for enumerating the required and optionals features used by the iTwin.js rendering system.
- [WebGLRenderCompatibilityStatus]($webgl-compatibility) for describing a general compatibility rating of a client system.
- [GraphicsDriverBugs]($webgl-compatibility) for describing any known graphics driver bugs for which iTwin.js will apply workarounds.
- [ContextCreator]($webgl-compatibility) for describing a function that creates and returns a WebGLContext for [queryRenderCompatibility]($webgl-compatibility).

## Breaking API changes

### @bentley/imodeljs-backend package

The arguments for the @beta protected static methods called during modifications have been changed to be more consistent and extensible:

- [Element]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`
- [Model]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`
- [ElementAspect]($backend) `[onInsert, onInserted, onUpdate, onUpdated, onDelete, onDeleted]`

In addition, new protected static methods were added:

- [Element]($backend) `[onChildInsert, onChildInserted, onChildUpdate, onChildUpdated, onChildDelete, onChildDeleted, onChildAdd, onChildAdded, onChildDrop, onChildDropped]`
- [Model]($backend) `[onInsertElement, onInsertedElement, onUpdateElement, onUpdatedElement, onDeleteElement, onDeletedElement]`

The following method is now `async` to make it easier to integrate with asynchronous status and health reporting services:

- [IModelExportHandler.onProgress]($backend)

### @bentley/ecschema-metadata package

Properties getter in @beta [ECClass]($ecschema-metadata) has been changed to return an iterator of properties instead of an array of properties.
Array indexing and properties like .length will no longer work with the returned iterator, so you may need to create an array from the iterator or use its .next() method. Iterating with for...of loop works the same with iterator as before with an array.\
This change is made because internally properties are now stored in a map instead of an array, and it is more efficient to return an iterator for the properties to be generated on demand than to create them on the getter.
