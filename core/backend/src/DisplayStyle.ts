/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ViewDefinitions
 */

import { CompressedId64Set, Id64, Id64Array, Id64Set, Id64String, OrderedId64Iterable } from "@bentley/bentleyjs-core";
import {
  BisCodeSpec, Code, CodeScopeProps, CodeSpec, ColorDef, DisplayStyle3dProps, DisplayStyle3dSettings, DisplayStyle3dSettingsProps,
  DisplayStyleProps, DisplayStyleSettings, PlanProjectionSettingsProps, RenderSchedule, SkyBoxImageProps, ViewFlags,
} from "@bentley/imodeljs-common";
import { DefinitionElement, RenderTimeline } from "./Element";
import { IModelCloneContext } from "./IModelCloneContext";
import { IModelDb } from "./IModelDb";

/** A DisplayStyle defines the parameters for 'styling' the contents of a view.
 * Internally a DisplayStyle consists of a dictionary of several named 'styles' describing specific aspects of the display style as a whole.
 * Many ViewDefinitions may share the same DisplayStyle.
 * @public
 */
export abstract class DisplayStyle extends DefinitionElement implements DisplayStyleProps {
  /** @internal */
  public static override get className(): string { return "DisplayStyle"; }
  public abstract get settings(): DisplayStyleSettings;

  /** @internal */
  protected constructor(props: DisplayStyleProps, iModel: IModelDb) {
    super(props, iModel);
  }

  /** Create a Code for a DisplayStyle given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iModel  The IModelDb
   * @param scopeModelId The Id of the DefinitionModel that contains the DisplayStyle and provides the scope for its name.
   * @param codeValue The DisplayStyle name
   */
  public static createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModel.codeSpecs.getByName(BisCodeSpec.displayStyle);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** @alpha */
  protected override collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    for (const [id] of this.settings.subCategoryOverrides) {
      predecessorIds.add(id);
    }

    for (const excludedElementId of this.settings.excludedElementIds)
      predecessorIds.add(excludedElementId);

    if (this.settings.renderTimeline) {
      predecessorIds.add(this.settings.renderTimeline);
    } else {
      const script = this.loadScheduleScript();
      if (script)
        script.script.discloseIds(predecessorIds);
    }
  }

  /** @alpha */
  protected static override onCloned(context: IModelCloneContext, sourceElementProps: DisplayStyleProps, targetElementProps: DisplayStyleProps): void {
    super.onCloned(context, sourceElementProps, targetElementProps);

    if (!context.isBetweenIModels || !targetElementProps.jsonProperties?.styles)
      return;

    const settings = targetElementProps.jsonProperties.styles;
    if (settings.subCategoryOvr) {
      for (let i = 0; i < settings.subCategoryOvr.length; /* */) {
        const ovr = settings.subCategoryOvr[i];
        ovr.subCategory = context.findTargetElementId(Id64.fromJSON(ovr.subCategory));
        if (Id64.invalid === ovr.subCategory)
          settings.subCategoryOvr.splice(i, 1);
        else
          i++;
      }
    }

    if (settings.excludedElements) {
      const excluded: Id64Array = "string" === typeof settings.excludedElements ? CompressedId64Set.decompressArray(settings.excludedElements) : settings.excludedElements;
      for (let i = 0; i < excluded.length; /* */) {
        const remapped = context.findTargetElementId(excluded[i]);
        if (Id64.invalid === remapped)
          excluded.splice(i, 1);
        else
          excluded[i++] = remapped;
      }

      if (0 === excluded.length)
        delete settings.excludedElements;
      else
        settings.excludedElements = CompressedId64Set.compressIds(OrderedId64Iterable.sortArray(excluded));
    }

    // eslint-disable-next-line deprecation/deprecation
    if (settings.renderTimeline) {
      const renderTimeline = context.findTargetElementId(settings.renderTimeline);
      if (Id64.isValid(renderTimeline))
        settings.renderTimeline = renderTimeline;
      else
        delete settings.renderTimeline;
    } else if (settings.scheduleScript) { // eslint-disable-line deprecation/deprecation
      // eslint-disable-next-line deprecation/deprecation
      const scheduleScript = RenderTimeline.remapScript(context, settings.scheduleScript);
      if (scheduleScript.length > 0)
        settings.scheduleScript = scheduleScript; // eslint-disable-line deprecation/deprecation
      else
        delete settings.scheduleScript; // eslint-disable-line deprecation/deprecation
    }
  }

  public loadScheduleScript(): RenderSchedule.ScriptReference | undefined {
    let script;
    let sourceId;
    if (this.settings.renderTimeline) {
      const timeline = this.iModel.elements.tryGetElement<RenderTimeline>(this.settings.renderTimeline);
      if (timeline) {
        script = RenderSchedule.Script.fromJSON(timeline.scriptProps);
        sourceId = timeline.id;
      }
    } else if (this.settings.scheduleScriptProps) { // eslint-disable-line deprecation/deprecation
      // eslint-disable-next-line deprecation/deprecation
      script = RenderSchedule.Script.fromJSON(this.settings.scheduleScriptProps);
      sourceId = this.id;
    }

    return undefined !== sourceId && undefined !== script ? new RenderSchedule.ScriptReference(sourceId, script) : undefined;
  }
}

