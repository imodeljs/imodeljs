/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  DialogButtonDef, DialogButtonType,
  DialogItem, DialogItemValue,
  DialogLayoutDataProvider, DialogPropertySyncItem, PropertyDescription,
} from "@bentley/ui-abstract";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { I18N } from "@bentley/imodeljs-i18n";
import { PresentationUnitSystem } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";

enum UnitsOptions {
  Metric,
  Imperial,
  UsSurvey,
  UsCustomary,
}

/** UnitsPopup is a modal dialog with only one DialogItem. It is intended to be a very basic example of using DialogItem interfaces and the DialogLayoutDataProvider to create React UI
 * in an iModel.js app and to apply changes only when the user hits the OK button.
 */
export class UnitsPopupUiDataProvider extends DialogLayoutDataProvider {
  public static i18n: I18N;

  constructor(i18N: I18N) {
    super();
    UnitsPopupUiDataProvider.i18n = i18N;
  }

  private _handleOK = async () => {
    switch (this.option) {
      case UnitsOptions.Imperial:
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.BritishImperial;
        await IModelApp.quantityFormatter.setActiveUnitSystem("imperial");
        break;
      case UnitsOptions.Metric:
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.Metric;
        await IModelApp.quantityFormatter.setActiveUnitSystem("metric");
        break;
      case UnitsOptions.UsSurvey:
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsSurvey;
        await IModelApp.quantityFormatter.setActiveUnitSystem("usSurvey");
        break;
      case UnitsOptions.UsCustomary:
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsCustomary;
        await IModelApp.quantityFormatter.setActiveUnitSystem("usCustomary");
        break;
    }
  };

  public override supplyButtonData(): DialogButtonDef[] | undefined {
    const buttons: DialogButtonDef[] = [];
    buttons.push({ type: DialogButtonType.OK, onClick: this._handleOK });
    buttons.push({ type: DialogButtonType.Cancel, onClick: () => { } });
    return buttons;
  }

  // ------------- Enum based picklist ---------------
  private static _optionsName = "enumAsPicklist";

  private static _getEnumAsPicklistDescription = (): PropertyDescription => {
    return {
      name: UnitsPopupUiDataProvider._optionsName,
      displayLabel: UnitsPopupUiDataProvider.i18n.translate("uiTestExtension:StatusBar.Units"),
      typename: "enum",
      enum: {
        choices: [
          { label: UnitsPopupUiDataProvider.i18n.translate("uiTestExtension:StatusBar.Metric"), value: UnitsOptions.Metric },
          { label: UnitsPopupUiDataProvider.i18n.translate("uiTestExtension:StatusBar.Imperial"), value: UnitsOptions.Imperial },
          { label: UnitsPopupUiDataProvider.i18n.translate("uiTestExtension:StatusBar.UsSurvey"), value: UnitsOptions.UsSurvey },
          { label: UnitsPopupUiDataProvider.i18n.translate("uiTestExtension:StatusBar.UsCustomary"), value: UnitsOptions.UsCustomary },
        ],
      },
    };
  };

  private getValueForActiveUnitSystem() {
    switch (IModelApp.quantityFormatter.activeUnitSystem) {
      case "imperial":
        return UnitsOptions.Imperial;
      case "metric":
        return UnitsOptions.Metric;
      case "usSurvey":
        return UnitsOptions.UsSurvey;
      case "usCustomary":
        return UnitsOptions.UsCustomary;
    }
  }

  private _optionsValue: DialogItemValue = { value: this.getValueForActiveUnitSystem() };

  public get option() {
    return this._optionsValue.value;
  }

  public set option(option) {
    this._optionsValue = { value: option };
  }

  public override applyUiPropertyChange = (updatedValue: DialogPropertySyncItem): void => {
    this.option = updatedValue.value.value;
  };

  public override supplyDialogItems(): DialogItem[] | undefined {
    const items = [{ value: this._optionsValue, property: UnitsPopupUiDataProvider._getEnumAsPicklistDescription(), editorPosition: { rowPriority: 0, columnIndex: 2 } }];
    return items;
  }
}
