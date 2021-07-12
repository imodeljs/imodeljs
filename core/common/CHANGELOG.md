# Change Log - @bentley/imodeljs-common

This log was last generated on Tue, 06 Jul 2021 22:08:34 GMT and should not be manually modified.

## 2.17.1
Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0
Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Clean up and promote beta RenderMaterial and RenderTexture APIs.
- Include ECClass Ids in ChangedEntities; provide iteration via ChangedEntitiesIterable.
- Added editor apis to request and update geometry, exercised by CreateOrContinuePathTool.
- Clean up and promote DisplayStyleSettings APIs for planar clip masks and reality model appearance overrides.
- Clean up spatial classification APIs and promote to public.
- Export EmphasizeElementProps from common, deprecate from frontend.
- Corrected geographicCoordinateSystem property from GeographicCRS to GeographicCRSProps in iModelProps"
- Persist 'visible' property of map-layers.  Removed unused 'maxZoom' property on MapLayerProps.
- Made MaplayerSource independent from MapLayerProps.
- Add events for changes to IModel properties. Add RenderSchedule.ScriptBuilder for assembling a new schedule script.
- deprecate IModelVersion.evaluateChangeSet
- Changed area to extent to conform with iModelHub public API
- Promote various APIs to public. Remove useless TextureProps properties.
- Don't allow undo of changes to project extents or geolocation.
- promote BriefcaseManager to public
- Promoted GCS model to public API
- Make Ipc interfaces @public. Promote BriefcaseManager to public
- Clean up and promote beta RenderMaterial and RenderTexture APIs.
- Remove useless TextureProps properties.
- TextureLoadProps takes a maxTextureSize.
- Removed unrequired sourceEllipsoidId and targetEllipsoidId from Geodetic Transforms
- Add RenderSchedule.ScriptBuilder for assembling a new schedule script.

## 2.16.9
Tue, 06 Jul 2021 22:08:34 GMT

_Version update only_

## 2.16.8
Fri, 02 Jul 2021 17:40:46 GMT

_Version update only_

## 2.16.7
Mon, 28 Jun 2021 18:13:04 GMT

_Version update only_

## 2.16.6
Mon, 28 Jun 2021 13:12:55 GMT

_Version update only_

## 2.16.5
Fri, 25 Jun 2021 16:03:01 GMT

### Updates

- Synch map settings provider when base layer provider changes.

## 2.16.4
Wed, 23 Jun 2021 17:09:07 GMT

_Version update only_

## 2.16.3
Wed, 16 Jun 2021 20:29:32 GMT

_Version update only_

## 2.16.2
Thu, 03 Jun 2021 18:08:11 GMT

_Version update only_

## 2.16.1
Thu, 27 May 2021 20:04:22 GMT

_Version update only_

## 2.16.0
Mon, 24 May 2021 15:58:39 GMT

### Updates

- Introduced Additional Transform for Geographic Coordinate Systems
- wip: CreateElementTool. Fix not being able to pick decorations after changing files.
- Allow RenderGraphic to be created from flatbuffers format geometry as well as json.
- Fix incorrect transforms applied by schedule scripts.
- Updated map layers release tags from alpha to beta.
- Additional properties (source/target ellipsoid) and fallback transform for geodetic transforms"
- Make changed elements public and add descriptions
- Fixes to desktop/mobile authorization
- Add shader based grid display.
- Add Viewport.queryVisibleFeatures to determine the set of features currently visible in a viewport.
- Clean up RenderSchedule API.
- add placement to GeomtricElementProps

## 2.15.6
Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5
Thu, 20 May 2021 15:06:26 GMT

_Version update only_

## 2.15.4
Tue, 18 May 2021 21:59:07 GMT

_Version update only_

## 2.15.3
Mon, 17 May 2021 13:31:38 GMT

_Version update only_

## 2.15.2
Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1
Wed, 05 May 2021 13:18:31 GMT

### Updates

- FeatureOverrides can hide or override the symbology of unanimated nodes.

## 2.15.0
Fri, 30 Apr 2021 12:36:58 GMT

### Updates