/** A DisplayStyle for 2d views.
 * @public
 */
export class DisplayStyle2d extends DisplayStyle {
  /** @internal */
  public static override get className(): string { return "DisplayStyle2d"; }
  private readonly _settings: DisplayStyleSettings;

  public get settings(): DisplayStyleSettings { return this._settings; }

  /** @internal */
  public constructor(props: DisplayStyleProps, iModel: IModelDb) {
    super(props, iModel);
    this._settings = new DisplayStyleSettings(this.jsonProperties);
  }
  /** Create a DisplayStyle2d for use by a ViewDefinition.
   * @param iModelDb The iModel
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name/CodeValue of the DisplayStyle2d
   * @returns The newly constructed DisplayStyle2d element.
   * @throws [[IModelError]] if unable to create the element.
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string): DisplayStyle2d {
    const displayStyleProps: DisplayStyleProps = {
      classFullName: this.classFullName,
      code: this.createCode(iModelDb, definitionModelId, name),
      model: definitionModelId,
      isPrivate: false,
      jsonProperties: {
        styles: {
          backgroundColor: 0,
          monochromeColor: ColorDef.white.toJSON(),
          viewflags: ViewFlags.createFrom(),
        },
      },
    };
    return new DisplayStyle2d(displayStyleProps, iModelDb);
  }
  /** Insert a DisplayStyle2d for use by a ViewDefinition.
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new DisplayStyle2d into this DefinitionModel
   * @param name The name of the DisplayStyle2d
   * @returns The Id of the newly inserted DisplayStyle2d element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string): Id64String {
    const displayStyle = this.create(iModelDb, definitionModelId, name);
    return iModelDb.elements.insertElement(displayStyle);
  }
}

/** Describes initial settings for a new [[DisplayStyle3d]].
 * Most properties are inherited from [DisplayStyle3dSettingsProps]($common), but for backwards compatibility reasons, this interface is slightly awkward:
 * - It adds a `viewFlags` member that differs only in case and type from [DisplayStyleSettingsProps.viewflags]($common); and
 * - It extends the type of [DisplayStyleSettingsProps.backgroundColor]($common) to include [ColorDef]($common).
 * These idiosyncrasies will be addressed in a future version of imodeljs-backend.
 * @see [[DisplayStyle3d.create]].
 * @public
 */
export interface DisplayStyleCreationOptions extends Omit<DisplayStyle3dSettingsProps, "backgroundColor" | "scheduleScript"> {
  /** If supplied, the [ViewFlags]($common) applied by the display style.
   * If undefined, [DisplayStyle3dSettingsProps.viewflags]($common) will be used if present (note the difference in case); otherwise, default-constructed [ViewFlags]($common) will be used.
   */
  viewFlags?: ViewFlags;
  backgroundColor?: ColorDef | number;
}

/** A DisplayStyle for 3d views.
 * See [how to create a DisplayStyle3d]$(docs/learning/backend/CreateElements.md#DisplayStyle3d).
 * @public
 */
export class DisplayStyle3d extends DisplayStyle implements DisplayStyle3dProps {
  /** @internal */
  public static override get className(): string { return "DisplayStyle3d"; }
  private readonly _settings: DisplayStyle3dSettings;

  public get settings(): DisplayStyle3dSettings { return this._settings; }

  /** @internal */
  public constructor(props: DisplayStyle3dProps, iModel: IModelDb) {
    super(props, iModel);
    this._settings = new DisplayStyle3dSettings(this.jsonProperties);
  }

