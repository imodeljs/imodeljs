/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */
import * as path from "path";
import { DbResult, GuidString, Id64, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { Schema } from "@bentley/ecschema-metadata";
import { ChangeSet } from "@bentley/imodelhub-client";
import { CodeSpec, FontProps, IModel, IModelError } from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BisCoreSchema } from "./BisCoreSchema";
import { BriefcaseManager } from "./BriefcaseManager";
import { ChangeSummaryExtractContext, ChangeSummaryManager } from "./ChangeSummaryManager";
import { ECSqlStatement } from "./ECSqlStatement";
import { Element, GeometricElement, RecipeDefinitionElement, RepositoryLink } from "./Element";
import { ElementAspect, ElementMultiAspect, ElementUniqueAspect } from "./ElementAspect";
import { BriefcaseDb, IModelDb } from "./IModelDb";
import { IModelSchemaLoader } from "./IModelSchemaLoader";
import { DefinitionModel, Model } from "./Model";
import { ElementRefersToElements, Relationship, RelationshipProps } from "./Relationship";

const loggerCategory: string = BackendLoggerCategory.IModelExporter;

/** Handles the events generated by IModelExporter.
 * @note Change information is available when `IModelExportHandler` methods are invoked via [IModelExporter.exportChanges]($backend), but not available when invoked via [IModelExporter.exportAll]($backend).
 * @see [iModel Transformation and Data Exchange]($docs/learning/backend/IModelTransformation.md), [IModelExporter]($backend)
 * @beta
 */
export abstract class IModelExportHandler {
  /** If `true` is returned, then the CodeSpec will be exported.
   * @note This method can optionally be overridden to exclude an individual CodeSpec from the export. The base implementation always returns `true`.
   */
  protected shouldExportCodeSpec(_codeSpec: CodeSpec): boolean { return true; }

  /** Called when a CodeSpec should be exported.
   * @param codeSpec The CodeSpec to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportCodeSpec(_codeSpec: CodeSpec, _isUpdate: boolean | undefined): void { }

  /** Called when a font should be exported.
   * @param font The font to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportFont(_font: FontProps, _isUpdate: boolean | undefined): void { }

  /** Called when a model should be exported.
   * @param model The model to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportModel(_model: Model, _isUpdate: boolean | undefined): void { }

  /** Called when a model should be deleted. */
  protected onDeleteModel(_modelId: Id64String): void { }

  /** If `true` is returned, then the element will be exported.
   * @note This method can optionally be overridden to exclude an individual Element (and its children and ElementAspects) from the export. The base implementation always returns `true`.
   */
  protected shouldExportElement(_element: Element): boolean { return true; }

  /** Called when an element should be exported.
   * @param element The element to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportElement(_element: Element, _isUpdate: boolean | undefined): void { }

  /** Called when an element should be deleted. */
  protected onDeleteElement(_elementId: Id64String): void { }

  /** If `true` is returned, then the ElementAspect will be exported.
   * @note This method can optionally be overridden to exclude an individual ElementAspect from the export. The base implementation always returns `true`.
   */
  protected shouldExportElementAspect(_aspect: ElementAspect): boolean { return true; }

  /** Called when an ElementUniqueAspect should be exported.
   * @param aspect The ElementUniqueAspect to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportElementUniqueAspect(_aspect: ElementUniqueAspect, _isUpdate: boolean | undefined): void { }

  /** Called when ElementMultiAspects should be exported.
   * @note This should be overridden to actually do the export.
   */
  protected onExportElementMultiAspects(_aspects: ElementMultiAspect[]): void { }

  /** If `true` is returned, then the relationship will be exported.
   * @note This method can optionally be overridden to exclude an individual CodeSpec from the export. The base implementation always returns `true`.
   */
  protected shouldExportRelationship(_relationship: Relationship): boolean { return true; }