- Add documentation and links for each BisCodeSpec name.
- Properly declare changeSetId variables as string.
- Promote display-related APIs.
- An ElementGraphicsRequest can supply a non-persistent geometry stream.
- Add TypeScript wrappers for ExternalSource and related classes and relationships.
- Fixes to desktop and iOS apps.
- ClipStyle supports recolorization. Promote ModelClipGroups to public.
- Promote thematic display API to public.
- Optimize reality model processing.
- Remove deprecated ElementEditor that was replaced by EditCommands.
- rename (deprecate) BriefcaseIdValue.Standalone to BriefcaseIdValue.Unassigned to reduce confusion
- Update release tags.
- Add support for forwarding txn events from backend to frontend.
- Update api tags

## 2.14.4
Thu, 22 Apr 2021 21:07:33 GMT

_Version update only_

## 2.14.3
Thu, 15 Apr 2021 15:13:16 GMT

_Version update only_

## 2.14.2
Thu, 08 Apr 2021 14:30:09 GMT

_Version update only_

## 2.14.1
Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0
Fri, 02 Apr 2021 13:18:42 GMT

### Updates

- added BriefcaseIdValue
- rework Authentication to use IpcHost
- add `bindings` member to EntityQueryParams
- Support working in world coords with ElementGeometry.Builder/Iterator. Place line string using ipc command.
- Add IpcAppFunctions.queryConcurrency.
- Memory leak fix
- Decouple requesting tile content from cloud storage and from backend.
- Support for transient errors

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Clarify and expand FeatureOverrides documentation.
- The `Code` constructor now trims leading and trailing whitespace characters from the `value` property
- The Code.getValue method has been deprecated in favor of the Code.value property
- Fixed broken double angle bracket link syntax
- refactor IModelApp/IModelHost startup
- Add planar clip mask support.
- Updated to use TypeScript 4.1
- Undo/Redo shortcuts
- begin rename project from iModel.js to iTwin.js

## 2.12.3
Mon, 08 Mar 2021 15:32:00 GMT

_Version update only_

## 2.12.2
Wed, 03 Mar 2021 18:48:52 GMT

_Version update only_

## 2.12.1
Tue, 23 Feb 2021 20:54:45 GMT

### Updates

- Persist the time point used to compute solar light direction in LightSettingsProps.

## 2.12.0
Thu, 18 Feb 2021 22:10:13 GMT

### Updates

- Deprecate detachChangeCache()
- Implement external textures for iModel tiles.
- Moved username/password from MapLayerProps to MapLayerSettings. Raise the 'onMapImageryChanged' event when ever Map imagery is synced.
- add ResponseHandler for notifications from backend to frontend
- Mobile IPC fix
- Mobile IPC fix
- add IpcSocket
- remove IpcInterface, getVersion() method is not needed

## 2.11.2
Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1
Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0
Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Fix brep DataProps to/from flatbuffer to account for base64 string header.
- Element geometry creation by brep operations.
- add EditCommand
- Improve ElementGeometry documentation.
- Remove assertion in supplyPathForOperation when defaulting changeSetId.
- Introduced the the Geographic Coordinate System classes and plugged in the Imodel props.
- Separated out API to upgrade iModels.
- Remove unused trueWidth and trueStart properties from GraphicParams.
- Add option to SectionDrawingProps specifying the spatial view should be drawn in the context of the drawing view.
- Support for section-cut graphics.
- Version compare property checksums
- Add change events to DisplayStyleSettings and ViewDetails.

## 2.10.3
Fri, 08 Jan 2021 18:34:03 GMT

_Version update only_

## 2.10.2
Fri, 08 Jan 2021 14:52:02 GMT

_Version update only_

## 2.10.1
Tue, 22 Dec 2020 00:53:38 GMT

_Version update only_

## 2.10.0
Fri, 18 Dec 2020 18:24:01 GMT

### Updates

- Update minimum Node version to 10.17.0
- Fix cartographicRange computation. The 8 corners are calculated in the ECEF coordinate system but I think they should be calculated in the spatial coordinate system and then converted to ECEF.
- Support compact representation of DisplayStyleSettings.excludedElements.
- Added ElementGeometry.Builder and ElementGeometry.Iterator.
- export ModelLoadProps
- Support display of OSM Buildings.
- Version compare top parents ChangedElements update

## 2.9.9
Sun, 13 Dec 2020 19:00:03 GMT

_Version update only_

## 2.9.8
Fri, 11 Dec 2020 02:57:36 GMT

_Version update only_

## 2.9.7
Wed, 09 Dec 2020 20:58:23 GMT

### Updates

- Fix cartographicRange computation. The 8 corners are calculated in the ECEF coordinate system but I think they should be calculated in the spatial coordinate system and then converted to ECEF.

