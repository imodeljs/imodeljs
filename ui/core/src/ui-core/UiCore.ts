/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

/** Import color variables, layout variables and Sass classes barrel file */
import "./colorthemes.scss";
import "./colorvariables.scss";
import "./layout-variables.scss";
import "./classes.scss";

import { Logger } from "@bentley/bentleyjs-core";
import { I18N } from "@bentley/imodeljs-i18n";
import { getClassName, UiAbstract, UiError } from "@bentley/ui-abstract";

// cSpell:ignore colorthemes colorvariables

/**
 * Manages the I18N service for the ui-core package.
 * @public
 */
export class UiCore {
  private static _initialized = false;
  private static _i18n?: I18N;

  /**
   * Registers the I18N service namespace for UiCore. Also initializes UiAbstract.
   * @param i18n The internationalization service created by the application.
   */
  public static async initialize(i18n: I18N): Promise<void> {
    if (UiCore._initialized) {
      Logger.logInfo(UiCore.loggerCategory(UiCore), `UiCore.initialize already called`);
      return;
    }

    UiCore._i18n = i18n;
    await UiCore._i18n.registerNamespace(UiCore.i18nNamespace).readFinished;
    await UiAbstract.initialize(i18n);
    UiCore._initialized = true;
  }

  /** Unregisters the UiCore I18N namespace */
  public static terminate() {
    if (UiCore._i18n)
      UiCore._i18n.unregisterNamespace(UiCore.i18nNamespace);
    UiCore._i18n = undefined;

    UiAbstract.terminate();
    UiCore._initialized = false;
  }

  /** Determines if UiCore has been initialized */
  public static get initialized(): boolean { return UiCore._initialized; }

  /** The internationalization service created by the application. */
  public static get i18n(): I18N {
    if (!UiCore._i18n)
      throw new UiError(UiCore.loggerCategory(this), "i18n: UiCore.initialize has not been called. Unable to return I18N object.");
    return UiCore._i18n;
  }

  /** The internationalization service namespace. */
  public static get i18nNamespace(): string {
    return "UiCore";
  }

  /** Calls i18n.translateWithNamespace with the "UiCore" namespace. Do NOT include the namespace in the key.
   * @internal
   */
  public static translate(key: string | string[]): string {
    if (!UiCore.initialized) {
      Logger.logError(UiCore.loggerCategory(this), `translate: UiCore.initialize has not been called. Returning blank string.`);
      return "";
    }
    return UiCore.i18n.translateWithNamespace(UiCore.i18nNamespace, key);
  }

  /** @internal */
  public static get packageName(): string {
    return "ui-core";
  }

  /** @internal */
  public static loggerCategory(obj: any): string {
    const className = getClassName(obj);
    const category = UiCore.packageName + (className ? `.${className}` : "");
    return category;
  }

}