  /** Called when a Relationship should be exported.
   * @param relationship The Relationship to export
   * @param isUpdate If defined, then `true` indicates an UPDATE operation while `false` indicates an INSERT operation. If not defined, then INSERT vs. UPDATE is not known.
   * @note This should be overridden to actually do the export.
   */
  protected onExportRelationship(_relationship: Relationship, _isUpdate: boolean | undefined): void { }

  /** Called when a relationship should be deleted. */
  protected onDeleteRelationship(_relInstanceId: Id64String): void { }

  /** If `true` is returned, then the schema will be exported.
   * @note This method can optionally be overridden to exclude an individual schema from the export. The base implementation always returns `true`.
   */
  protected shouldExportSchema(_schema: Schema): boolean { return true; }

  /** Called when an schema should be exported.
   * @param schema The schema to export
   * @note This should be overridden to actually do the export.
   */
  protected onExportSchema(_schema: Schema): void { }

  /** This method is called when IModelExporter has made incremental progress based on the [[IModelExporter.progressInterval]] setting.
   * @note A subclass may override this method to report custom progress. The base implementation does nothing.
   */
  protected onProgress(): void { }

  /** Helper method that allows IModelExporter to call protected methods in IModelExportHandler.
   * @internal
   */
  public get callProtected(): any { return this; }
}

/** Base class for exporting data from an iModel.
 * @note Most uses cases will not require a custom subclass of `IModelExporter`. Instead, it is more typical to subclass/customize [IModelExportHandler]($backend).
 * @see [iModel Transformation and Data Exchange]($docs/learning/backend/IModelTransformation.md), [[registerHandler]], [IModelTransformer]($backend), [IModelImporter]($backend)
 * @beta
 */
export class IModelExporter {
  /** The read-only source iModel. */
  public readonly sourceDb: IModelDb;
  /** A flag that indicates whether element GeometryStreams are loaded or not.
   * @note As an optimization, exporters that don't need geometry can set this flag to `false`. The default is `true`.
   * @see [ElementLoadProps.wantGeometry]($common)
   */
  public wantGeometry: boolean = true;
  /** A flag that indicates whether template models should be exported or not.
   * @note If only exporting *instances* then template models can be skipped since they are just definitions that are cloned to create new instances.
   * @see [Model.isTemplate]($backend)
   */
  public wantTemplateModels: boolean = true;
  /** A flag that indicates whether *system* schemas should be exported or not. The default is `false`.
   * @see [[exportSchemas]]
   */
  public wantSystemSchemas: boolean = false;
  /** A flag that determines whether this IModelExporter should visit Elements or not. The default is `true`.
   * @note This flag is available as an optimization when the exporter doesn't need to visit elements, so can skip loading them.
   */
  public visitElements: boolean = true;
  /** A flag that determines whether this IModelExporter should visit Relationships or not. The default is `true`.
   * @note This flag is available as an optimization when the exporter doesn't need to visit relationships, so can skip loading them.
   */
  public visitRelationships: boolean = true;
  /** The number of entities exported before incremental progress should be reported via the [[onProgress]] callback. */
  public progressInterval: number = 1000;
  /** Tracks the current total number of entities exported. */
  private _progressCounter: number = 0;
  /** Optionally cached entity change information */
  private _sourceDbChanges?: ChangedInstanceIds;
  /** The handler called by this IModelExporter. */
  private _handler: IModelExportHandler | undefined;
  /** The handler called by this IModelExporter. */
  protected get handler(): IModelExportHandler {
    if (undefined === this._handler) { throw new Error("IModelExportHandler not registered"); }
    return this._handler;
  }

  /** The set of CodeSpecs to exclude from the export. */
  private _excludedCodeSpecNames = new Set<string>();
  /** The set of specific Elements to exclude from the export. */
  private _excludedElementIds = new Set<Id64String>();
  /** The set of Categories where Elements in that Category will be excluded from transformation to the target iModel. */
  private _excludedElementCategoryIds = new Set<Id64String>();
  /** The set of classes of Elements that will be excluded (polymorphically) from transformation to the target iModel. */
  private _excludedElementClasses = new Set<typeof Element>();
  /** The set of classes of ElementAspects that will be excluded (polymorphically) from transformation to the target iModel. */
  private _excludedElementAspectClasses = new Set<typeof ElementAspect>();
  /** The set of classFullNames for ElementAspects that will be excluded from transformation to the target iModel. */
  private _excludedElementAspectClassFullNames = new Set<string>();
  /** The set of classes of Relationships that will be excluded (polymorphically) from transformation to the target iModel. */
  private _excludedRelationshipClasses = new Set<typeof Relationship>();

