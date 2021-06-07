/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Entities
 */

import {
  GuidString,
  Id64,
  Id64String,
  Logger,
} from "@bentley/bentleyjs-core";
import {
  AngleProps, ClipVectorProps, LowAndHighXY, LowAndHighXYZ, TransformProps, XYProps, XYZProps, YawPitchRollProps,
} from "@bentley/geometry-core";
import { CodeProps } from "./Code";
import { CommonLoggerCategory } from "./CommonLoggerCategory";
import { EntityProps } from "./EntityProps";
import { GeometryStreamProps } from "./geometry/GeometryStream";
import { IModelError, IModelStatus } from "./IModelError";
import { SubCategoryAppearance } from "./SubCategoryAppearance";

/** Properties of a NavigationProperty.
 * @public
 */
export interface RelatedElementProps {
  /** The Id of the element to which this element is related. */
  id: Id64String;
  /** The full className of the relationship class. */
  relClassName?: string;
}

/** Properties of an [Element]($docs/bis/intro/element-fundamentals)
 * @public
 */
export interface ElementProps extends EntityProps {
  /** The Id of the [Model]($docs/bis/intro/model-fundamentals.md) containing this element */
  model: Id64String;
  /** The [Code]($docs/bis/intro/codes.md) for this element */
  code: CodeProps;
  /** The Parent of this element, if defined. */
  parent?: RelatedElementProps;
  /** A [FederationGuid]($docs/bis/intro/element-fundamentals.md#federationguid) assigned to this element by some other federated database */
  federationGuid?: GuidString;
  /** A [user-assigned label]($docs/bis/intro/element-fundamentals.md#userlabel) for this element. */
  userLabel?: string;
  /** Optional [json properties]($docs/bis/intro/element-fundamentals.md#jsonproperties) of this element. */
  jsonProperties?: any;
}

/** The Id and relationship class of an Element that is somehow related to another Element
 * @public
 */
export class RelatedElement implements RelatedElementProps {
  /** The Id of the element to which this element is related. */
  public readonly id: Id64String;

  /** The full className of the relationship class. */
  public readonly relClassName?: string;

  constructor(props: RelatedElementProps) {
    this.id = Id64.fromJSON(props.id);
    this.relClassName = props.relClassName;
  }

  public static fromJSON(json?: RelatedElementProps): RelatedElement | undefined {
    return json ? new RelatedElement(json) : undefined;
  }

  /** Used to *null out* an existing navigation relationship. */
  public static readonly none = new RelatedElement({ id: Id64.invalid });

  /** Accept the value of a navigation property that might be in the shortened format of just an id or might be in the full RelatedElement format. */
  public static idFromJson(json: any): Id64String {
    if ((typeof json === "object") && ("id" in json)) {
      const r = RelatedElement.fromJSON(json);
      if (r === undefined)
        throw new IModelError(IModelStatus.BadArg, "Problem parsing Id64 from json", Logger.logWarning, CommonLoggerCategory.ElementProps);
      return r.id;
    }
    return Id64.fromJSON(json);
  }

  public toJSON(): RelatedElementProps {
    return {
      id: this.id,
      relClassName: this.relClassName,
    };
  }
}

/** A [RelatedElement]($common) relationship that describes the [TypeDefinitionElement]($backend) of an element.
 * @public
 */
export class TypeDefinition extends RelatedElement {
}

/** Properties of a [GeometricElement]($backend)
 * @public
 */
export interface GeometricElementProps extends ElementProps {
  /** The id of the category for this geometric element. */
  category: Id64String;
  /** The geometry stream properties */
  geom?: GeometryStreamProps;
  /** The placement properties */
  placement?: PlacementProps;
}

/** Properties of a [[Placement3d]]
 * @public
 */
export interface Placement3dProps {
  origin: XYZProps;
  angles: YawPitchRollProps;
  bbox?: LowAndHighXYZ;
}

/** Properties of a [[Placement2d]]
 * @public
 */
export interface Placement2dProps {
  origin: XYProps;
  angle: AngleProps;
  bbox?: LowAndHighXY;
}

/** @public */
export type PlacementProps = Placement2dProps | Placement3dProps;

/** determine if this is Placement2dProps
 * @public
 */
