/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { ViewQueryParams } from "@bentley/imodeljs-common";
import { Select, SelectOption } from "@itwin/itwinui-react";

export async function getViewDefinitions(imodel: IModelConnection): Promise<{ id: string, class: string, label: string }[]> {
  const viewQueryParams: ViewQueryParams = { wantPrivate: false };
  const viewSpecs = await imodel.views.queryProps(viewQueryParams);
  return viewSpecs
    .filter((spec) => !spec.isPrivate)
    .map((spec) => ({
      id: spec.id!,
      class: spec.classFullName,
      label: spec.userLabel ?? spec.code.value!,
    }));
}

export interface ViewDefinitionSelectorProps {
  imodel: IModelConnection;
  selectedViewDefinition?: Id64String;
  onViewDefinitionSelected?: (id?: Id64String) => void;
}
export interface RulesetSelectorState {
  availableViewDefinitions?: string[];
}
export default function ViewDefinitionSelector(props: ViewDefinitionSelectorProps) { // eslint-disable-line @typescript-eslint/naming-convention
  const [availableViewDefinitions, setAvailableViewDefinitions] = React.useState<Array<{ id: Id64String, class: string, label: string }> | undefined>();
  React.useEffect(() => {
    setAvailableViewDefinitions([]);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    getViewDefinitions(props.imodel).then(setAvailableViewDefinitions);
  }, [props.imodel]);
  const onViewDefinitionSelected = props.onViewDefinitionSelected;
  const memoizedOnViewDefinitionSelected = React.useCallback((selectedId: string) => {
    if (onViewDefinitionSelected)
      onViewDefinitionSelected(selectedId);
  }, [onViewDefinitionSelected]);
  const selectOptions = React.useMemo<SelectOption<string>[]>(() => {
    return (availableViewDefinitions ?? []).map((definition) => (
      { value: definition.id, label: definition.label }
    ));
  }, [availableViewDefinitions]);
  return (
    <div className="ViewDefinitionSelector">
      <Select onChange={memoizedOnViewDefinitionSelected} value={props.selectedViewDefinition} options={selectOptions} />
    </div>
  );
}