  /** Construct a new IModelExporter
   * @param sourceDb The source IModelDb
   * @see registerHandler
   */
  public constructor(sourceDb: IModelDb) {
    this.sourceDb = sourceDb;
  }

  /** Register the handler that will be called by IModelExporter. */
  public registerHandler(handler: IModelExportHandler): void {
    this._handler = handler;
  }

  /** Add a rule to exclude a CodeSpec */
  public excludeCodeSpec(codeSpecName: string): void {
    this._excludedCodeSpecNames.add(codeSpecName);
  }

  /** Add a rule to exclude a specific Element. */
  public excludeElement(elementId: Id64String): void {
    this._excludedElementIds.add(elementId);
  }

  /** Add a rule to exclude all Elements of a specified Category. */
  public excludeElementCategory(categoryId: Id64String): void {
    this._excludedElementCategoryIds.add(categoryId);
  }

  /** Add a rule to exclude all Elements of a specified class. */
  public excludeElementClass(classFullName: string): void {
    this._excludedElementClasses.add(this.sourceDb.getJsClass<typeof Element>(classFullName));
  }

  /** Add a rule to exclude all ElementAspects of a specified class. */
  public excludeElementAspectClass(classFullName: string): void {
    this._excludedElementAspectClassFullNames.add(classFullName); // allows non-polymorphic exclusion before query
    this._excludedElementAspectClasses.add(this.sourceDb.getJsClass<typeof ElementAspect>(classFullName)); // allows polymorphic exclusion after query/load
  }

  /** Add a rule to exclude all Relationships of a specified class. */
  public excludeRelationshipClass(classFullName: string): void {
    this._excludedRelationshipClasses.add(this.sourceDb.getJsClass<typeof Relationship>(classFullName));
  }

  /** Export all entity instance types from the source iModel.
   * @note [[exportSchemas]] must be called separately.
   */
  public exportAll(): void {
    this.exportCodeSpecs();
    this.exportFonts();
    this.exportModelContainer(this.sourceDb.models.getModel(IModel.repositoryModelId));
    this.exportElement(IModel.rootSubjectId);
    this.exportRepositoryLinks();
    this.exportSubModels(IModel.repositoryModelId);
    this.exportRelationships(ElementRefersToElements.classFullName);
  }

  /** Export changes from the source iModel.
   * @param requestContext The request context
   * @param startChangeSetId Include changes from this changeset up through and including the current changeset.
   * If this parameter is not provided, then just the current changeset will be exported.
   * @note To form a range of versions to export, set `startChangeSetId` for the start of the desired range and open the source iModel as of the end of the desired range.
   */
  public async exportChanges(requestContext: AuthorizedClientRequestContext, startChangeSetId?: GuidString): Promise<void> {
    requestContext.enter();
    if (!this.sourceDb.isBriefcaseDb()) {
      throw new IModelError(IModelStatus.BadRequest, "Must be a briefcase to export changes", Logger.logError, loggerCategory);
    }
    if ((undefined === this.sourceDb.changeSetId) || ("" === this.sourceDb.changeSetId)) {
      this.exportAll(); // no changesets, so revert to exportAll
      return;
    }
    if (undefined === startChangeSetId) {
      startChangeSetId = this.sourceDb.changeSetId;
    }
    this._sourceDbChanges = await ChangedInstanceIds.initialize(requestContext, this.sourceDb, startChangeSetId);
    requestContext.enter();
    this.exportCodeSpecs();
    this.exportFonts();
    this.exportElement(IModel.rootSubjectId);
    this.exportSubModels(IModel.repositoryModelId);
    this.exportRelationships(ElementRefersToElements.classFullName);
    // handle deletes
    if (this.visitElements) {
      for (const elementId of this._sourceDbChanges.element.deleteIds) {
        this.handler.callProtected.onDeleteElement(elementId);
      }
    }
    // WIP: handle ElementAspects?
    for (const modelId of this._sourceDbChanges.model.deleteIds) {
      this.handler.callProtected.onDeleteModel(modelId);
    }
    if (this.visitRelationships) {
      for (const relInstanceId of this._sourceDbChanges.relationship.deleteIds) {
        this.handler.callProtected.onDeleteRelationship(relInstanceId);
      }
    }
  }