export function isPlacement2dProps(props: PlacementProps): props is Placement2dProps {
  return (props as Placement2dProps).angle !== undefined;
}

/** determine if this is Placement3dProps
 * @public
 */
export function isPlacement3dProps(props: PlacementProps): props is Placement3dProps {
  return !isPlacement2dProps(props);
}

/** Properties that define a [GeometricElement3d]($backend)
 * @public
 */
export interface GeometricElement3dProps extends GeometricElementProps {
  placement?: Placement3dProps;
  typeDefinition?: RelatedElementProps;
}

/** Properties that define a [PhysicalElement]($backend)
 * @public
 */
export interface PhysicalElementProps extends GeometricElement3dProps {
  physicalMaterial?: RelatedElementProps;
}

/** An enumeration of the different types of [SectionDrawing]($backend)s.
 * @public
 */
export enum SectionType {
  Section = 3,
  Detail = 4,
  Elevation = 5,
  Plan = 6,
}

/** Properties that define a [SectionDrawing]($backend).
 * @public
 */
export interface SectionDrawingProps extends ElementProps {
  /** The type of section used to generate the drawing. Default: Section. */
  sectionType?: SectionType;
  /** The spatial view from which the section was generated. */
  spatialView?: RelatedElementProps;
  jsonProperties?: {
    /** A transform from the section drawing model's coordinates to spatial coordinates. */
    drawingToSpatialTransform?: TransformProps;
    /** If the section drawing is placed onto a [Sheet]($backend) via a [ViewAttachment]($backend), a transform from the sheet's coordinates to spatial coordinates. */
    sheetToSpatialTransform?: TransformProps;
    /** If the section drawing is placed onto a [Sheet]($backend) via a [ViewAttachment]($backend), JSON representation of a [ClipVector]($geometry) to apply to
     * the sheet graphics when drawn in the context of the spatial view.
     * The ClipVector is in spatial coordinates.
     */
    drawingBoundaryClip?: ClipVectorProps;
    /** If true, when displaying the section drawing as a [DrawingViewState]($frontend), the [[spatialView]] will also be displayed. */
    displaySpatialView?: true;
  };
}

/** Properties that define a [SectionDrawingLocation]($backend)
 * @public
 */
export interface SectionDrawingLocationProps extends GeometricElement3dProps {
  /** The [ViewDefinition]($backend) to which this location refers. */
  sectionView?: RelatedElementProps;
}

/** Properties that define a [GeometricElement2d]($backend)
 * @public
 */
export interface GeometricElement2dProps extends GeometricElementProps {
  placement?: Placement2dProps;
  typeDefinition?: RelatedElementProps;
}

/** Properties of a [GeometryPart]($backend)
 * @public
 */
export interface GeometryPartProps extends ElementProps {
  geom?: GeometryStreamProps;
  bbox?: LowAndHighXYZ;
}

/** Properties for a [ViewAttachment]($backend)
 * @public
 */
export interface ViewAttachmentProps extends GeometricElement2dProps {
  view: RelatedElementProps;
  jsonProperties?: {
    /** Integer priority in [-500,500]. Where two attachments overlap, the one with the higher priority draws in front of the other. Default: 0. */
    displayPriority?: number;
    /** JSON representation of a [ClipVector]($geometry-core] in sheet coordinate space, used to clip the attachment's graphics on the sheet. */
    clip?: ClipVectorProps;
    /** Options for customizing how the view attachment is displayed on the sheet. */
    displayOptions?: {
      /** If true, the view attachment is always drawn as a raster image. By default, only 3d perspective views are drawn this way (they always *must* be). Default: false. */
      drawAsRaster?: boolean;
      /** If true, and the view attachment is drawn as a raster image, the background color of the view will be preserved. By default the background color of the
       * sheet is used and any background pixels become transparent, allowing the contents of the sheet to show through. Default: false.
       */
      preserveBackground?: boolean;
    };
  };
}

/** Properties of a [Subject]($backend)
 * @public
 */
export interface SubjectProps extends ElementProps {
  description?: string;
}

/** Properties of a [SheetBorderTemplate]($backend)
 * @beta
 */
export interface SheetBorderTemplateProps extends ElementProps {
  height?: number;
  width?: number;
}

/** Properties of a [SheetTemplate]($backend)
 * @beta
 */