## 2.9.6
Mon, 07 Dec 2020 18:40:48 GMT

_Version update only_

## 2.9.5
Sat, 05 Dec 2020 01:55:56 GMT

### Updates

- Bump Tile Version to 18

## 2.9.4
Wed, 02 Dec 2020 20:55:40 GMT

_Version update only_

## 2.9.3
Mon, 23 Nov 2020 20:57:56 GMT

_Version update only_

## 2.9.2
Mon, 23 Nov 2020 15:33:50 GMT

_Version update only_

## 2.9.1
Thu, 19 Nov 2020 17:03:42 GMT

_Version update only_

## 2.9.0
Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- add accessKey prop to MapLayerSettings
- Preliminary support for interactive editing sessions.
- Refactor for push events.
- Fix KeyColor equality comparison.
- GeometryStream query and update using flatbuffer schema.
- Support for push events

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

### Updates

- Visibility of sublayers named groups is no longer inherited by children.
- Support down-sampling very large textures in tiles.
- Add IModelTileRpcInterface.queryVersionInfo().
- Add support for OPC point clouds in Reality Data widget.
- Added color mix to thematic display for background map terrain and point clouds

## 2.7.6
Wed, 11 Nov 2020 16:28:23 GMT

_Version update only_

## 2.7.5
Fri, 23 Oct 2020 16:23:50 GMT

_Version update only_

## 2.7.4
Mon, 19 Oct 2020 17:57:01 GMT

### Updates

- Update Access-Control header values

## 2.7.3
Wed, 14 Oct 2020 17:00:59 GMT

_Version update only_

## 2.7.2
Tue, 13 Oct 2020 18:20:38 GMT

_Version update only_

## 2.7.1
Thu, 08 Oct 2020 13:04:35 GMT

_Version update only_

## 2.7.0
Fri, 02 Oct 2020 18:03:32 GMT

### Updates

- Add documentation for ContextRealityModelProps.
- Fix calculation of cartographic range.
- Fixes to front end methods to pull, merge and push.
- Fixed desktop authorization after recent changes.
- Update Tile version due to changes to indexes for tesselated polylines
- On iOS download in background
- Introduce NoContentError (transmitted via 204)
- Support thematic display of point clouds.
- fixed display of isolines mode

## 2.6.5
Sat, 26 Sep 2020 16:06:34 GMT

### Updates

- changed elements properties for version compare

## 2.6.4
Tue, 22 Sep 2020 17:40:07 GMT

_Version update only_

## 2.6.3
Mon, 21 Sep 2020 14:47:09 GMT

_Version update only_

## 2.6.2
Mon, 21 Sep 2020 13:07:44 GMT

_Version update only_

## 2.6.1
Fri, 18 Sep 2020 13:15:09 GMT

_Version update only_

## 2.6.0
Thu, 17 Sep 2020 13:16:12 GMT

### Updates

- run with nodeIntegration=false for Electron
- Moved ESLint configuration to a plugin
- Add API to compute tile chord tolerance.

## 2.5.5
Wed, 02 Sep 2020 17:42:23 GMT

_Version update only_

## 2.5.4
Fri, 28 Aug 2020 15:34:15 GMT

_Version update only_

## 2.5.3
Wed, 26 Aug 2020 11:46:00 GMT

_Version update only_

## 2.5.2
Tue, 25 Aug 2020 22:09:08 GMT

_Version update only_

## 2.5.1
Mon, 24 Aug 2020 18:13:04 GMT

_Version update only_

## 2.5.0
Thu, 20 Aug 2020 20:57:09 GMT

### Updates

- Introduce IModelApp security options (including CSRF protection).
- Allow WebAppRpcRequest consumers to supply custom fetch and Request.
- Move types from FeatureSymbology namespace from imodeljs-frontend to imodeljs-common.
- Use IModelRoutingContext
- Added mobile oidc client
- Support reality model transparency
- element editor
- Switch to ESLint

## 2.4.2
Fri, 14 Aug 2020 16:34:09 GMT

### Updates

- Deprecate TerrainProps.nonLocatable and TerrainSettings.locatable in favor of corresponding properties on BackgroundMapProps and BackgroundMapSettings.
- Add support for restart query

## 2.4.1
Fri, 07 Aug 2020 19:57:43 GMT

### Updates

