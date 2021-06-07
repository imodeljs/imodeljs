/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import * as path from "path";
import { gt as versionGt, gte as versionGte, lt as versionLt } from "semver";
import { assert, ClientRequestContext, DbResult, Id64String } from "@bentley/bentleyjs-core";
import {
  DefinitionElement, DefinitionModel, DefinitionPartition, ECSqlStatement, IModelDb, KnownLocations, Model, Subject,
} from "@bentley/imodeljs-backend";
import {
  BisCodeSpec, Code, CodeScopeSpec, CodeSpec, DefinitionElementProps, InformationPartitionElementProps, ModelProps, SubjectProps,
} from "@bentley/imodeljs-common";
import { Ruleset } from "@bentley/presentation-common";
import { PresentationRules } from "./domain/PresentationRulesDomain";
import * as RulesetElements from "./domain/RulesetElements";
import { isEnum, normalizeVersion } from "./Utils";

/**
 * Strategies for handling duplicate rulesets.
 * @beta
 * @deprecated Use [[RulesetInsertOptions]]
 */
export enum DuplicateRulesetHandlingStrategy {
  /** Do not insert the ruleset if another ruleset with the same ID already exists. */
  Skip,

  /** Replace already existing ruleset if one exists with the same ID and version. */
  Replace,
}

/**
 * Options for [[RulesetEmbedder.insertRuleset]] operation.
 * @beta
 */
export interface RulesetInsertOptions {
  /**
   * When should insertion be skipped:
   * - `same-id` - if iModel already contains a ruleset with the same id and **any** version
   * - `same-id-and-version-eq` - if iModel already contains a ruleset with same id and version
   * - `same-id-and-version-gte` - if iModel already contains a ruleset with same id and
   * version greater or equal to version of the inserted ruleset.
   *
   * Defaults to `same-id-and-version-eq`.
   */
  skip?: "never" | "same-id" | "same-id-and-version-eq" | "same-id-and-version-gte";

  /**
   * Which existing versions of rulesets with same id should be replaced when we insert a new one:
   * - `all` - replace all rulesets with same id.
   * - `all-lower` - replace rulesets with same id and version lower than the version of inserted ruleset.
   * - `exact` - replace only the ruleset whose id and version matches the inserted ruleset.
   *
   * Defaults to `exact`.
   */
  replaceVersions?: "all" | "all-lower" | "exact";
}

/**
 * Properties for creating a `RulesetEmbedder` instance.
 * @public
 */
export interface RulesetEmbedderProps {
  /** iModel to embed rulesets to */
  imodel: IModelDb;
}

/**
 * An API for embedding presentation rulesets into iModels.
 * @beta
 */
export class RulesetEmbedder {

  private _imodel: IModelDb;
  private readonly _schemaPath = path.join(KnownLocations.nativeAssetsDir, "ECSchemas/Domain/PresentationRules.ecschema.xml");
  private readonly _rulesetModelName = "PresentationRules";
  private readonly _rulesetSubjectName = "PresentationRules";

  /**
   * Constructs RulesetEmbedder
   */
  public constructor(props: RulesetEmbedderProps) {
    PresentationRules.registerSchema();
    this._imodel = props.imodel;
  }