export interface SheetTemplateProps extends ElementProps {
  height?: number;
  width?: number;
  border?: Id64String;
}

/** Properties of a [Sheet]($backend).
 * @public
 */
export interface SheetProps extends ElementProps {
  width?: number;
  height?: number;
  scale?: number;
  sheetTemplate?: Id64String;
  attachments?: Id64String[];
}

/** Properties of a [DefinitionElement]($backend)
 * @public
 */
export interface DefinitionElementProps extends ElementProps {
  isPrivate?: boolean;
}

/** Properties of a [TypeDefinitionElement]($backend)
 * @public
 */
export interface TypeDefinitionElementProps extends DefinitionElementProps {
  recipe?: RelatedElementProps;
}

/** Properties of a [PhysicalType]($backend)
 * @public
 */
export interface PhysicalTypeProps extends TypeDefinitionElementProps {
  /** The [PhysicalMaterial]($backend) that makes up this physical type. */
  physicalMaterial?: RelatedElementProps;
}

/** Properties of a [InformationPartitionElement]($backend)
 * @public
 */
export interface InformationPartitionElementProps extends ElementProps {
  description?: string;
}

/** Options controlling which properties are included or excluded when querying [[DisplayStyleProps]].
 * @see [[ViewStateLoadProps]] and [[ElementLoadOptions]].
 * @public
 */
export interface DisplayStyleLoadProps {
  /** If true, the lists of element Ids in the display style's schedule script will be empty.
   * The element Ids are not required on the frontend for display and can be quite large.
   */
  omitScheduleScriptElementIds?: boolean;
  /** If true, [[DisplayStyleSettingsProps.excludedElements]] will be compressed into a single compact string; otherwise they will be expanded into an array of strings.
   * The number of Ids may be quite large, so the compressed format is preferred, especially when communicating between the backend and frontend.
   */
  compressExcludedElementIds?: boolean;
}

/** Options controlling which properties are included or excluded when querying [[RenderTimelineProps]].
 * @see [[ElementLoadOptions.renderTimeline]].
 * @public
 */
export interface RenderTimelineLoadProps {
  /** If true, the lists of element Ids in the schedule script will be empty.
   * The element Ids can be extremely numerous and are not required on the frontend for display, so they are omitted by default by [DisplayStyleState.load]($frontend).
   */
  omitScriptElementIds?: boolean;
}

/** Options used to specify properties to include or exclude when querying [[ElementProps]] with functions like
 * [IModelDb.Elements.getElementProps]($backend) and [IModelConnection.Elements.loadProps]($frontend).
 * @public
 */
export interface ElementLoadOptions {
  /** If true, include the [[GeometryStreamProps]] for [[GeometricElementProps]] and [[GeometryPartProps]].
   * Geometry streams can consist of many megabytes worth of JSON, so they are omitted by default.
   */
  wantGeometry?: boolean;
  /** When including a geometry stream containing brep entries, whether to return the raw brep data or proxy geometry, false when undefined */
  /** If true, include [[BRepEntity.DataProps.data]] in the [[GeometryStreamProps]] for [[GeometricElementProps]] and [[GeometryPartProps]].
   * The data is a potentially large base-64-encoded opaque binary blob that cannot be directly inspected or manipulated on the frontend, so it is omitted by default.
   */
  wantBRepData?: boolean;
  /** Options controlling which properties of [[DisplayStyleProps]] to include or exclude. */
  displayStyle?: DisplayStyleLoadProps;
  /** Options controlling which properties of [[RenderTimelineProps]] to include or exclude. */
  renderTimeline?: RenderTimelineLoadProps;
}

/** Parameters to specify what element to load for functions like [IModelDb.Elements.getElementProps]($backend).
 * @public
 */
export interface ElementLoadProps extends ElementLoadOptions {
  id?: Id64String;
  code?: CodeProps;
  federationGuid?: GuidString;
}

/** Properties of an [ElementAspect]($backend)
 * @public
 */
export interface ElementAspectProps extends EntityProps {
  element: RelatedElementProps;
}

/** Properties of an [ExternalSourceAspect]($backend) that stores synchronization information for an element originating from an external source.
 * @public
 */