- add missing rbac-client dep
- Fixes for map transparency.  Do not set base layer transparency when overall transparency is modified.  Keep layers in synch when settings change.

## 2.4.0
Tue, 28 Jul 2020 16:26:24 GMT

### Updates

- Add Map Layer Settings.
- iModelHub permissions handler

## 2.3.3
Thu, 23 Jul 2020 12:57:15 GMT

### Updates

- Fix regression that could result in increased number of tile requests.

## 2.3.2
Tue, 14 Jul 2020 23:50:36 GMT

_Version update only_

## 2.3.1
Mon, 13 Jul 2020 18:50:14 GMT

_Version update only_

## 2.3.0
Fri, 10 Jul 2020 17:23:14 GMT

### Updates

- geometry clip containment
- Add ability to create selective overrides from display style settings, and apply the overrides to another settings.
- Fix orientation of Ecef.createFromCartographicOrigin
- Add non-locatable flag to TerrainSettings.
- Setup BriefcaseDb.open() to allow profile and domain schema validation and upgrades.
- Support for multiple RPC interface clients and attaching interfaces after startup.
- Add function to convert solar angles to solar direction.
- enforce max texture size for stepped gradients.
- New thematic gradient modes implemented and documented: Stepped, SteppedWithDelimiter, and IsoLines

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Promote Gradient and GraphicParams to public API.
- Add support for cel-shaded views; promote many APIs, particularly display-related ones.
- Map GeoCoordStatus to GeoServiceStatus so that it can be returned as error code in a RPC without colliding with existing codes.
- Add Props interface
- Move linear referencing domain types out to new @bentley/linear-referencing-common package.
- Add support for applying different clip volumes to groups of models in a spatial view.
- Add PhysicalElementProps
- Add PhysicalTypeProps
- Fixes for unhandled promise rejections in RPC layer
- Update to BisCore.01.00.11: Add SectionDrawingProps; deprecate SectionLocationProps in favor of SectionDrawingLocationProps.
- Switching from JSC to V8

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Improved log message written on rpc error
- Change default origin mode for terrain to Geodetic.
- Fix transforms for creating and querying part instance geometry in world coordinate.
- channel rules
- Optimize thematic sensor display by culling sensors based on a distanceCutoff property on ThematicDisplaySensorSettings.

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- add freeze method and degrees accessors to Cartographic class
- Show min/max window error for mouse wheel zoom.
- Show min/max window error for mouse wheel zoom.
- Make animation state of a display style persistent.
- Send a default pending message since Azure strips content-type header if no data is present
- Monitor progress of downloading briefcases, ability to cancel download of briefcases.
- Added to DisplayStyle3dSettings: MonochromeMode, LightSettings.
- Simplify GeometryStreamIteratorEntry (breaking API change).
- constructor of ColorDef wasn't setting transparency properly for rgba() strings
- added ColorDef.toRgbaString
- Deprecate members of SectionLocationProps pending refactor.
- Support for progress/cancel from ios
- EcefLocation can now optionally preserve a meaningful cartographic origin.
- Fix for electron request lifecycle.
- IModelTokenProps.key is now a required member
- Include model extents with ViewStateProps for drawing views.
- hsl color conversion wasn't working if s===0
- Remove deprecated APIs; see NextVersion.md for details.
- Fix documentation of RenderSchedule time units.
- Fix for EcefLocation.createFromCartographicOrigin.
- ColorDef, HSVColor, and HSLColor are immutable types.
- react to changes in imodeljs-clients
- Promote properties from IModelToken onto IModel
- Support suspend/resume in mobile apps.
- Store current mobile RPC port in protocol.
- Added file size.
- Supply RPC routing props for SnapshotIModelRpcInterface open methods"
- MobileRpcConfiguration throws exception
- Added NativeApp.deleteBriefcase, avoided authorization exceptions when offline.
- Refactored NativeApp API and RPC interfaces. This continues to be WIP.
- Added DownloadBriefcaseOptions and OpenBriefcaseOptions as parameters to the download/open calls for a briefcase.
- Added new interface for native app
- VSTS#217447, 162382: Cleanups to implementation of downloading/opening/discovering briefcases in native applications (WIP).
- Handle null JSON in ViewDetails.
- Renamed OIDC constructs for consistency; Removed SAML support.
- OrbitGT point cloud interface.
- Support OrbitGT Point Clouds
- Fix BackgroundMapSettings.toJSON() discarding the 'useDepthBuffer' flag.
- Add mechanism for preloading reality tiles by frustum.
- react to new clients packages from imodeljs-clients
- IModelRpcProps replaces IModelToken and IModelTokenProps
- Change RenderTexture.Type to a non-const enum
- Remove 'const' from exported enums.
- Remove check for contextId in BentleyCloudRpcProtocol since remote snapshots are now possible.
- "Default to text if no content-type in RPC request handling.
- React to BentleyCloudRpcManager change.
- Track active RPC requests
- RPC fix
- Upgrade to Rush 5.23.2
- support for editing
- Add API for thematic display.
- Alpha feature: thematic sensor display.
- Rename GlobeMode: ThreeD => Ellipsoid, Columbus => Plane.
- Remove support for the iModel.js module system by no longer delivering modules.
- Add a ViewFlag to control white-on-white reversal.

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- MobileRpc throw exception

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Bump tile format version.
- iModel write API development
- Fix issue with constructing the tile cache URL() on Safari.
- Prevent reuse of cached tiles after project extents change.
- VSTS#256133: Fixed issue with reopening connections if the backend crashes. Fixes to integration tests.
- Define ViewDetails for manipulating optional detail settings of ViewDefinition and ViewState.
- Add support for plan projection models with 3d display priority.
- Add settings to control display of plan projection models.
- Add PlanProjectionSettings.enforceDisplayPriority.

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Simplify iterator for QPoint3dList.
- Native apps can now cancel tile requests in progress on the backend.
- Remove echo test function from devTools
- Clean up documentation modules; add PlanProjectionSettings for display styles.
- Allow outline fill to be specified by subcategory appearance.
- Upgrade to TypeScript 3.7.2.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Added support for embedding images in a GeometryStream.
- Moving data-holder structures used during the LinearElement.queryLinearLocations API to imodeljs-common.
- Allow events to be sent from backend to frontend
- Renamed EventSourceRpcInterface to NativeAppRpcInterface
- Moved tile IO-related APIs from frontend to common.

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Added Tween.js code
- Added AliCloud tile cache service
- Code quality report fixes
- Fix warnings from static analysis
- Add PropertyMetaData.isNavigation
- Addressing typo in a couple of members, making them match the schema properly.

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Option to include part references in GeometrySummary output.
- Added missing topic descriptions
- Fix defect where isMobileBackend return true on windows
- Change terrain lighting default to off.
- Change SectionLocationProps.clipGeometry type to string. Add get/set ClipVector methods on SectionLocation.
- Mark bias as alpha
- Update to allow Node 12
- Add support for view-independent display of geometry streams.
- Fixed camera.equals

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Anisotropic filtering of draped map tiles.
- Tweaks to ambient occlusion settings.
- Callout clip is now local to placement. Only show marker for active clip.
- Cleanup AO settings.
- Remove @deprecated tags in GeometryStreamIteratorEntry
- Fix comparison of classification properties ignoring the 'volume' flag.
- Fixes for making volume classifiers work.
- New wip plugin for hypermodeling support.
- Add CommonLoggerCategory.Geometry
- Add Placement2d.multiplyTransform, Placement3d.multiplyTransform
- Add RelatedElement.none for nulling out existing navigation relationships
- Reacting to iPadOS change in user agent of safari
- Remove limit for binary data for mobile
- Expose FrustumPlanes.planes
- Convenience methods for overriding aspects of hidden line styles.

