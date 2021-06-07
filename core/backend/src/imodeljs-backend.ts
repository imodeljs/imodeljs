/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./BriefcaseManager";
export * from "./Category";
export * from "./ChangeSummaryManager";
export * from "./CheckpointManager";
export * from "./ClassRegistry";
export * from "./CodeSpecs";
export * from "./ConcurrencyControl";
export * from "./Deprecated";
export * from "./DisplayStyle";
export * from "./ECDb";
export * from "./ECSchemaXmlContext";
export * from "./ECSqlStatement";
export * from "./Element";
export * from "./ElementAspect";
export * from "./Entity";
export * from "./ExportGraphics";
export * from "./ExternalSource";
export * from "./IModelJsFs";
export * from "./BackendHubAccess";
export * from "./Relationship";
export * from "./Texture";
export * from "./TxnManager";
export * from "./LineStyle";
export * from "./BackendLoggerCategory";
export * from "./Material";
export * from "./Model";
export * from "./NavigationRelationship";
export * from "./Schema";
export * from "./SqliteStatement";
export * from "./ViewDefinition";
export * from "./BisCoreSchema";
export * from "./ChangedElementsDb";
export * from "./domains/FunctionalSchema";
export * from "./domains/FunctionalElements";
export * from "./domains/GenericSchema";
export * from "./domains/GenericElements";
export { IModelJsNative, NativeLoggerCategory } from "@bentley/imodeljs-native";
export * from "./AutoPush";
export * from "./BackendRequestContext";
export * from "./IModelCloneContext";
export * from "./IModelExporter";
export * from "./IModelHost";
export * from "./IModelHubBackend";
export * from "./IModelImporter";
export * from "./IModelSchemaLoader";
export * from "./IModelTransformer";
export * from "./IpcHost";
export * from "./NativeAppStorage";
export * from "./NativeHost";
export * from "./CloudStorageBackend";
export * from "./AliCloudStorageService";
export * from "./DevTools";
export * from "./usage-logging/UsageLoggingUtilities";
export * from "./LocalhostIpcHost";
export * from "./ElementGraphics";
export * from "./IModelDb"; // must be last

/** @docs-package-description
 * The imodeljs-backend package always runs on the computer with a local Briefcase.
 *
 * It contains classes that [backend code]($docs/learning/backend/index.md) can use to work with directly with iModels.
 */
/**
 * @docs-group-description IModelHost
 * Classes for configuring and administering the backend [host]($docs/learning/backend/IModelHost.md).
 * See [the learning article]($docs/learning/backend/IModelHost.md).
 */
/**
 * @docs-group-description iModels
 * Classes for working with [iModels]($docs/learning/iModels.md).
 * See [the learning article]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description Schema
 * Classes for working with [ECSchemas]($docs/learning/backend/SchemasAndElementsInTypeScript.md)
 */
/**
 * @docs-group-description Models
 * Subclasses of [Models]($docs/BIS/intro/model-fundamentals.md).
 * See [the learning articles]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description Elements
 * Subclasses of [Elements]($docs/BIS/intro/element-fundamentals.md).
 * See [the learning articles]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description Codes
 * Classes for working with [Codes]($docs/BIS/intro/codes.md).
 * See [the learning articles]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description ViewDefinitions
 * Classes for working with elements that define what appears in [views]($docs/learning/frontend/views.md).
 * See [the learning articles]($docs/learning/backend/createelements/#orthographicviewdefinition).
 */
/**
 * @docs-group-description Relationships
 * Classes that describe the [relationships]($docs/bis/intro/relationship-fundamentals.md) between elements.
 */
/**
 * @docs-group-description ElementAspects
 * Subclasses of [ElementAspects]($docs/bis/intro/elementaspect-fundamentals.md).
 * See [the learning articles]($docs/learning/backend/index.md).
 */
/**
 * @docs-group-description Categories
 * Classes for [Categories]($docs/bis/intro/categories.md).
 */
/**
 * @docs-group-description Symbology
 * Classes for defining the appearance of element geometry
 */
/**
 * @docs-group-description ECDb
 * Classes for working with ECDb.
 */
/**
 * @docs-group-description SQLiteDb
 * Classes for working with SQLiteDb.
 */
/**
 * @docs-group-description NativeApp
 * Classes for working with Mobile/Desktop Application.
 */
/**
 * @docs-group-description ECSQL
 * Classes for working with [ECSQL]($docs/learning/ECSQL.md)
 */
/**
 * @docs-group-description SQLite
 * Classes for working directly with SQLite
 */
/**
 * @docs-group-description Portability
 * Classes to help write [portable apps]($docs/learning/Portability.md) and libraries that will run on any platform, including web apps, node services, Electron desktops apps, and mobile apps.
 */
/**
 * @docs-group-description Utils
 * Miscellaneous utility classes.
 */
/**
 * @docs-group-description Logging
 * Logger categories used by this package.
 */
/**
 * @docs-group-description RpcInterface
 * Classes for working with [RpcInterfaces]($docs/learning/RpcInterface.md).
 */
/**
 * @docs-group-description CloudStorageBackend
 * Classes for working with cloud storage.
 */
/**
 * @docs-group-description AliCloudStorageService
 * Classes for working with cloud storage using AliCloud.
 */
/**
 * @docs-group-description Authentication
 * Classes for working with Authentication.
 */
/**
 * @docs-group-description Tiles
 * APIs for working with tile graphics.
 */
/**
 * @docs-group-description HubAccess
 * APIs for working with IModelHub
 */