export interface ExternalSourceAspectProps extends ElementAspectProps {
  /** An element that scopes the combination of `kind` and `identifier` to uniquely identify the object from the external source. */
  scope: RelatedElementProps;
  /** The identifier of the object in the source repository. */
  identifier: string;
  /** The kind of object within the source repository. */
  kind: string;
  /** An optional value that is typically a version number or a pseudo version number like last modified time.
   * It will be used by the synchronization process to detect that a source object is unchanged so that computing a cryptographic hash can be avoided.
   * If present, this value must be guaranteed to change when any of the source object's content changes.
   */
  version?: string;
  /** The optional cryptographic hash (any algorithm) of the source object's content. If defined, it must be guaranteed to change when the source object's content changes. */
  checksum?: string;
  /** A place where additional JSON properties can be stored. For example, provenance information or properties relating to the synchronization process. */
  jsonProperties?: any;
  /** The source of the imported/synchronized object. Should point to an instance of [ExternalSource]($backend). */
  source?: RelatedElementProps;
}

/** Properties of an [ExternalSource]($backend)
 * @beta
 */
export interface ExternalSourceProps extends ElementProps {
  repository?: RelatedElementProps;
  connectorName?: string;
  connectorVersion?: string;
}

/** The role that an attached [ExternalSource]($backend) plays.
 * @beta
 */
export enum ExternalSourceAttachmentRole {
  /** The attached [ExternalSource]($backend) provides context. */
  SpecifyContext = 0,
  /** The attached [ExternalSource]($backend) models a part of the whole. */
  SpecifyPart = 1,
}

/** Properties of an [ExternalSourceAttachment]($backend)
 * @beta
 */
export interface ExternalSourceAttachmentProps extends ElementProps {
  attaches?: RelatedElementProps;
  role?: ExternalSourceAttachmentRole;
  translation?: XYZProps;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: XYZProps;
}

/** Properties of an [ChannelRootAspect]($backend) that identifies an Element as the root of a *channel* which is a subset of the overall iModel hierarchy that is independently maintained.
 * @public
 */
export interface ChannelRootAspectProps extends ElementAspectProps {
  /** The owner of the channel */
  owner: string;
}

/** Properties of a [LineStyle]($backend)
 * @public
 */
export interface LineStyleProps extends DefinitionElementProps {
  description?: string;
  /** The JSON string line style definition element data [LineStyleDefinition.StyleProps]($backend) */
  data: string;
}

/** Properties of a [LightLocation]($backend)
 * @internal
 */
export interface LightLocationProps extends GeometricElement3dProps {
  enabled?: boolean;
}

/** The *rank* for a Category
 * @public
 */
export enum Rank {
  /** This category is predefined by the system */
  System = 0,
  /** This category is defined by a schema. Elements in this category are not recognized by system classes. */
  Domain = 1,
  /** This category is defined by an application. Elements in this category are not recognized by system and schema classes. */
  Application = 2,
  /** This category is defined by a user. Elements in this category are not recognized by system, schema, and application classes. */
  User = 3,
}

/** Parameters of a [Category]($backend)
 * @public
 */
export interface CategoryProps extends DefinitionElementProps {
  rank?: Rank;
  description?: string;
}

/** Parameters of a [SubCategory]($backend)
 * @public
 */
export interface SubCategoryProps extends DefinitionElementProps {
  appearance?: SubCategoryAppearance.Props;
  description?: string;
}

/** Parameters of a [UrlLink]($backend)
 * @public
 */
export interface UrlLinkProps extends ElementProps {
  description?: string;
  url?: string;
}

/** Parameters of a [RepositoryLink]($backend)
 * @public
 */
export interface RepositoryLinkProps extends UrlLinkProps {
  repositoryGuid?: GuidString;
  format?: string;
}

/** The properties of a [SynchronizationConfigLink]($backend)
 * @beta
 */
export interface SynchronizationConfigLinkProps extends UrlLinkProps {
  lastSuccessfulRun?: string;
}

/** Wire format describing a [RenderTimeline]($backend).
 * @public
 */
export interface RenderTimelineProps extends ElementProps {
  /** An optional human-readable description of the timeline. */
  description?: string;
  /** The stringified JSON representation of the instructions for visualizing change over time.
   * @see [[RenderSchedule.ScriptProps]] for the JSON interface.
   */
  script: string;
}
