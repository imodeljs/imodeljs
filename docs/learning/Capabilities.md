---
ignore: true
---

# Capabilities of iTwin.js

[iTwin.js](http://itwinjs.org) is an open source platform for creating, querying, modifying, and displaying Infrastructure Digital Twins that are comprised of many federated sources of information. iTwin.js provides a framework for creating immersive applications that generate, connect, analyze, and visualize that information. It is designed to be as open and flexible, to be as widely applicable as possible.

This document describes the high-level capabilities of iTwin.js so you can determine its suitability for your needs.

Not all capabilities are at the same maturity level, the key below explains the levels.

| Value | Meaning
| ----- | -----------
| ✔️️ | Released (public)
| 👷| Under active development (alpha / beta)
| 🎫 | Future (planned)
| ❌ | Not supported

## Opening iModels

There are two forms of iModels:

1. ✔️️ Briefcase iModels synchronize with iModelHub and have a ChangeSet Timeline
2. ✔️️ [Snapshot iModels](./backend/AccessingIModels.md) are static, read-only (conceptually similar to PDF), are not synchronized, and have no timeline

### iModelHub

[iModelHub](./iModelHub/index) is the control center for Briefcase iModels and manages:

- ✔️️ Authenticating access to iModels
- ✔️️ Synchronization with the ChangeSet [Timeline](./iModelHub/index.md#the-timeline-of-changes-to-an-iModel)
- ✔️️ [Named Versions](./iModelHub/versions.md)

### BIS Classes

The contents of an iModel are defined by [BIS](../bis/index.md) classes.

- ✔️️ [Elements](../bis/intro/element-fundamentals.md)
- ✔️️ [ElementAspects](../bis/intro/elementaspect-fundamentals.md)
- ✔️️ [Models](../bis/intro/model-fundamentals.md)
- ✔️️ [Relationships](../bis/intro/relationship-fundamentals.md)
- ✔️️ Subjects and Partitions which form the [information hierarchy](../bis/intro/information-hierarchy.md)
- ✔️️ [Categories](../bis/intro/categories.md)

### GeoLocation

Determine the [location and orientation](./GeoLocation.md) of an iModel on the earth.

- ✔️️ Linear ECEF transformation
- ✔️️ GeoGraphic Coordinate System (GCS)
- ✔️️ Global Origin
- ✔️️ Project Extents
- ✔️️ Cartographic points

## Querying iModels

Information may be efficiently queried from an iModel:

- ✔️️ in its raw form via [ECSQL](./ECSQL.md)
- ✔️️ in pre-formatting values via [Presentation Rules](../../presentation/learning/index.md)

## Visualization

Create 2d and 3d views on HTML pages that show graphics from multiple sources.

- ✔️️ Spatial, drawing, and sheet [views](./frontend/Views.md)
- ✔️️ [Viewport]($frontend)s
  - ️On-screen and off-screen rendering
  - Multiple simultaneously-open viewports, all sharing WebGL resources
- Non-iModel data
  - ✔️️ Reality (ContextCapture) Models
    - Classification of reality models using [SpatialClassificationProps]($common)
  - ✔️️ Point Clouds
  - ✔️️ Maps
  - 👷 Terrain
- 👷 Hyper-modeling (visualizing section drawings in-situ in spatial views)
- 👷 Schedule simulation using [RenderSchedule]($common)s
- ✔️️ Sectioning and clipping contents of Viewports using [ClipVector]($geometry)s

### Application-based customizations

Control the appearance of geometry displayed in Viewports.

- ✔️️ Control visibility (on/off) per:
  - Element
  - Model
  - Category
  - Subcategory
- ✔️️ Resymbolization using [FeatureOverrideProvider]($frontend)
  - Override symbology per:
    - Element
    - Model
    - Subcategory
    - Geometry class
  - Override
    - Color
    - Transparency
    - Line width and pattern
  - Disable
    - Material
    - Tool interaction

### View Decorations

Display [application-generated graphics](./frontend/ViewDecorations.md) that *decorate* a Viewport with additional information. Decorations may be updated continuously and can reflect *real-time* status. Decorations may also respond to mouse and touch events.

There are 3 types of View Decorations, and they may exist in any combination in a single view:

1. ✔️️ [View](./frontend/ViewDecorations.md#view-graphic-decorations) - rendered with WebGL
2. ✔️️️️ [Canvas](./frontend/ViewDecorations.md#canvas-decorations) - rendered with [CanvasRenderingContext2D](https://developer.mozilla.org/docs/Web/API/CanvasRenderingContext2D)
3. ✔️️ [HTML](./frontend/ViewDecorations.md#html-decorations) - rendered with the DOM

### Markers

Are convenient wrappers around View Decorations that show visible, interactive, indications of locations of interest at a *fixed location in world coordinates*. As the camera moves, Markers follow their location.

- ✔️️ [Markers](./frontend/markers.md) may contain *shared* or unique content
- ✔️️ [MarkerSets](./frontend/markers.md#markersets) combine sets of related Markers together, such that ones that would visually overlap instead form a *cluster*

### WebGL Rendering Techniques

Render 2d and 3d content into a Viewport using WebGL.

- ✔️️ [Order-independent transparency](http://jcgt.org/published/0002/02/09/)
- ✔️️ Instancing of repeated geometry
- 👷 Solar shadow maps.
- ✔️️ [RenderMode]($common)
  - Shaded
  - Wireframe
  - Monochrome
  - Hidden line
- ✔️️ Visible and hidden edge display
- ✔️️ Customizable *highlight effect* with silhouettes

### Tile formats

Load data from many sources into a single Viewport.

- ✔️️ iModel ("iMdl") tiles generated from geometric elements.
- ✔️️ Web map tiles (Bing, MapBox).
- ✔️️ [glTF](https://www.khronos.org/gltf/)-based [3D tile](https://github.com/alyticalGraphicsInc/3d-tiles) formats.
  - Batched ("b3dm") and instanced ("i3dm") meshes.
  - Point clouds ("pnts").
  - Composite ("cmpt") tiles containing multiple tiles of any format(s).
- 👷 [OpenCities Planner](https://www.bentley.com/en/products/product-line/reality-modeling-software/opencities-planner) ("A3x").
- 👷 [Cesium Terrain](https://cesium.com/blog/2018/03/01/introducing-cesium-world-terrain/)
- ✔️️ Custom formats via `TiledGraphicsProvider`

## Markup

Create and edit [SVG](https://developer.mozilla.org/docs/Web/SVG)-based markups for describing, discussing, and tracking issues.

- ✔️️ Arrows
- ✔️️ Clouds
- ✔️️ Notes (text, paragraphs)
- ✔️️ Lines, circles, shapes
- ✔️️ Scribbles
- ✔️️ Symbols
- ✔️️ Measurements

## Tools

[Tools](./frontend/tools.md) are implemented by applications to perform an action.

- ✔️️ [Immediate Tools](./frontend/tools.md#immediate-tools) execute tasks immediately without further input.
- ✔️️ [Interactive Tools](./frontend/tools.md#interactive-tools) respond to mouse and touch events in a view.

### Built-in tools

Default implementations of useful tools:

- ✔️️ [ViewTool]($frontend)s provide ways manipulate the view by panning, rotating, and zooming, etc..
- ✔️️ [SelectTool](./frontend/tools.md#selection-tool) is a default tool used to identify elements of particular interest that other tools may operate on.
- ✔️️ [IdleTool](./frontend/tools.md#idle-tool) responds to unhandled mouse and touch events to initiate viewing tools.

### Drawing Aids

Assistants for Tools to find existing geometry and for creating new geometry:

- ✔️️ [AccuSnap](./frontend/primitivetools.md#accusnap) automatically finds elements and locations of interest on elements under the cursor.
- ✔️️ [Tentative Point](./frontend/primitivetools.md#snapping) performs finds element in response to a *tentative button* press
- ✔️️ [AccuDraw](./frontend/primitivetools.md#accudraw) defines a work plane to aide entering coordinates

## Extensions

Load new functionality to a running instance of an application in a web browser.

- 👷 Load registered [Extension](./frontend/Extensions.md)
- 🎫 Register and upload your own Extensions

## Bridging data into iModels

Create iModels from data from external BIM/CAD/GIS/etc. applications.

[iModel Connectors](.\imodel-connectors.md) read data from external formats and *connect* it into an iModel. They create ChangeSets that are sent to iModelHub.

## Application and User Settings

Use the [Settings API](./frontend/settings.md) to save information outside of an iModel.

- ✔️️ User
- ✔️️ Application
- ✔️️ Project
- ✔️️ iModel

Examples:

- ✔️️ Saved Views
- ✔️️ Section Definitions
- ✔️️ User Preferences and Persistent State

## User Interface

The [9-Zone UI](./learning/ui/ninezone/index.md) UX pattern organizes the screen into 9 purpose-specific zones for ease of use and consistency.

The iTwin.js UI layer is based in React, so its UI controls can be added to existing web apps.

### UI Controls

Controls built to implement a UI using the 9-zone pattern.

- ✔️ [Widgets](./learning/ui/framework/Widgets.md)
- ✔️ Toolbars
- ✔️ [Backstage](./learning/ui/framework/Backstage.md)
- ✔️ [Frontstages](./learning/ui/framework/Frontstages.md)
- ✔️ [Stage Panels](./learning/ui/framework/StagePanels.md)
- ✔️ View Layout system to configure the working area.

### Data-driven controls

- ✔️ Table control
- ✔️ Tree control
- ✔️ Property Pane control

Although these controls can display data from any source, they are most commonly used with Presentation Rules.

## Quantity conversions and formatting

Convert quantity values between different unit systems, and format them to/from human-readable strings.

## Geometry Streaming

Integrate iModels with other 3D Applications and Platforms.

- ✔️ Create meshes from iModel geometry in real-time that are easy to use with other 3D applications.
- ✔️ Integrate with game engines like Unity and Unreal Engine or other 3D content applications like Blender.
- ✔️ Create AR and VR applications

See IModelDb.exportGraphics and imodel-unity-example.

## Geometry and mathematics

Mathematical classes and functions to create and interpret 2d and 3d geometry in iModels.

- ✔️ Point, vector, matrix, affine transform and related geometric concepts
- ✔️ Generalized curve types: LineSegment, LineString, Bspline, Bezier
- ✔️ Solid instancing: cylinder/cone, Sphere, Box, TorusPipe, LinearSweep, RotationalSweep, RuledSweep
- ✔️ Indexed mesh with optional normals, uv params, colors

## Schema Management

Manage and query the schemas of an iModel.

- ✔️ GraphQL based [schema management API](https://connect-imodelschemaservice.bentley.com/swagger/index.html)
  - ✔️ Query Schemas - Search for schemas and their contents
  - ✔️ Upload Schemas - Add or replace schemas
  - ✔️ Download Schemas - Download one or more schemas in EC JSON format compatible with the ecschema-metadata package.
  - ✔️ Delete schemas
  - ✔️ Query the Standard BIS schemas

### Schema Browser

Visually inspect search and view schemas associated with an iModel

- ✔️ View Class Hierarchy of all opened schemas or a selection of schemas
- ✔️ View contents of a single schema
- 👷 Integrate with BIS Documentation
- ✔️ Search for items in all opened schemas
- ✔️ Visualize how relationships connect classes
- 👷 Run BIS schema validation Rules
- 👷 Deployment as a Web Application
- ️🎫 Deployment as an Electron Application
- ️️✔️ Schema Customization - The ability to add new properties to an existing BIS schema or create your own custom schema which derives from an existing BIS schema
- ✔️ Add Properties
- ✔️ Create Custom Schemas
- 👷 TypeScript implementation of ECObjects - Reads JSON and Xml formats, can convert between them, validate the format and run BIS Validation rules

## iModel Transformations

Transform one iModel (or portion thereof) into another iModel for use by a different team or for a different purpose. This can be important for:

- 👷 Approval/sharing workflows
- 👷 Filtering deliverables
- 👷 Transforming between different information structures or schemas

## Programming environments

Write code in TypeScript and deploy it in browsers, desktops, servers, and mobile devices.

### Web Browsers

Desktop and Mobile device Web browsers.

- ✔️ Chrome
- ✔️ Firefox
- ✔️ "New" Edge
- ✔️ Safari
- ✔️ Opera
- ❌ Internet Explorer
- ❌ "Old" Edge

### Node.js based backends

- ✔️ Windows: Windows Server version 1607 or greater, and Windows 10 version 1803 or greater
- ✔️ Linux: Debian 9 "stretch" (should also run on most "tier 1" Node.js Linux platforms)

### Desktop Applications

- 👷 Bundled Electron-based applications with backend and frontend components
- 👷 Windows: Windows 10 version 1803 or greater
- 👷 MacOS: 10.14 "Mojave" or greater

### Mobile Applications

- 👷 iOS Version 12 or greater for iPad and iPhone
- 🎫 Android tablets and phones

## Programming Languages

- ✔️ TypeScript (JavaScript) for browser-based and server/desktop/mobile
- ✔️ Other programming languages (C++, C#, Python, etc.) via IPC. See imodel-unity-example and imodel-blender-example for details.

## Deployment

- ✔️ Containerization
- 👷 Kubernetes
- 👷 Routing and Provisioning
- 👷 Cloud platforms Azure, AWS and AliCloud

## Authoring/editing iModels

- 👷 Editing tools
- 👷 offline mode
- 🎫 Locking
- 🎫 Change Merging

## Authentication

- 👷 [OpenID Connect](https://openid.net/connect/) (OIDC)

## Further Resources

- [GitHub](https://github.com/imodeljs/imodeljs): the imodeljs repository along with samples.
- [Documentation](https://www.itwinjs.org/learning/):
  - Learning articles: explaining the iTwin.js library structure and architecture.
  - BIS docs: for understanding BIS schemas and the ECSql data query language.
  - API reference: can be used in conjunction with the imodeljs repository above to find code samples for API calls. Function/Class names can be searched within the repository to find relevant samples.
- [Stack Overflow](https://stackoverflow.com/questions/tagged/imodeljs): don't forget to add the **imodeljs** tag to your question. This will make it easier for us to respond.
- [YouTube Channel](https://www.youtube.com/channel/UCs4HxiWI4o4bzayG5QnxaIA): Informational videos for guidance and training.
- Sample Apps: can be used as a starting point for your app.
  - [simple-viewer-app](https://github.com/imodeljs/imodeljs-samples/tree/master/interactive-app/simple-viewer-app): An example of an interactive application which can display graphical data, browse iModel catalog and view element properties.
  - [imodel-query-agent](https://github.com/imodeljs/imodel-query-agent): An example of an agent application which can listen to changes made to an iModel in iModelHub and construct a 'Change Summary' of useful information.
- [Sample Data](https://developer.bentley.com/my-imodels/): to use with the above samples and jump start iTwin.js development.
- [iModel Console](https://imodelconsole.bentley.com): handy tool for running ECSql queries against an iModel. Can be used for writing queries for the application or for better understanding the project data.