## 1.6.0
Wed, 09 Oct 2019 20:28:42 GMT

### Updates

- Add GeometricModel3dProps
- Add SectionLocationProps
- Remove no-longer-needed mobile RPC chunk size workaround for mobile backends.
- Fixed multiple viewport shadows

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- Added support for blank IModelConnections
- Fixed reporting of errors when the ClientRequestContext is established at the backend.
- Add DisplayStyleSettings.subCategoryOverrides
- Make ExternalSourceAspectProps.checksum optional
- Added geometry primitive typing and geometry summary types
- Support animation of models within RenderSchedule.
- Refine planar projection frustum calculation
- Upgrade to TypeScript 3.6.2

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

### Updates

- Add documentation for RenderSchedule
- Fix casing of displayStyle.contextRealityModels
- Fixed reporting of errors when the ClientRequestContext is established at the backend.
- Electron IPC transport fix for large messages.
- Added ability to clear individual overridden flags in ViewFlag.Overrides.

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Add optional arguments to EcefLocation.createFromCartographicOrigin
- Allow custom tile cache services.
- Add CodeSpec.isManagedWithIModel, CodeSpec.scopeType, deprecate CodeSpec.specScopeType
- Add CodeSpec.create
- Add terrain settings.
- Require electron without eval trick.
- Log more information during RPC trace/info request logging.
- Changed the transfer chunk size for mobile RPC transport.

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