  /**
   * Inserts a ruleset into iModel.
   * @param ruleset Ruleset to insert.
   * @param duplicateHandlingStrategy Strategy for handling duplicate rulesets. Defaults to [[DuplicateRulesetHandlingStrategy.Skip]].
   * @returns ID of inserted ruleset element.
   * @deprecated Use an overload with [[RulesetInsertOptions]]
   */
  public async insertRuleset(ruleset: Ruleset, duplicateHandlingStrategy: DuplicateRulesetHandlingStrategy): Promise<Id64String>; // eslint-disable-line deprecation/deprecation
  /**
   * Inserts a ruleset into iModel.
   * @param ruleset Ruleset to insert.
   * @param options Options for inserting a ruleset.
   * @returns ID of inserted ruleset element or, if insertion was skipped, ID of existing ruleset with the same ID and highest version.
   */
  public async insertRuleset(ruleset: Ruleset, options?: RulesetInsertOptions): Promise<Id64String>;
  public async insertRuleset(ruleset: Ruleset, options?: RulesetInsertOptions | DuplicateRulesetHandlingStrategy): Promise<Id64String> { // eslint-disable-line deprecation/deprecation
    const normalizedOptions = normalizeRulesetInsertOptions(options);
    const rulesetVersion = normalizeVersion(ruleset.version);

    // ensure imodel has PresentationRules schema and required CodeSpecs
    await this.handleElementOperationPrerequisites();

    // find all rulesets with the same ID
    const rulesetsWithSameId: Array<{
      ruleset: Ruleset;
      id: Id64String;
      normalizedVersion: string;
    }> = [];
    const query = `
      SELECT ECInstanceId, JsonProperties
      FROM ${RulesetElements.Ruleset.schema.name}.${RulesetElements.Ruleset.className}
      WHERE json_extract(JsonProperties, '$.jsonProperties.id') = :rulesetId`;
    for await (const row of this._imodel.query(query, { rulesetId: ruleset.id })) {
      const existingRulesetElementId: Id64String = row.id;
      const existingRuleset: Ruleset = JSON.parse(row.jsonProperties).jsonProperties;
      rulesetsWithSameId.push({
        id: existingRulesetElementId,
        ruleset: existingRuleset,
        normalizedVersion: normalizeVersion(existingRuleset.version),
      });
    }

    // check if we need to do anything at all
    const shouldSkip = normalizedOptions.skip === "same-id" && rulesetsWithSameId.length > 0
      || normalizedOptions.skip === "same-id-and-version-eq" && rulesetsWithSameId.some((entry) => entry.normalizedVersion === rulesetVersion)
      || normalizedOptions.skip === "same-id-and-version-gte" && rulesetsWithSameId.some((entry) => versionGte(entry.normalizedVersion, rulesetVersion));
    if (shouldSkip) {
      // we're not inserting anything - return ID of the ruleset element with the highest version
      const rulesetEntryWithHighestVersion = rulesetsWithSameId.reduce((highest, curr) => {
        if (!highest.ruleset.version || curr.ruleset.version && versionGt(curr.ruleset.version, highest.ruleset.version))
          return curr;
        return highest;
      }, rulesetsWithSameId[0]);
      return rulesetEntryWithHighestVersion.id;
    }

    // if requested, delete existing rulesets
    const rulesetsToRemove: Id64String[] = [];
    const shouldRemove = (_: Ruleset, normalizedVersion: string): boolean => {
      switch (normalizedOptions.replaceVersions) {
        case "all":
          return normalizedVersion !== rulesetVersion;
        case "all-lower":
          return normalizedVersion !== rulesetVersion && versionLt(normalizedVersion, rulesetVersion);
      }
      return false;
    };
    rulesetsWithSameId.forEach((entry) => {
      if (shouldRemove(entry.ruleset, entry.normalizedVersion))
        rulesetsToRemove.push(entry.id);
    });
    this._imodel.elements.deleteElement(rulesetsToRemove);

    // attempt to update ruleset with same ID and version
    const exactMatch = rulesetsWithSameId.find((curr) => curr.normalizedVersion === rulesetVersion);
    if (exactMatch !== undefined) {
      return this.updateRuleset(exactMatch.id, ruleset);
    }

    // no exact match found - insert a new ruleset element
    const model = this.getOrCreateRulesetModel();
    const rulesetCode = RulesetElements.Ruleset.createRulesetCode(this._imodel, model.id, ruleset);
    return this.insertNewRuleset(ruleset, model, rulesetCode);
  }

  private updateRuleset(elementId: Id64String, ruleset: Ruleset) {
    const existingRulesetElement = this._imodel.elements.tryGetElement<DefinitionElement>(elementId);
    assert(existingRulesetElement !== undefined);
    existingRulesetElement.jsonProperties.jsonProperties = ruleset;
    existingRulesetElement.update();
    this._imodel.saveChanges();
    return existingRulesetElement.id;
  }

  private insertNewRuleset(ruleset: Ruleset, model: Model, rulesetCode: Code): Id64String {
    const props: DefinitionElementProps = {
      model: model.id,
      code: rulesetCode,
      classFullName: RulesetElements.Ruleset.classFullName,
      jsonProperties: { jsonProperties: ruleset },
    };
    const id = this._imodel.elements.insertElement(props);
    this._imodel.saveChanges();
    return id;
  }