  /** Export schemas from the source iModel.
   * @note This must be called separately from [[exportAll]] or [[exportChanges]].
   */
  public exportSchemas(): void {
    const schemaLoader = new IModelSchemaLoader(this.sourceDb);
    const sql = "SELECT Name FROM ECDbMeta.ECSchemaDef ORDER BY ECInstanceId"; // ensure schema dependency order
    let readyToExport: boolean = this.wantSystemSchemas ? true : false;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const schemaName: string = statement.getValue(0).getString();
        const schema: Schema = schemaLoader.getSchema(schemaName);
        if (!readyToExport) {
          readyToExport = schema.fullName === BisCoreSchema.schemaName; // schemas prior to BisCore are considered *system* schemas
        }
        if (readyToExport && this.handler.callProtected.shouldExportSchema(schema)) {
          Logger.logTrace(loggerCategory, `exportSchema(${schemaName})`);
          this.handler.callProtected.onExportSchema(schema);
        }
      }
    });
  }

  /** For logging, indicate the change type if known. */
  private getChangeOpSuffix(isUpdate: boolean | undefined): string {
    return isUpdate ? " UPDATE" : undefined === isUpdate ? "" : " INSERT";
  }

  /** Export all CodeSpecs from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportCodeSpecs(): void {
    Logger.logTrace(loggerCategory, `exportCodeSpecs()`);
    const sql = `SELECT Name FROM BisCore:CodeSpec ORDER BY ECInstanceId`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const codeSpecName: string = statement.getValue(0).getString();
        this.exportCodeSpecByName(codeSpecName);
      }
    });
  }

  /** Export a single CodeSpec from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportCodeSpecByName(codeSpecName: string): void {
    const codeSpec: CodeSpec = this.sourceDb.codeSpecs.getByName(codeSpecName);
    let isUpdate: boolean | undefined;
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      if (this._sourceDbChanges.codeSpec.insertIds.has(codeSpec.id)) {
        isUpdate = false;
      } else if (this._sourceDbChanges.codeSpec.updateIds.has(codeSpec.id)) {
        isUpdate = true;
      } else {
        return; // not in changeSet, don't export
      }
    }
    // passed changeSet test, now apply standard exclusion rules
    if (this._excludedCodeSpecNames.has(codeSpec.name)) {
      Logger.logInfo(loggerCategory, `Excluding CodeSpec: ${codeSpec.name}`);
      return;
    }
    // CodeSpec has passed standard exclusion rules, now give handler a chance to accept/reject export
    if (this.handler.callProtected.shouldExportCodeSpec(codeSpec)) {
      Logger.logTrace(loggerCategory, `exportCodeSpec(${codeSpecName})${this.getChangeOpSuffix(isUpdate)}`);
      this.handler.callProtected.onExportCodeSpec(codeSpec, isUpdate);
      this.trackProgress();
    }
  }

  /** Export a single CodeSpec from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportCodeSpecById(codeSpecId: Id64String): void {
    const codeSpec: CodeSpec = this.sourceDb.codeSpecs.getById(codeSpecId);
    this.exportCodeSpecByName(codeSpec.name);
  }

  /** Export all fonts from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportFonts(): void {
    Logger.logTrace(loggerCategory, `exportFonts()`);
    for (const font of this.sourceDb.fontMap.fonts.values()) {
      this.exportFontByNumber(font.id);
    }
  }

  /** Export a single font from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportFontByName(fontName: string): void {
    Logger.logTrace(loggerCategory, `exportFontByName(${fontName})`);
    const font: FontProps | undefined = this.sourceDb.fontMap.getFont(fontName);
    if (undefined !== font) {
      this.exportFontByNumber(font.id);
    }
  }

  /** Export a single font from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportFontByNumber(fontNumber: number): void {
    let isUpdate: boolean | undefined;
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      const fontId: Id64String = Id64.fromUint32Pair(fontNumber, 0); // changeset information uses Id64String, not number
      if (this._sourceDbChanges.font.insertIds.has(fontId)) {
        isUpdate = false;
      } else if (this._sourceDbChanges.font.updateIds.has(fontId)) {
        isUpdate = true;
      } else {
        return; // not in changeSet, don't export
      }
    }
    Logger.logTrace(loggerCategory, `exportFontById(${fontNumber})`);
    const font: FontProps | undefined = this.sourceDb.fontMap.getFont(fontNumber);
    if (undefined !== font) {
      this.handler.callProtected.onExportFont(font, isUpdate);
      this.trackProgress();
    }
  }

  /** Export the model container, contents, and sub-models from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportModel(modeledElementId: Id64String): void {
    const model: Model = this.sourceDb.models.getModel(modeledElementId);
    if (model.isTemplate && !this.wantTemplateModels) {
      return;
    }
    const modeledElement: Element = this.sourceDb.elements.getElement({ id: modeledElementId, wantGeometry: this.wantGeometry });
    Logger.logTrace(loggerCategory, `exportModel()`);
    if (this.shouldExportElement(modeledElement)) {
      this.exportModelContainer(model);
      if (this.visitElements) {
        this.exportModelContents(modeledElementId);
        this.exportSubModels(modeledElementId);
      }
    }
  }

  /** Export the model (the container only) from the source iModel. */
  private exportModelContainer(model: Model): void {
    let isUpdate: boolean | undefined;
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      if (this._sourceDbChanges.model.insertIds.has(model.id)) {
        isUpdate = false;
      } else if (this._sourceDbChanges.model.updateIds.has(model.id)) {
        isUpdate = true;
      } else {
        return; // not in changeSet, don't export
      }
    }
    this.handler.callProtected.onExportModel(model, isUpdate);
    this.trackProgress();
  }

  /** Export the model contents.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportModelContents(modelId: Id64String, elementClassFullName: string = Element.classFullName): void {
    if (!this.visitElements) {
      Logger.logTrace(loggerCategory, `visitElements=false, skipping exportModelContents()`);
      return;
    }
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      if (!this._sourceDbChanges.model.insertIds.has(modelId) && !this._sourceDbChanges.model.updateIds.has(modelId)) {
        return; // this optimization assumes that the Model changes (LastMod) any time an Element in the Model changes
      }
    }
    Logger.logTrace(loggerCategory, `exportModelContents()`);
    const sql = `SELECT ECInstanceId FROM ${elementClassFullName} WHERE Parent.Id IS NULL AND Model.Id=:modelId ORDER BY ECInstanceId`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId("modelId", modelId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        this.exportElement(statement.getValue(0).getId());
      }
    });
  }

  /** Export the sub-models directly below the specified model.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportSubModels(parentModelId: Id64String): void {
    const definitionModelIds: Id64String[] = [];
    const otherModelIds: Id64String[] = [];
    const sql = `SELECT ECInstanceId FROM ${Model.classFullName} WHERE ParentModel.Id=:parentModelId ORDER BY ECInstanceId`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId("parentModelId", parentModelId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const modelId: Id64String = statement.getValue(0).getId();
        const model: Model = this.sourceDb.models.getModel(modelId);
        if (model instanceof DefinitionModel) {
          definitionModelIds.push(modelId);
        } else {
          otherModelIds.push(modelId);
        }
      }
    });
    // export DefinitionModels before other types of Models
    definitionModelIds.forEach((modelId: Id64String) => this.exportModel(modelId));
    otherModelIds.forEach((modelId: Id64String) => this.exportModel(modelId));
  }

  /** Returns true if the specified element should be exported. */
  private shouldExportElement(element: Element): boolean {
    if (this._excludedElementIds.has(element.id)) {
      Logger.logInfo(loggerCategory, `Excluded element by Id`);
      return false;
    }
    if (element instanceof GeometricElement) {
      if (this._excludedElementCategoryIds.has(element.category)) {
        Logger.logInfo(loggerCategory, `Excluded element by Category`);
        return false;
      }
    }
    if (!this.wantTemplateModels && (element instanceof RecipeDefinitionElement)) {
      Logger.logInfo(loggerCategory, `Excluded recipe because wantTemplate=false`);
      return false;
    }
    for (const excludedElementClass of this._excludedElementClasses) {
      if (element instanceof excludedElementClass) {
        Logger.logInfo(loggerCategory, `Excluded element by class: ${excludedElementClass.classFullName}`);
        return false;
      }
    }
    // element has passed standard exclusion rules, now give handler a chance to accept/reject
    return this.handler.callProtected.shouldExportElement(element);
  }

  /** Export the specified element, its child elements (if applicable), and any owned ElementAspects.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportElement(elementId: Id64String): void {
    if (!this.visitElements) {
      Logger.logTrace(loggerCategory, `visitElements=false, skipping exportElement(${elementId})`);
      return;
    }
    let isUpdate: boolean | undefined;
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      if (this._sourceDbChanges.element.insertIds.has(elementId)) {
        isUpdate = false;
      } else if (this._sourceDbChanges.element.updateIds.has(elementId)) {
        isUpdate = true;
      } else {
        // NOTE: This optimization assumes that the Element will change (LastMod) if an owned ElementAspect changes
        // NOTE: However, child elements may have changed without the parent changing
        this.exportChildElements(elementId);
        return;
      }
    }
    const element: Element = this.sourceDb.elements.getElement({ id: elementId, wantGeometry: this.wantGeometry });
    Logger.logTrace(loggerCategory, `exportElement(${element.id}, "${element.getDisplayLabel()}")${this.getChangeOpSuffix(isUpdate)}`);
    if (this.shouldExportElement(element)) {
      this.handler.callProtected.onExportElement(element, isUpdate);
      this.trackProgress();
      this.exportElementAspects(elementId);
      this.exportChildElements(elementId);
    }
  }

  /** Export the child elements of the specified element from the source iModel.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportChildElements(elementId: Id64String): void {
    if (!this.visitElements) {
      Logger.logTrace(loggerCategory, `visitElements=false, skipping exportChildElements(${elementId})`);
      return;
    }
    const childElementIds: Id64String[] = this.sourceDb.elements.queryChildren(elementId);
    if (childElementIds.length > 0) {
      Logger.logTrace(loggerCategory, `exportChildElements(${elementId})`);
      for (const childElementId of childElementIds) {
        this.exportElement(childElementId);
      }
    }
  }

  /** Export RepositoryLinks in the RepositoryModel. */
  public exportRepositoryLinks(): void {
    if (!this.visitElements) {
      Logger.logTrace(loggerCategory, `visitElements=false, skipping exportRepositoryLinks()`);
      return;
    }
    const sql = `SELECT ECInstanceId FROM ${RepositoryLink.classFullName} WHERE Parent.Id IS NULL AND Model.Id=:modelId ORDER BY ECInstanceId`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId("modelId", IModel.repositoryModelId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        this.exportElement(statement.getValue(0).getId());
      }
    });
  }

  /** Returns `true` if the specified ElementAspect should be exported or `false` if if should be excluded. */
  private shouldExportElementAspect(aspect: ElementAspect): boolean {
    for (const excludedElementAspectClass of this._excludedElementAspectClasses) {
      if (aspect instanceof excludedElementAspectClass) {
        Logger.logInfo(loggerCategory, `Excluded ElementAspect by class: ${aspect.classFullName}`);
        return false;
      }
    }
    // ElementAspect has passed standard exclusion rules, now give handler a chance to accept/reject
    return this.handler.callProtected.shouldExportElementAspect(aspect);
  }

  /** Export ElementAspects from the specified element from the source iModel. */
  private exportElementAspects(elementId: Id64String): void {
    // ElementUniqueAspects
    let uniqueAspects: ElementUniqueAspect[] = this.sourceDb.elements._queryAspects(elementId, ElementUniqueAspect.classFullName, this._excludedElementAspectClassFullNames);
    if (uniqueAspects.length > 0) {
      uniqueAspects = uniqueAspects.filter((a) => this.shouldExportElementAspect(a));
      if (uniqueAspects.length > 0) {
        uniqueAspects.forEach((uniqueAspect: ElementUniqueAspect) => {
          if (undefined !== this._sourceDbChanges) { // is changeSet information available?
            if (this._sourceDbChanges.aspect.insertIds.has(uniqueAspect.id)) {
              this.handler.callProtected.onExportElementUniqueAspect(uniqueAspect, false);
              this.trackProgress();
            } else if (this._sourceDbChanges.aspect.updateIds.has(uniqueAspect.id)) {
              this.handler.callProtected.onExportElementUniqueAspect(uniqueAspect, true);
              this.trackProgress();
            } else {
              // not in changeSet, don't export
            }
          } else {
            this.handler.callProtected.onExportElementUniqueAspect(uniqueAspect, undefined);
            this.trackProgress();
          }
        });
      }
    }
    // ElementMultiAspects
    let multiAspects: ElementMultiAspect[] = this.sourceDb.elements._queryAspects(elementId, ElementMultiAspect.classFullName, this._excludedElementAspectClassFullNames);
    if (multiAspects.length > 0) {
      multiAspects = multiAspects.filter((a) => this.shouldExportElementAspect(a));
      if (multiAspects.length > 0) {
        this.handler.callProtected.onExportElementMultiAspects(multiAspects);
        this.trackProgress();
      }
    }
  }

  /** Exports all relationships that subclass from the specified base class.
   * @note This method is called from [[exportChanges]] and [[exportAll]], so it only needs to be called directly when exporting a subset of an iModel.
   */
  public exportRelationships(baseRelClassFullName: string): void {
    if (!this.visitRelationships) {
      Logger.logTrace(loggerCategory, `visitRelationships=false, skipping exportRelationships()`);
      return;
    }
    Logger.logTrace(loggerCategory, `exportRelationships(${baseRelClassFullName})`);
    const sql = `SELECT ECInstanceId FROM ${baseRelClassFullName}`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const relInstanceId: Id64String = statement.getValue(0).getId();
        const relProps: RelationshipProps = this.sourceDb.relationships.getInstanceProps(baseRelClassFullName, relInstanceId);
        this.exportRelationship(relProps.classFullName, relInstanceId); // must call exportRelationship using the actual classFullName, not baseRelClassFullName
      }
    });
  }

  /** Export a relationship from the source iModel. */
  public exportRelationship(relClassFullName: string, relInstanceId: Id64String): void {
    if (!this.visitRelationships) {
      Logger.logTrace(loggerCategory, `visitRelationships=false, skipping exportRelationship(${relClassFullName}, ${relInstanceId})`);
      return;
    }
    let isUpdate: boolean | undefined;
    if (undefined !== this._sourceDbChanges) { // is changeSet information available?
      if (this._sourceDbChanges.relationship.insertIds.has(relInstanceId)) {
        isUpdate = false;
      } else if (this._sourceDbChanges.relationship.updateIds.has(relInstanceId)) {
        isUpdate = true;
      } else {
        return; // not in changeSet, don't export
      }
    }
    // passed changeSet test, now apply standard exclusion rules
    Logger.logTrace(loggerCategory, `exportRelationship(${relClassFullName}, ${relInstanceId})`);
    const relationship: Relationship = this.sourceDb.relationships.getInstance(relClassFullName, relInstanceId);
    for (const excludedRelationshipClass of this._excludedRelationshipClasses) {
      if (relationship instanceof excludedRelationshipClass) {
        Logger.logInfo(loggerCategory, `Excluded relationship by class: ${excludedRelationshipClass.classFullName}`);
        return;
      }
    }
    // relationship has passed standard exclusion rules, now give handler a chance to accept/reject export
    if (this.handler.callProtected.shouldExportRelationship(relationship)) {
      this.handler.callProtected.onExportRelationship(relationship, isUpdate);
      this.trackProgress();
    }
  }

  /** Tracks incremental progress */
  private trackProgress(): void {
    this._progressCounter++;
    if (0 === (this._progressCounter % this.progressInterval)) {
      this.handler.callProtected.onProgress();
    }
  }
}

