/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, ClientRequestContext, DbResult, Id64, Id64Array, Id64Set, Id64String, Logger } from "@bentley/bentleyjs-core";
import {
  Category, CategorySelector, DisplayStyle, DisplayStyle3d, ECSqlStatement, Element, ElementRefersToElements, GeometricModel3d, GeometryPart,
  IModelDb, IModelTransformer, IModelTransformOptions, ModelSelector, PhysicalModel, PhysicalPartition, Relationship, SpatialCategory,
  SpatialViewDefinition, SubCategory, ViewDefinition,
} from "@bentley/imodeljs-backend";
import { ElementProps, IModel } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";

export const loggerCategory = "imodel-transformer";

export interface TransformerOptions extends IModelTransformOptions {
  simplifyElementGeometry?: boolean;
  combinePhysicalModels?: boolean;
  exportViewDefinition?: Id64String;
  deleteUnusedGeometryParts?: boolean;
  excludeSubCategories?: string[];
  excludeCategories?: string[];
}

export class Transformer extends IModelTransformer {
  private _authorizedClientRequestContext?: AuthorizedClientRequestContext;
  private _numSourceElements = 0;
  private _numSourceElementsProcessed = 0;
  private _numSourceRelationships = 0;
  private _numSourceRelationshipsProcessed = 0;
  private _startTime = new Date();
  private _targetPhysicalModelId = Id64.invalid; // will be valid when PhysicalModels are being combined

  public static async transformAll(requestContext: AuthorizedClientRequestContext | ClientRequestContext, sourceDb: IModelDb, targetDb: IModelDb, options?: TransformerOptions): Promise<void> {
    requestContext.enter();
    // might need to inject RequestContext for schemaExport.
    const transformer = new Transformer(sourceDb, targetDb, options);
    transformer.initialize(options);
    await transformer.processSchemas(requestContext);
    await transformer.saveChanges("processSchemas");
    await transformer.processAll();
    await transformer.saveChanges("processAll");
    if (options?.deleteUnusedGeometryParts) {
      transformer.deleteUnusedGeometryParts();
      await transformer.saveChanges("deleteUnusedGeometryParts");
    }
    transformer.dispose();
    transformer.logElapsedTime();
  }

  public static async transformChanges(requestContext: AuthorizedClientRequestContext, sourceDb: IModelDb, targetDb: IModelDb, sourceStartChangesetId: string, options?: TransformerOptions): Promise<void> {
    if ("" === sourceDb.changeset.id) {
      assert("" === sourceStartChangesetId);
      return this.transformAll(requestContext, sourceDb, targetDb, options);
    }
    const transformer = new Transformer(sourceDb, targetDb, options);
    transformer.initialize(options);
    await transformer.processSchemas(requestContext);
    await transformer.saveChanges("processSchemas");
    await transformer.processChanges(requestContext, sourceStartChangesetId);
    await transformer.saveChanges("processChanges");
    if (options?.deleteUnusedGeometryParts) {
      transformer.deleteUnusedGeometryParts();
      await transformer.saveChanges("deleteUnusedGeometryParts");
    }
    transformer.dispose();
    transformer.logElapsedTime();
  }

  private constructor(sourceDb: IModelDb, targetDb: IModelDb, options?: IModelTransformOptions) {
    super(sourceDb, targetDb, options);
  }

