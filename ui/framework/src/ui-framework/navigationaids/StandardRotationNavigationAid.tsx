/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import "./StandardRotationNavigationAid.scss";
import classnames from "classnames";
import * as React from "react";
import { StandardViewId } from "@bentley/imodeljs-frontend";
import { RelativePosition } from "@bentley/ui-abstract";
import { ViewportComponentEvents } from "@bentley/ui-components";
import { CommonProps, Icon, Popup } from "@bentley/ui-core";
import {
  containHorizontally, GroupColumn as NZ_Column, ExpandableButton as NZ_Expandable, ToolbarIcon as NZ_Icon, GroupTool as NZ_Item, Group as NZ_Tray,
  withContainIn,
} from "@bentley/ui-ninezone";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { UiFramework } from "../UiFramework";
import { NavigationAidControl } from "./NavigationAidControl";

// eslint-disable-next-line @typescript-eslint/naming-convention
const NZ_ContainedTray = withContainIn(NZ_Tray);

/** A 3D Standard Rotation Navigation Aid control.
 * @alpha
 */
export class StandardRotationNavigationAidControl extends NavigationAidControl {
  public static navigationAidId = "StandardRotationNavigationAid";

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this.reactNode = <StandardRotationNavigationAid />;
  }
}

/** @internal */
export interface RotationData {
  label: string;
  iconClassName: string;
}

/** @internal */
interface StandardRotationNavigationAidState {
  element: HTMLDivElement | null;
  isExpanded: boolean;
  list: RotationData[];
  selected: StandardViewId;
}

/** A 3D Standard Rotation Navigation Aid.
 * @alpha
 */
export class StandardRotationNavigationAid extends React.Component<CommonProps, StandardRotationNavigationAidState> {
  private _title = UiFramework.translate("standardRotationNavigationAid.title");

  /** @internal */
  public override readonly state: Readonly<StandardRotationNavigationAidState>;

  constructor(props: any) {
    super(props);
    const list: RotationData[] = [
      {
        label: UiFramework.translate("rotations.top"),
        iconClassName: "icon-cube-faces-top",
      }, {
        label: UiFramework.translate("rotations.bottom"),
        iconClassName: "icon-cube-faces-bottom",
      }, {
        label: UiFramework.translate("rotations.left"),
        iconClassName: "icon-cube-faces-left",
      }, {
        label: UiFramework.translate("rotations.right"),
        iconClassName: "icon-cube-faces-right",
      }, {
        label: UiFramework.translate("rotations.front"),
        iconClassName: "icon-cube-faces-front",
      }, {
        label: UiFramework.translate("rotations.rear"),
        iconClassName: "icon-cube-faces-rear",
      }, {
        label: UiFramework.translate("rotations.isoLeft"),
        iconClassName: "icon-cube-faces-iso-left",
      }, {
        label: UiFramework.translate("rotations.isoRight"),
        iconClassName: "icon-cube-faces-iso-right",
      },
    ];
    this.state = {
      element: null,
      isExpanded: false,
      list,
      selected: StandardViewId.Top,
    };
  }

  public override render(): React.ReactNode {
    const className = classnames(
      "uifw-standard-rotation-navigation",
      this.props.className,
    );

    return (
      <div className={className} style={this.props.style}
        ref={this._handleRef}
      >
        <NZ_Expandable
          className={"expandable"}
        >
          <NZ_Icon
            className={"icon-button"}
            icon={
              <span className={classnames("three-d-icon", "icon", this.state.list[this.state.selected].iconClassName)} />
            }
            onClick={this._toggleIsExpanded}
            title={this._title}
          >
          </NZ_Icon>
        </NZ_Expandable>
        <Popup
          isOpen={this.state.isExpanded}
          offset={0}
          onClose={this._handlePopupClose}
          position={RelativePosition.Bottom}
          target={this.state.element}
        >
          {this.getExpandedContent()}
        </Popup>
      </div>
    );
  }

  private _handleRef = (element: HTMLDivElement | null) => {
    this.setState(() => ({ element }));
  };

  private _handlePopupClose = () => {
    this.setState(() => ({ isExpanded: false }));
  };

  private _toggleIsExpanded = () => {
    this.setState((prevState) => ({ isExpanded: !prevState.isExpanded }));
  };

  private _handleListItemClicked = (item: number) => {
    const selected = item;

    this.setState(
      () => ({ isExpanded: false, selected }),
      () => ViewportComponentEvents.setStandardRotation(selected),
    );
  };

  private getExpandedContent(): React.ReactNode {
    if (!this.state.isExpanded)
      return undefined;

    return (
      <NZ_ContainedTray
        containFn={containHorizontally}
        columns={
          <NZ_Column>
            {this.state.list.map((item, itemIndex) => {
              return (
                <NZ_Item
                  key={itemIndex.toString()}
                  ref={itemIndex.toString()}
                  label={item.label}
                  icon={<Icon iconSpec={item.iconClassName} />}
                  isActive={this.state.selected === itemIndex}
                  onClick={() => this._handleListItemClicked(itemIndex)}
                >
                </NZ_Item>
              );
            })}
          </NZ_Column>
        }
      />
    );
  }
}
