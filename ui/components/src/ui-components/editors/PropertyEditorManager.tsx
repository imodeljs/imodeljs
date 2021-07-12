/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import * as React from "react";
import { TextEditor } from "./TextEditor";
import { PropertyDescription, PropertyRecord, PropertyValue, StandardTypeNames } from "@bentley/ui-abstract";
import { OutputMessageAlert, OutputMessagePriority, OutputMessageType } from "@bentley/imodeljs-frontend";

/** Asynchronous Error Message returned as part of [[AsyncValueProcessingResult]]
 * @beta
 */
export interface AsyncErrorMessage {
  priority: OutputMessagePriority;
  briefMessage: string;
  detailedMessage?: string;
  msgType?: OutputMessageType;
  alertType?: OutputMessageAlert;
  displayTime?: number;
}

/** Asynchronous Value Process Result
 * @beta
 */
export interface AsyncValueProcessingResult {
  encounteredError: boolean;
  returnValue?: PropertyValue;
  errorMessage?: AsyncErrorMessage;
}

/** DataControllers can be implemented per typename to validate and commit values.
 * @beta
 */
export interface DataController {
  validateValue(newValue: PropertyValue, record: PropertyRecord): Promise<AsyncValueProcessingResult>;
  commitValue(newValue: PropertyValue, record: PropertyRecord): Promise<AsyncValueProcessingResult>;
}

/** PropertyEditor is the base class for all property editors.
 * @beta
 */
export abstract class PropertyEditorBase implements DataController {

  public get containerHandlesBlur(): boolean {
    return true;
  }
  public get containerHandlesEscape(): boolean {
    return true;
  }
  public get containerHandlesEnter(): boolean {
    return true;
  }
  public get containerHandlesTab(): boolean {
    return true;
  }
  public get containerStopsKeydownPropagation(): boolean {
    return true;
  }

  public customDataController: DataController | undefined = undefined;

  public abstract get reactNode(): React.ReactNode;

  public applyEditorParams(_property: PropertyDescription, _record: PropertyRecord): void { }

  public async commitValue(newValue: PropertyValue, record: PropertyRecord): Promise<AsyncValueProcessingResult> {
    if (this.customDataController)
      return this.customDataController.commitValue(newValue, record);

    return { encounteredError: false };
  }

  public async validateValue(newValue: PropertyValue, record: PropertyRecord): Promise<AsyncValueProcessingResult> {
    if (this.customDataController)
      return this.customDataController.validateValue(newValue, record);

    return { encounteredError: false };
  }

}

/** DataControllerBase is the base class for all Data Controllers.
 * @beta
 */
export abstract class DataControllerBase implements DataController {
  public async commitValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
    return { encounteredError: false };
  }

  public async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
    return { encounteredError: false };
  }
}

/** Manages Property Editors. Property Editors are registered with and created by the manager.
 * @beta
 */
export class PropertyEditorManager {
  private static _editors: { [index: string]: (new () => PropertyEditorBase) } = {};
  private static _dataControllers: { [index: string]: (new () => DataControllerBase) } = {};

  public static registerEditor(editType: string, editor: new () => PropertyEditorBase, editorName?: string): void {
    const fullEditorName = PropertyEditorManager.getFullEditorName(editType, editorName);

    if (PropertyEditorManager._editors.hasOwnProperty(fullEditorName)) {
      const nameOfEditor = PropertyEditorManager._editors[fullEditorName].name;
      throw Error(`PropertyEditorManager.registerEditor error: type '${fullEditorName}' already registered to '${nameOfEditor}'`);
    }
    PropertyEditorManager._editors[fullEditorName] = editor;
  }

  private static getFullEditorName(editType: string, editorName?: string): string {
    let fullEditorName = editType;
    if (editorName)
      fullEditorName += `:${editorName}`;
    return fullEditorName;
  }

  public static registerDataController(controllerName: string, controller: new () => DataControllerBase): void {
    if (PropertyEditorManager._dataControllers.hasOwnProperty(controllerName)) {
      throw Error(`PropertyEditorManager.registerDataController error: type '${controllerName}' already registered to '${(typeof PropertyEditorManager._dataControllers[controllerName]).toString()}'`);
    }
    PropertyEditorManager._dataControllers[controllerName] = controller;
  }

  /** @internal */
  public static deregisterDataController(controllerName: string): void {
    // istanbul ignore else
    if (PropertyEditorManager._dataControllers.hasOwnProperty(controllerName)) {
      delete PropertyEditorManager._dataControllers[controllerName];
    }
  }

  public static createEditor(editType: string, editorName?: string, dataControllerName?: string): PropertyEditorBase {
    const fullEditorName = PropertyEditorManager.getFullEditorName(editType, editorName);

    let editor: PropertyEditorBase;
    if (PropertyEditorManager._editors.hasOwnProperty(fullEditorName))
      editor = new PropertyEditorManager._editors[fullEditorName]();
    else if (PropertyEditorManager._editors.hasOwnProperty(editType))
      editor = new PropertyEditorManager._editors[editType]();
    else
      editor = new BasicPropertyEditor();

    if (dataControllerName) {
      if (PropertyEditorManager._dataControllers.hasOwnProperty(dataControllerName))
        editor.customDataController = new PropertyEditorManager._dataControllers[dataControllerName]();
      else
        throw Error(`PropertyEditorManager.createEditor error: data controller '${dataControllerName}' is not registered`);
    }

    return editor;
  }

  public static hasCustomEditor(editType: string, editorName: string): boolean {
    const fullEditorName = PropertyEditorManager.getFullEditorName(editType, editorName);
    return PropertyEditorManager._editors.hasOwnProperty(fullEditorName);
  }
}

/** Basic Property Editor registered for the "text" and "string" type names.
 * It uses the [[TextEditor]] React component.
 * @beta
 */
export class BasicPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <TextEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Text, BasicPropertyEditor);
PropertyEditorManager.registerEditor(StandardTypeNames.String, BasicPropertyEditor);