  /**
   * Get all rulesets embedded in the iModel.
   */
  public async getRulesets(): Promise<Ruleset[]> {
    if (!this._imodel.containsClass(RulesetElements.Ruleset.classFullName))
      return [];

    const rulesetList: Ruleset[] = [];
    this._imodel.withPreparedStatement(`SELECT ECInstanceId AS id FROM ${RulesetElements.Ruleset.classFullName}`, (statement: ECSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const row = statement.getRow();
        const rulesetElement = this._imodel.elements.getElement({ id: row.id });
        const ruleset = rulesetElement.jsonProperties.jsonProperties;
        rulesetList.push(ruleset);
      }
    });
    return rulesetList;
  }

  private getOrCreateRulesetModel(): DefinitionModel {
    const rulesetModel = this.queryRulesetModel();
    if (undefined !== rulesetModel)
      return rulesetModel;

    const rulesetSubject: Subject = this.insertSubject();
    const definitionPartition: DefinitionPartition = this.insertDefinitionPartition(rulesetSubject);
    return this.insertDefinitionModel(definitionPartition);
  }

  private queryRulesetModel(): DefinitionModel | undefined {
    const definitionPartition = this.queryDefinitionPartition();
    if (undefined === definitionPartition)
      return undefined;

    return this._imodel.models.getSubModel(definitionPartition.id);
  }

  private queryDefinitionPartition(): DefinitionPartition | undefined {
    const subject = this.querySubject();
    if (undefined === subject)
      return undefined;

    return this._imodel.elements.tryGetElement<DefinitionPartition>(DefinitionPartition.createCode(this._imodel, subject.id, this._rulesetModelName));
  }

  private querySubject(): DefinitionPartition | undefined {
    const root = this._imodel.elements.getRootSubject();
    const codeSpec: CodeSpec = this._imodel.codeSpecs.getByName(BisCodeSpec.subject);
    const code = new Code({
      spec: codeSpec.id,
      scope: root.id,
      value: this._rulesetSubjectName,
    });

    return this._imodel.elements.tryGetElement<DefinitionPartition>(code);
  }

  private insertDefinitionModel(definitionPartition: DefinitionPartition): DefinitionModel {
    const modelProps: ModelProps = {
      modeledElement: definitionPartition,
      name: this._rulesetModelName,
      classFullName: DefinitionModel.classFullName,
      isPrivate: true,
    };

    const model = this._imodel.models.createModel(modelProps);
    this._imodel.models.insertModel(model);
    return model;
  }

  private insertDefinitionPartition(rulesetSubject: Subject): DefinitionPartition {
    const partitionCode = DefinitionPartition.createCode(this._imodel, rulesetSubject.id, this._rulesetModelName);
    const definitionPartitionProps: InformationPartitionElementProps = {
      parent: {
        id: rulesetSubject.id,
        relClassName: "BisCore:SubjectOwnsPartitionElements",
      },
      model: rulesetSubject.model,
      code: partitionCode,
      classFullName: DefinitionPartition.classFullName,
    };
    const id = this._imodel.elements.insertElement(definitionPartitionProps);
    return this._imodel.elements.getElement(id);
  }

  private insertSubject(): Subject {
    const root = this._imodel.elements.getRootSubject();
    const codeSpec: CodeSpec = this._imodel.codeSpecs.getByName(BisCodeSpec.subject);
    const subjectCode = new Code({
      spec: codeSpec.id,
      scope: root.id,
      value: this._rulesetSubjectName,
    });
    const subjectProps: SubjectProps = {
      classFullName: Subject.classFullName,
      model: root.model,
      parent: {
        id: root.id,
        relClassName: "BisCore:SubjectOwnsSubjects",
      },
      code: subjectCode,
    };
    const id = this._imodel.elements.insertElement(subjectProps);
    return this._imodel.elements.getElement(id);
  }

  private async handleElementOperationPrerequisites(): Promise<void> {
    if (this._imodel.containsClass(RulesetElements.Ruleset.classFullName))
      return;

    // import PresentationRules ECSchema
    await this._imodel.importSchemas(ClientRequestContext.current, [this._schemaPath]);

    // insert CodeSpec for ruleset elements
    this._imodel.codeSpecs.insert(CodeSpec.create(this._imodel, PresentationRules.CodeSpec.Ruleset, CodeScopeSpec.Type.Model));

    this._imodel.saveChanges();
  }
}

/* eslint-disable deprecation/deprecation */
function normalizeRulesetInsertOptions(options?: RulesetInsertOptions | DuplicateRulesetHandlingStrategy): Required<RulesetInsertOptions> {
  if (options === undefined)
    return { skip: "same-id-and-version-eq", replaceVersions: "exact" };

  if (isEnum(DuplicateRulesetHandlingStrategy, options)) {
    if (options === DuplicateRulesetHandlingStrategy.Replace)
      return { skip: "never", replaceVersions: "exact" };
    return { skip: "same-id", replaceVersions: "exact" };
  }

  return {
    skip: options.skip ?? "same-id-and-version-eq",
    replaceVersions: options.replaceVersions ?? "exact",
  };
}
/* eslint-enable deprecation/deprecation */