### Updates

- Added option to restrict tile cache URLs by client IP address.
- Added method to get element mass properties.

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Add support for applying terrain to background map.
- Minor error fixed.
- Initial implementation of the LinearReferencing typescript domain
- Adding domain classes for all relationships in the LinearReferencing schema.
- Update to TypeScript 3.5

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- RPC system now accepts only basic values (primitives, "interface" objects, and binary).
- Add ExternalSourceAspectProps
- Refactored and simplified implementation of IModelDb.open
- Rename terrain to backgroundMap.
- Retire some tile-related feature gates.
- Introduced tile format v4.0

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Support spatial classification of context reality models.
- Added OpenAPIInfo to the barrel file
- Adds parameter for api-extractor to validate missing release tags
- Adds ignoreMissingTags flag
- Added option to use azure-based tile caching
- Added a utility to diagnose backends
- Do not cache pending http responses.
- Allow a view to define a set of elements which should never be drawn in that view.
- Allow snapshot imodeltokens through bentleycloudrpcprotocol in development mode only.
- Fix broken links
- LoggerCategory -> CommonLoggerCategory
- Fix default line pattern for hidden edges.
- Introduce LoggerCategory enum to advertise logger categories used by this package.
- Logging fixes.
- Put sourcemap in npm package.
- Add SVG to ImageSourceFormat
- Add imodeljs-markup
- New tile cache naming scheme.
- queryPage use memoization/pending pattern
- Remove StandaloneIModelRpcInterface
- Setup a generic context for tracking client requests, and made various related enhancements to logging, usage tracking and authorization.
- Prefer the IModelToken values in the url (if different from values in JSON body -- should never happen except in a malicious request).
- Exports interface MarshalingBinaryMarker to prevent errors in api-extractor V7
- Add SnapshotIModelRpcInterface
- Refactor solar shadow settings - make these 3d only.
- Support solar shadow display.
- Simplified tile caching IModelHost config and removed dev flags. Allow browser caching of tiles
- Upgrade TypeDoc dependency to 0.14.2
- Only save viewing volume for view undo rather than cloning ViewState

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Cleaned up documentation related to the display system.
- Rename PagableECSql interface to PageableECSql to fix spelling error
- Documentation for Skybox

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Allow to check if frontend is ios wkwebview
- Allow subclasses of Range to use static methods
- Changes package.json to include api-extractor and adds api-extractor.json
- Update docs for BRepEntity.DataProps
- Use new buildIModelJsBuild script
- AxisAlignedBox and ElementAlignedBox are now typed to Range3d rather than classes
- clone methods are no longer generic
- Add release tags to indicate API stability
- Handle transforms on child tiles.
- Optimize use of animation cutting planes.
- Remove unneeded typedoc plugin dependency
- Add support for draco compressed meshes.
- Consistent naming of "get" methods in Growable arrays.
- Added spatial <-> cartographic methods that check/use the geographic coordinate system before using ecef location.
- update for geometry GrowableXYArray usage
- Add material props classes
- Defer loading of edges until needed
- Save BUILD_SEMVER to globally accessible map
- Implemented spatial criterai when searching through all reality data associated to a project.
- Optimize containment test with spheres.
- Move the IModelUnitTestRpcInterface into the testbed and out of the public AP
- Renamed constructor variable in RpcConfiguration and RpcRequest
- Support for sending large RPC binary payloads in configurable chunks.
- Remove loadNativeAsset and formatElements RPC calls from the IModelReadRpcInterface
- Removed IModelConnection.connectionId, added IModelApp.sessionId
- Tile requests can optionally specify a retryInterval.
- Upgrade to TypeScript 3.2.2

## 0.188.0
Wed, 16 Jan 2019 16:36:09 GMT

### Updates

- Changed Elements Db support for addon changes and generating the changed elements cache. Added WipRpcInterface methods to get changed elements list and check if a changeset is processed in the cache. Bumped WipRpcInterface version. Integration tests for changed elements db.
- Fix error in semver parsing.

