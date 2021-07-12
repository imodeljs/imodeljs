/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import * as React from "react";
import { UiFramework } from "../../UiFramework";
import { UnitSystemKey } from "@bentley/imodeljs-frontend";
import { Select, SelectOption } from "@itwin/itwinui-react";

/** Props for [[UnitSystemSelector]]
 * @beta
 */
export interface UnitSystemSelectorProps {
  selectedUnitSystemKey: UnitSystemKey;
  onUnitSystemSelected: (unitSystem: UnitSystemKey) => void;
  availableUnitSystems: Set<UnitSystemKey>;
}

/** Select control to set the "active" Presentation Unit System. This setting determine what units are display for quantity values (i.e. foot vs meter).
 * @alpha
 */
export function UnitSystemSelector(props: UnitSystemSelectorProps) { // eslint-disable-line @typescript-eslint/naming-convention
  const label = React.useRef(UiFramework.translate("presentationUnitSystem.selector-label"));
  const { selectedUnitSystemKey, onUnitSystemSelected, availableUnitSystems } = props;
  const handleUnitSystemSelected = React.useCallback((newValue: UnitSystemKey) => {
    onUnitSystemSelected && onUnitSystemSelected(newValue);
  }, [onUnitSystemSelected]);

  const displayUnitSystems: SelectOption<UnitSystemKey>[] = [...availableUnitSystems.values()].map((sys) => {
    switch (sys) {
      case "imperial":
        return {
          value: "imperial",
          label: UiFramework.translate("presentationUnitSystem.BritishImperial"),
        };
      case "usCustomary":
        return {
          value: "usCustomary",
          label: UiFramework.translate("presentationUnitSystem.USCustomary"),
        };
      case "usSurvey":
        return {
          value: "usSurvey",
          label: UiFramework.translate("presentationUnitSystem.USSurvey"),
        };
      case "metric":
      default:
        return {
          value: "metric",
          label: UiFramework.translate("presentationUnitSystem.Metric"),
        };
    }
  });

  const unitSystemKey = availableUnitSystems.has(selectedUnitSystemKey) ? selectedUnitSystemKey : displayUnitSystems[0].value;

  return (
    <div className="quantity-unit-system-selector-container">
      <span className={"uicore-label"}>{label.current}</span>
      <Select data-testid="unitSystemSelector"
        value={unitSystemKey}
        options={displayUnitSystems} onChange={handleUnitSystemSelected}
      />
    </div>
  );
}