class ChangedInstanceOps {
  public insertIds = new Set<Id64String>();
  public updateIds = new Set<Id64String>();
  public deleteIds = new Set<Id64String>();
  public addFromJson(val: IModelJsNative.ChangedInstanceOpsProps | undefined): void {
    if (undefined !== val) {
      if ((undefined !== val.insert) && (Array.isArray(val.insert))) { val.insert.forEach((id: Id64String) => this.insertIds.add(id)); }
      if ((undefined !== val.update) && (Array.isArray(val.update))) { val.update.forEach((id: Id64String) => this.updateIds.add(id)); }
      if ((undefined !== val.delete) && (Array.isArray(val.delete))) { val.delete.forEach((id: Id64String) => this.deleteIds.add(id)); }
    }
  }
}

class ChangedInstanceIds {
  public codeSpec = new ChangedInstanceOps();
  public model = new ChangedInstanceOps();
  public element = new ChangedInstanceOps();
  public aspect = new ChangedInstanceOps();
  public relationship = new ChangedInstanceOps();
  public font = new ChangedInstanceOps();
  private constructor() { }
  public static async initialize(requestContext: AuthorizedClientRequestContext, iModelDb: BriefcaseDb, startChangeSetId: GuidString): Promise<ChangedInstanceIds> {
    requestContext.enter();
    const extractContext = new ChangeSummaryExtractContext(iModelDb); // NOTE: ChangeSummaryExtractContext is nothing more than a wrapper around IModelDb that has a method to get the iModelId
    // NOTE: ChangeSummaryManager.downloadChangeSets has nothing really to do with change summaries but has the desired behavior of including the start changeSet (unlike BriefcaseManager.downloadChangeSets)
    const changeSets = await ChangeSummaryManager.downloadChangeSets(requestContext, extractContext, startChangeSetId, iModelDb.changeSetId);
    requestContext.enter();
    const changedInstanceIds = new ChangedInstanceIds();
    changeSets.forEach((changeSet: ChangeSet): void => {
      const changeSetPath: string = path.join(BriefcaseManager.getChangeSetsPath(iModelDb.iModelId), changeSet.fileName!);
      const statusOrResult: IModelJsNative.ErrorStatusOrResult<IModelStatus, any> = iModelDb.nativeDb.extractChangedInstanceIdsFromChangeSet(changeSetPath);
      if (undefined !== statusOrResult.error) {
        throw new IModelError(statusOrResult.error.status, "Error processing changeSet", Logger.logError, loggerCategory);
      }
      if ("" !== statusOrResult.result) {
        const result: IModelJsNative.ChangedInstanceIdsProps = JSON.parse(statusOrResult.result);
        changedInstanceIds.codeSpec.addFromJson(result.codeSpec);
        changedInstanceIds.model.addFromJson(result.model);
        changedInstanceIds.element.addFromJson(result.element);
        changedInstanceIds.aspect.addFromJson(result.aspect);
        changedInstanceIds.relationship.addFromJson(result.relationship);
        changedInstanceIds.font.addFromJson(result.font);
      }
    });
    return changedInstanceIds;
  }
}
