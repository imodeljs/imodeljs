/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { PresentationUnitSystem } from "@bentley/presentation-common";
import { Select } from "@bentley/ui-core";

export interface UnitSystemSelectorProps {
  selectedUnitSystem: PresentationUnitSystem | undefined;
  onUnitSystemSelected: (unitSystem: PresentationUnitSystem | undefined) => void;
}

export function UnitSystemSelector(props: UnitSystemSelectorProps) {
  const { selectedUnitSystem, onUnitSystemSelected: onUnitSystemSelectedProp } = props;
  const onUnitSystemSelected = React.useCallback((evt: React.ChangeEvent<HTMLSelectElement>) => {
    switch (evt.target.value) {
      case PresentationUnitSystem.BritishImperial:
        onUnitSystemSelectedProp(PresentationUnitSystem.BritishImperial);
        break;
      case PresentationUnitSystem.Metric:
        onUnitSystemSelectedProp(PresentationUnitSystem.Metric);
        break;
      case PresentationUnitSystem.UsCustomary:
        onUnitSystemSelectedProp(PresentationUnitSystem.UsCustomary);
        break;
      case PresentationUnitSystem.UsSurvey:
        onUnitSystemSelectedProp(PresentationUnitSystem.UsSurvey);
        break;
      default:
        onUnitSystemSelectedProp(undefined);
    }
  }, [onUnitSystemSelectedProp]);

  return (
    <div className="UnitSystemSelector">
      {/* eslint-disable-next-line deprecation/deprecation */}
      <Select
        options={availableUnitSystems}
        defaultValue={selectedUnitSystem}
        placeholder={IModelApp.i18n.translate("Sample:controls.notifications.select-unit-system")}
        onChange={onUnitSystemSelected}
      />
    </div>
  );
}

const availableUnitSystems = [{
  value: undefined,
  label: "",
}, {
  value: PresentationUnitSystem.Metric,
  label: "Metric",
}, {
  value: PresentationUnitSystem.BritishImperial,
  label: "British Imperial",
}, {
  value: PresentationUnitSystem.UsCustomary,
  label: "US Customary",
}, {
  value: PresentationUnitSystem.UsSurvey,
  label: "US Survey",
}];