  private initialize(options?: TransformerOptions): void {
    Logger.logInfo(loggerCategory, `sourceDb=${this.sourceDb.pathName}`);
    Logger.logInfo(loggerCategory, `targetDb=${this.targetDb.pathName}`);
    this.logChangeTrackingMemoryUsed();

    // customize transformer using the specified options
    if (options?.simplifyElementGeometry) {
      this.importer.simplifyElementGeometry = true;
    }
    if (options?.combinePhysicalModels) {
      this._targetPhysicalModelId = PhysicalModel.insert(this.targetDb, IModel.rootSubjectId, "CombinedPhysicalModel"); // WIP: Id should be passed in, not inserted here
      this.importer.doNotUpdateElementIds.add(this._targetPhysicalModelId);
    }
    if (options?.exportViewDefinition) {
      const spatialViewDefinition = this.sourceDb.elements.getElement<SpatialViewDefinition>(options.exportViewDefinition, SpatialViewDefinition);
      const categorySelector = this.sourceDb.elements.getElement<CategorySelector>(spatialViewDefinition.categorySelectorId, CategorySelector);
      const modelSelector = this.sourceDb.elements.getElement<ModelSelector>(spatialViewDefinition.modelSelectorId, ModelSelector);
      const displayStyle = this.sourceDb.elements.getElement<DisplayStyle3d>(spatialViewDefinition.displayStyleId, DisplayStyle3d);
      // Exclude all ViewDefinition-related classes because a new view will be generated in the target iModel
      this.exporter.excludeElementClass(ViewDefinition.classFullName);
      this.exporter.excludeElementClass(CategorySelector.classFullName);
      this.exporter.excludeElementClass(ModelSelector.classFullName);
      this.exporter.excludeElementClass(DisplayStyle.classFullName);
      // Exclude categories not in the CategorySelector
      this.excludeCategoriesExcept(Id64.toIdSet(categorySelector.categories));
      // Exclude models not in the ModelSelector
      this.excludeModelsExcept(Id64.toIdSet(modelSelector.models));
      // Exclude elements excluded by the DisplayStyle
      for (const excludedElementId of displayStyle.settings.excludedElementIds) {
        this.exporter.excludeElement(excludedElementId);
      }
      // Exclude SubCategories that are not visible in the DisplayStyle
      for (const [subCategoryId, subCategoryOverride] of displayStyle.settings.subCategoryOverrides) {
        if (subCategoryOverride.invisible) {
          this.excludeSubCategory(subCategoryId);
        }
      }
    }
    if (options?.excludeSubCategories) {
      this.excludeSubCategories(options.excludeSubCategories);
    }
    if (options?.excludeCategories) {
      this.excludeCategories(options.excludeCategories);
    }

    // query for and log the number of source Elements that will be processed
    this._numSourceElements = this.sourceDb.withPreparedStatement(`SELECT COUNT(*) FROM ${Element.classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
    Logger.logInfo(loggerCategory, `numSourceElements=${this._numSourceElements}`);

    // query for and log the number of source Relationships that will be processed
    this._numSourceRelationships = this.sourceDb.withPreparedStatement(`SELECT COUNT(*) FROM ${ElementRefersToElements.classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
    Logger.logInfo(loggerCategory, `numSourceRelationships=${this._numSourceRelationships}`);
  }

  /** Initialize IModelTransformer to exclude SubCategory Elements and geometry entries in a SubCategory from the target iModel.
   * @param subCategoryNames Array of SubCategory names to exclude
   * @note This sample code assumes that you want to exclude all SubCategories of a given name regardless of parent Category
   */
  private excludeSubCategories(subCategoryNames: string[]): void {
    const sql = `SELECT ECInstanceId FROM ${SubCategory.classFullName} WHERE CodeValue=:subCategoryName`;
    for (const subCategoryName of subCategoryNames) {
      this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
        statement.bindString("subCategoryName", subCategoryName);
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          this.excludeSubCategory(statement.getValue(0).getId());
        }
      });
    }
  }

  /** Initialize IModelTransformer to exclude a specific SubCategory.
   * @note The geometry entries in the specified SubCategory are always filtered out.
   * @note The SubCategory element itself is only excluded if it is not the default SubCategory.
   */
  private excludeSubCategory(subCategoryId: Id64String): void {
    const subCategory = this.sourceDb.elements.getElement<SubCategory>(subCategoryId, SubCategory);
    this.context.filterSubCategory(subCategoryId); // filter out geometry entries in this SubCategory from the target iModel
    if (!subCategory.isDefaultSubCategory) { // cannot exclude a default SubCategory
      this.exporter.excludeElement(subCategoryId); // exclude the SubCategory Element itself from the target iModel
    }
  }

  /** Initialize IModelTransformer to exclude Category Elements and geometry entries in a Category from the target iModel.
   * @param CategoryNames Array of Category names to exclude
   * @note This sample code assumes that you want to exclude all Categories of a given name regardless of the containing model (that scopes the CodeValue).
   */
  private excludeCategories(categoryNames: string[]): void {
    const sql = `SELECT ECInstanceId FROM ${Category.classFullName} WHERE CodeValue=:categoryName`;
    for (const categoryName of categoryNames) {
      this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
        statement.bindString("categoryName", categoryName);
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          const categoryId = statement.getValue(0).getId();
          this.exporter.excludeElementsInCategory(categoryId); // exclude elements in this category
          this.exporter.excludeElement(categoryId); // exclude the category element itself
        }
      });
    }
  }

  /** Excludes categories not referenced by the specified Id64Set. */
  private excludeCategoriesExcept(categoryIds: Id64Set): void {
    const sql = `SELECT ECInstanceId FROM ${SpatialCategory.classFullName}`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const categoryId = statement.getValue(0).getId();
        if (!categoryIds.has(categoryId)) {
          this.exporter.excludeElementsInCategory(categoryId); // exclude elements in this category
          this.exporter.excludeElement(categoryId); // exclude the category element itself
        }
      }
    });
  }

  /** Excludes models not referenced by the specified Id64Set.
   * @note This really excludes the *modeled element* (which also excludes the model) since we don't want *modeled elements* without a sub-model.
  */
  private excludeModelsExcept(modelIds: Id64Set): void {
    const sql = `SELECT ECInstanceId FROM ${GeometricModel3d.classFullName}`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const modelId = statement.getValue(0).getId();
        if (!modelIds.has(modelId)) {
          this.exporter.excludeElement(modelId); // exclude the category element itself
        }
      }
    });
  }

  /** Override that counts elements processed and optionally remaps PhysicalPartitions.
   * @note Override of IModelExportHandler.shouldExportElement
   */
  protected override shouldExportElement(sourceElement: Element): boolean {
    if (this._numSourceElementsProcessed < this._numSourceElements) { // with deferred element processing, the number processed can be more than the total
      ++this._numSourceElementsProcessed;
    }
    if (Id64.isValidId64(this._targetPhysicalModelId) && (sourceElement instanceof PhysicalPartition)) {
      this.context.remapElement(sourceElement.id, this._targetPhysicalModelId); // combine all source PhysicalModels into a single target PhysicalModel
      // NOTE: must allow export to continue so the PhysicalModel sub-modeling the PhysicalPartition is processed
    }
    return super.shouldExportElement(sourceElement);
  }

  /** This override of IModelTransformer.onTransformElement exists for debugging purposes */
  protected override onTransformElement(sourceElement: Element): ElementProps {
    // if (sourceElement.id === "0x0" || sourceElement.getDisplayLabel() === "xxx") { // use logging to find something unique about the problem element
    //   Logger.logInfo(progressLoggerCategory, "Found problem element"); // set breakpoint here
    // }
    return super.onTransformElement(sourceElement);
  }

  protected override shouldExportRelationship(relationship: Relationship): boolean {
    if (this._numSourceRelationshipsProcessed < this._numSourceRelationships) {
      ++this._numSourceRelationshipsProcessed;
    }
    return super.shouldExportRelationship(relationship);
  }

  protected override async onProgress(): Promise<void> {
    if (this._numSourceElementsProcessed > 0) {
      if (this._numSourceElementsProcessed >= this._numSourceElements) {
        Logger.logInfo(loggerCategory, `Processed all ${this._numSourceElements} elements`);
      } else {
        Logger.logInfo(loggerCategory, `Processed ${this._numSourceElementsProcessed} of ${this._numSourceElements} elements`);
      }
    }
    if (this._numSourceRelationshipsProcessed > 0) {
      if (this._numSourceRelationshipsProcessed >= this._numSourceRelationships) {
        Logger.logInfo(loggerCategory, `Processed all ${this._numSourceRelationships} relationships`);
      } else {
        Logger.logInfo(loggerCategory, `Processed ${this._numSourceRelationshipsProcessed} of ${this._numSourceRelationships} relationships`);
      }
    }
    this.logElapsedTime();
    this.logChangeTrackingMemoryUsed();
    await this.saveChanges("onProgress");
    return super.onProgress();
  }

  private async saveChanges(description: string): Promise<void> {
    if (this.targetDb.isBriefcaseDb()) {
      assert(this._authorizedClientRequestContext !== undefined);
      await this.targetDb.concurrencyControl.request(this._authorizedClientRequestContext);
      this.targetDb.saveChanges(description);
    } else {
      this.targetDb.saveChanges(description);
    }
  }

  private logElapsedTime(): void {
    const elapsedTimeMinutes: number = (new Date().valueOf() - this._startTime.valueOf()) / 60000.0;
    Logger.logInfo(loggerCategory, `Elapsed time: ${Math.round(100 * elapsedTimeMinutes) / 100.0} minutes`);
  }

  public logChangeTrackingMemoryUsed(): void {
    if (this.targetDb.isBriefcase) {
      const bytesUsed = this.targetDb.nativeDb.getChangeTrackingMemoryUsed(); // can't call this internal method unless targetDb has change tracking enabled
      const mbUsed = Math.round((bytesUsed * 100) / (1024 * 1024)) / 100;
      Logger.logInfo(loggerCategory, `Change Tracking Memory Used: ${mbUsed} MB`);
    }
  }

  private deleteUnusedGeometryParts(): void {
    const geometryPartIds: Id64Array = [];
    const sql = `SELECT ECInstanceId FROM ${GeometryPart.classFullName}`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        geometryPartIds.push(statement.getValue(0).getId());
      }
    });
    this.targetDb.elements.deleteDefinitionElements(geometryPartIds); // will delete only if unused
  }
}