  /** @alpha */
  protected override collectPredecessorIds(predecessorIds: Id64Set): void {
    super.collectPredecessorIds(predecessorIds);
    const skyBoxImageProps: SkyBoxImageProps | undefined = this.settings.environment?.sky?.image;
    if (skyBoxImageProps?.texture) {
      predecessorIds.add(Id64.fromJSON(skyBoxImageProps.texture));
    }
    if (skyBoxImageProps?.textures) {
      if (skyBoxImageProps.textures.back) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.back)); }
      if (skyBoxImageProps.textures.bottom) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.bottom)); }
      if (skyBoxImageProps.textures.front) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.front)); }
      if (skyBoxImageProps.textures.left) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.left)); }
      if (skyBoxImageProps.textures.right) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.right)); }
      if (skyBoxImageProps.textures.top) { predecessorIds.add(Id64.fromJSON(skyBoxImageProps.textures.top)); }
    }
    if (this.settings.planProjectionSettings) {
      for (const planProjectionSetting of this.settings.planProjectionSettings) {
        predecessorIds.add(planProjectionSetting[0]);
      }
    }
  }
  /** @alpha */
  protected static override onCloned(context: IModelCloneContext, sourceElementProps: DisplayStyle3dProps, targetElementProps: DisplayStyle3dProps): void {
    super.onCloned(context, sourceElementProps, targetElementProps);
    if (context.isBetweenIModels) {
      const skyBoxImageProps: SkyBoxImageProps | undefined = targetElementProps?.jsonProperties?.styles?.environment?.sky?.image;
      if (skyBoxImageProps?.texture) {
        const textureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.texture));
        skyBoxImageProps.texture = Id64.isValidId64(textureId) ? textureId : undefined;
      }
      if (skyBoxImageProps?.textures) {
        const backTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.back));
        skyBoxImageProps.textures.back = Id64.isValidId64(backTextureId) ? backTextureId : undefined;
        const bottomTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.bottom));
        skyBoxImageProps.textures.bottom = Id64.isValidId64(bottomTextureId) ? bottomTextureId : undefined;
        const frontTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.front));
        skyBoxImageProps.textures.front = Id64.isValidId64(frontTextureId) ? frontTextureId : undefined;
        const leftTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.left));
        skyBoxImageProps.textures.left = Id64.isValidId64(leftTextureId) ? leftTextureId : undefined;
        const rightTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.right));
        skyBoxImageProps.textures.right = Id64.isValidId64(rightTextureId) ? rightTextureId : undefined;
        const topTextureId: Id64String = context.findTargetElementId(Id64.fromJSON(skyBoxImageProps.textures.top));
        skyBoxImageProps.textures.top = Id64.isValidId64(topTextureId) ? topTextureId : undefined;
      }
      if (targetElementProps?.jsonProperties?.styles?.planProjections) {
        const remappedPlanProjections: { [modelId: string]: PlanProjectionSettingsProps } = {};
        for (const entry of Object.entries(targetElementProps.jsonProperties.styles.planProjections)) {
          const remappedModelId: Id64String = context.findTargetElementId(entry[0]);
          if (Id64.isValidId64(remappedModelId)) {
            remappedPlanProjections[remappedModelId] = entry[1];
          }
        }
        targetElementProps.jsonProperties.styles.planProjections = remappedPlanProjections;
      }
    }
  }

  /** Create a DisplayStyle3d for use by a ViewDefinition.
   * @param iModelDb The iModel
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name/CodeValue of the DisplayStyle3d
   * @returns The newly constructed DisplayStyle3d element.
   * @throws [[IModelError]] if unable to create the element.
   */
  public static create(iModelDb: IModelDb, definitionModelId: Id64String, name: string, options?: DisplayStyleCreationOptions): DisplayStyle3d {
    options = options ?? {};
    let viewflags = options.viewFlags?.toJSON();
    if (!viewflags)
      viewflags = options.viewflags ?? new ViewFlags().toJSON();

    const backgroundColor = options.backgroundColor instanceof ColorDef ? options.backgroundColor.toJSON() : options.backgroundColor;

    const settings: DisplayStyle3dSettingsProps = {
      ...options,
      viewflags,
      backgroundColor,
    };

    const displayStyleProps: DisplayStyle3dProps = {
      classFullName: this.classFullName,
      code: this.createCode(iModelDb, definitionModelId, name),
      model: definitionModelId,
      jsonProperties: { styles: settings },
      isPrivate: false,

    };

    return new DisplayStyle3d(displayStyleProps, iModelDb);
  }
  /**
   * Insert a DisplayStyle3d for use by a ViewDefinition.
   * @param iModelDb Insert into this iModel
   * @param definitionModelId Insert the new DisplayStyle3d into this [[DefinitionModel]]
   * @param name The name of the DisplayStyle3d
   * @returns The Id of the newly inserted DisplayStyle3d element.
   * @throws [[IModelError]] if unable to insert the element.
   */
  public static insert(iModelDb: IModelDb, definitionModelId: Id64String, name: string, options?: DisplayStyleCreationOptions): Id64String {
    const displayStyle = this.create(iModelDb, definitionModelId, name, options);
    return iModelDb.elements.insertElement(displayStyle);
  }
}
