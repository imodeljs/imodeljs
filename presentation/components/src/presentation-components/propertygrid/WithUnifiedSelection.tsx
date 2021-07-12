/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import "./WithUnifiedSelection.scss";
import * as React from "react";
import { KeySet } from "@bentley/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionHandler } from "@bentley/presentation-frontend";
import { PropertyGridProps } from "@bentley/ui-components";
import { FillCentered } from "@bentley/ui-core";
import { IUnifiedSelectionComponent } from "../common/IUnifiedSelectionComponent";
import { getDisplayName, translate } from "../common/Utils";
import { IPresentationPropertyDataProvider } from "./DataProvider";

const DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT = 100;

/**
 * Props that are injected to the PropertyGridWithUnifiedSelection HOC component.
 * @public
 * @deprecated Use [[usePropertyDataProviderWithUnifiedSelection]] hook
 */
export interface PropertyGridWithUnifiedSelectionProps {
  /** The data provider used by the property grid. */
  dataProvider: IPresentationPropertyDataProvider;

  /**
   * Maximum number of instances to request content for.
   * Defaults to `100`.
   */
  requestedContentInstancesLimit?: number;

  /** @internal */
  selectionHandler?: SelectionHandler;
}

interface State {
  overLimit?: boolean;
}

/**
 * A HOC component that adds unified selection functionality to the supplied
 * property grid component.
 *
 * **Note:** it is required for the property grid to use [[IPresentationPropertyDataProvider]]
 *
 * @public
 * @deprecated Use [[usePropertyDataProviderWithUnifiedSelection]] hook
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
// eslint-disable-next-line deprecation/deprecation
export function propertyGridWithUnifiedSelection<P extends PropertyGridProps>(PropertyGridComponent: React.ComponentType<P>): React.ComponentType<P & PropertyGridWithUnifiedSelectionProps> {

  // eslint-disable-next-line deprecation/deprecation
  type CombinedProps = P & PropertyGridWithUnifiedSelectionProps;

  return class WithUnifiedSelection extends React.Component<CombinedProps, State> implements IUnifiedSelectionComponent {

    private _selectionHandler?: SelectionHandler;

    public constructor(props: CombinedProps) {
      super(props);
      this.state = {};
    }

    /** Returns the display name of this component */
    public static get displayName() { return `WithUnifiedSelection(${getDisplayName(PropertyGridComponent)})`; }

    /** Get selection handler used by this property grid */
    public get selectionHandler(): SelectionHandler | undefined { return this._selectionHandler; }

    /** Get imodel used by this property grid to query property data */
    public get imodel() { return this.props.dataProvider.imodel; }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    private get requestedContentInstancesLimit() {
      if (undefined === this.props.requestedContentInstancesLimit)
        return DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT;
      return this.props.requestedContentInstancesLimit;
    }

    public override componentDidMount() {
      const name = `PropertyGrid_${counter++}`;
      const imodel = this.props.dataProvider.imodel;
      const rulesetId = this.props.dataProvider.rulesetId;
      this._selectionHandler = this.props.selectionHandler
        ? this.props.selectionHandler : new SelectionHandler({ manager: Presentation.selection, name, imodel, rulesetId });
      this._selectionHandler.onSelect = this.onSelectionChanged;
      this.updateDataProviderSelection();
    }

    public override componentWillUnmount() {
      if (this._selectionHandler)
        this._selectionHandler.dispose();
    }

    public override componentDidUpdate() {
      if (this._selectionHandler) {
        this._selectionHandler.imodel = this.props.dataProvider.imodel;
        this._selectionHandler.rulesetId = this.props.dataProvider.rulesetId;
      }
    }

    private getSelectedKeys(selectionLevel?: number): KeySet | undefined {
      if (undefined === selectionLevel) {
        const availableLevels = this._selectionHandler!.getSelectionLevels();
        if (0 === availableLevels.length)
          return undefined;
        selectionLevel = availableLevels[availableLevels.length - 1];
      }

      for (let i = selectionLevel; i >= 0; i--) {
        const selection = this._selectionHandler!.getSelection(i);
        if (!selection.isEmpty)
          return new KeySet(selection);
      }
      return new KeySet();
    }

    private setDataProviderSelection(selection: KeySet): void {
      this.props.dataProvider.keys = selection;
    }

    private updateDataProviderSelection(selectionLevel?: number) {
      const selection = this.getSelectedKeys(selectionLevel);
      if (selection) {
        if (selection.size > this.requestedContentInstancesLimit) {
          this.setState({ overLimit: true });
          this.setDataProviderSelection(new KeySet());
        } else {
          this.setState({ overLimit: false });
          this.setDataProviderSelection(selection);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    private onSelectionChanged = (evt: SelectionChangeEventArgs): void => {
      this.updateDataProviderSelection(evt.level);
    };

    public override render() {
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        selectionHandler, requestedContentInstancesLimit, // do not bleed our props
        ...props
      } = this.props as any;

      let content;
      if (this.state.overLimit) {
        content = (<FillCentered>{translate("property-grid.too-many-elements-selected")}</FillCentered>);
      } else {
        content = (<PropertyGridComponent {...props} />);
      }

      return (
        <div className="pcomponents-property-grid-with-unified-selection">
          {content}
        </div>
      );
    }
  };
}

let counter = 1;