## 0.187.0
Tue, 15 Jan 2019 15:18:59 GMT

_Version update only_

## 0.186.0
Mon, 14 Jan 2019 23:09:10 GMT

### Updates

- Removed IModelDb's cache of accessToken. For long running operations like AutoPush, the user must explicitly supply an IAccessTokenManager to keep the token current.
- Add TextureProps for use by new backend Texture API.

## 0.185.0
Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0
Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Add support for general 3d tilesets.
- Fix drag select decorator when cursor moves out of view. Doc fixes.

## 0.183.0
Mon, 07 Jan 2019 21:49:21 GMT

### Updates

- Add ambient occlusion structures.
- Change iModelReadRpcInterface version because Geocoordinate calculation methods added.

## 0.182.0
Mon, 07 Jan 2019 13:31:34 GMT

_Version update only_

## 0.181.0
Fri, 04 Jan 2019 13:02:40 GMT

_Version update only_

## 0.180.0
Wed, 02 Jan 2019 15:18:23 GMT

### Updates

- Do not send X-Application-Version header if empty.
- Add path pivot data to render schedule

## 0.179.0
Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Log context and imodel ids as separate properties. Surface interface and operation names in logging title.

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0
Wed, 12 Dec 2018 17:21:31 GMT

_Version update only_

## 0.176.0
Mon, 10 Dec 2018 21:19:45 GMT

### Updates

- New signature for RpcInterface.forward

## 0.175.0
Mon, 10 Dec 2018 17:08:55 GMT

_Version update only_

## 0.174.0
Mon, 10 Dec 2018 13:24:09 GMT

_Version update only_

## 0.173.0
Thu, 06 Dec 2018 22:03:29 GMT

### Updates

- Custom imodelJs noDirectImport lint rule implemented, noDuplicateImport lint rule turned on.

## 0.172.0
Tue, 04 Dec 2018 17:24:39 GMT

### Updates

- Changed index file name to match package name. Change imports to use other packages' index file.

## 0.171.0
Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- Polyfill URLSearchParams for edge.
- Front end "read pixels" can now provide subCategoryId and GeometryClass to backend.

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- Fix GeometryParams constructor. Added test to ensure subcategory id set correctly.
- Remove dependency on 'window'-named global object.

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- GeometryStream markdown

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

_Version update only_

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

### Updates

- Add CartographicRange
- Use URL query instead of path segment for cacheable RPC request parameters.
- Updated Mobile RPC to deal with binary data
- Temporarily disable tile caching.

## 0.166.0
Mon, 12 Nov 2018 16:42:10 GMT

_Version update only_

## 0.165.0
Mon, 12 Nov 2018 15:47:00 GMT

_Version update only_

## 0.164.0
Thu, 08 Nov 2018 17:59:20 GMT

### Updates

- Fix JSON representation of display styles.
- GeoJson and Analysis Importer simplification
- ModelSelectorProps, CategorySelectorProps, and DisplayStyleProps now properly extend DefinitionElementProps
- Support displacement scale for PolyfaceAuxData
- Do not diffentiate between backend provisioning and imodel downloading state in RPC wire format (202 for all).
- Updated to TypeScript 3.1

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- Fully support mixed binary and JSON content in both directions in RPC layer. RPC system internal refactoring. Basic support for cacheable RPC requests.
- Remove unused RpcInterface methods, move WIP methods

## 0.162.0
Wed, 24 Oct 2018 19:20:06 GMT

### Updates

- Added view decoration examples to docs.
- Make ToolAdmin.defaultTool. public. Allow getToolTip to return HTMLElement | string.
- Breaking changes to optimize usage of 64-bit IDs.
- Remove unused createAndInsert methods from IModelWriteRpcInterface
- Correctly parse RPC interface versions with zero major component.
- Add RpcInterface versioning documentation

## 0.161.0
Fri, 19 Oct 2018 13:04:14 GMT

_Version update only_

## 0.160.0
Wed, 17 Oct 2018 18:18:38 GMT

_Version update only_

## 0.159.0
Tue, 16 Oct 2018 14:09:09 GMT

_Version update only_

## 0.158.0
Mon, 15 Oct 2018 19:36:09 GMT

_Version update only_

## 0.157.0
Sun, 14 Oct 2018 17:20:06 GMT

_Version update only_

## 0.156.0
Fri, 12 Oct 2018 23:00:10 GMT

### Updates

- Initial release

