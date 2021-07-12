/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import { FormatterSpec, Parser, ParserSpec } from "@bentley/imodeljs-quantity";
import { BaseQuantityDescription, ParseResults } from "@bentley/ui-abstract";
import { IModelApp } from "../IModelApp";
import { QuantityType } from "../quantity-formatting/QuantityFormatter";

/**
 * Base Quantity Property Description
 * @beta
 */
export abstract class FormattedQuantityDescription extends BaseQuantityDescription {
  private _formatterSpec?: FormatterSpec;
  private _parserSpec?: ParserSpec;

  constructor(name: string, displayLabel: string, iconSpec?: string) {
    super(name, displayLabel, iconSpec);
  }

  protected formatValue(numberValue: number): string {
    if (this.formatterSpec) {
      return IModelApp.quantityFormatter.formatQuantity(numberValue, this.formatterSpec);
    }
    return numberValue.toFixed(2);
  }

  protected parseString(userInput: string): ParseResults {
    if (this.parserSpec) {
      const parseResult = IModelApp.quantityFormatter.parseToQuantityValue(userInput, this.parserSpec);
      if (Parser.isParsedQuantity(parseResult)) {
        return { value: parseResult.value };
      } else {
        return { parseError: this.parseError };
      }
    }
    return { parseError: "no parser defined" };
  }

  public get formatterSpec(): FormatterSpec | undefined {
    if (this._formatterSpec)
      return this._formatterSpec;

    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(this.formatterQuantityType);
    if (formatterSpec) {
      this._formatterSpec = formatterSpec;
      return formatterSpec;
    }

    return undefined;
  }

  public get parserSpec(): ParserSpec | undefined {
    if (this._parserSpec)
      return this._parserSpec;

    const parserSpec = IModelApp.quantityFormatter.findParserSpecByQuantityType(this.formatterQuantityType);
    if (parserSpec) {
      this._parserSpec = parserSpec;
      return parserSpec;
    }

    return undefined;
  }

  public abstract get formatterQuantityType(): QuantityType;

  public abstract override get parseError(): string;
}
