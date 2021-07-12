/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import * as React from "react";
import { UserInfo } from "@bentley/itwin-client";
import { CommonProps, IconSpec, UiEvent } from "@bentley/ui-core";
import { Backstage as NZ_Backstage } from "@bentley/ui-ninezone";
import { SafeAreaContext } from "../safearea/SafeAreaContext";
import { UiFramework } from "../UiFramework";
import { BackstageManager } from "./BackstageManager";
import { UserProfileBackstageItem } from "./UserProfile";

// cSpell:ignore safearea

/** [[BackstageEvent]] arguments.
 * @public
 * @deprecated use [BackstageComposer]($ui-framework) instead.
 */
export interface BackstageEventArgs {
  isVisible: boolean;
}

/** Backstage Event class.
 * @public
 */
export class BackstageEvent extends UiEvent<BackstageEventArgs> { } // eslint-disable-line deprecation/deprecation

/** Properties for the [[Backstage]] React component.
 * @public
 * @deprecated use [BackstageComposer]($ui-framework) instead.
 */
export interface BackstageProps extends CommonProps {
  userInfo?: UserInfo;
  isVisible?: boolean;
  showOverlay?: boolean;
  onClose?: () => void;
  header?: React.ReactNode;
}

/** State for the [[Backstage]] React component.
 * @internal
 */
interface BackstageState {
  isVisible: boolean;
}

/** Backstage React component.
 * @public
 * @deprecated use [BackstageComposer]($ui-framework) instead.
 */
export class Backstage extends React.Component<BackstageProps, BackstageState> { // eslint-disable-line deprecation/deprecation

  public static readonly onBackstageEvent = new BackstageEvent();
  public static isBackstageVisible: boolean;

  /** Shows the Backstage */
  public static show(): void {
    UiFramework.backstageManager.open();
  }

  /** Hides the Backstage */
  public static hide(): void {
    UiFramework.backstageManager.close();
  }

  /** Get CommandItemDef that will toggle display of Backstage and allow iconSpec to be overridden */
  public static getBackstageToggleCommand(overrideIconSpec?: IconSpec) {
    return BackstageManager.getBackstageToggleCommand(overrideIconSpec);
  }

  /** Command that toggles the Backstage */
  public static get backstageToggleCommand() {
    return this.getBackstageToggleCommand();
  }

  /** @internal */
  public override readonly state: BackstageState;

  constructor(props: BackstageProps) { // eslint-disable-line deprecation/deprecation
    super(props);

    this.setIsOpen(!!this.props.isVisible);
    this.state = {
      isVisible: UiFramework.backstageManager.isOpen,
    };
  }

  public override componentDidMount() {
    Backstage.onBackstageEvent.addListener(this._handleBackstageEvent); // eslint-disable-line deprecation/deprecation
  }

  public override componentWillUnmount() {
    Backstage.onBackstageEvent.removeListener(this._handleBackstageEvent); // eslint-disable-line deprecation/deprecation
  }

  private _handleBackstageEvent = (args: BackstageEventArgs) => { // eslint-disable-line deprecation/deprecation
    this.setState({ isVisible: args.isVisible });
  };

  public override componentDidUpdate(prevProps: BackstageProps) { // eslint-disable-line deprecation/deprecation
    if (this.props.isVisible !== prevProps.isVisible)
      this.setIsOpen(!!this.props.isVisible);
  }

  private setIsOpen(isOpen: boolean) {
    if (isOpen) {
      UiFramework.backstageManager.open();
    } else {
      UiFramework.backstageManager.close();
    }
  }

  private _onClose = () => {
    Backstage.hide(); // eslint-disable-line deprecation/deprecation

    /* istanbul ignore else */
    if (this.props.onClose)
      this.props.onClose();
  };

  public override render(): React.ReactNode {
    Backstage.isBackstageVisible = this.state.isVisible; // eslint-disable-line deprecation/deprecation

    let header: React.ReactNode = null;

    if (this.props.header)
      header = this.props.header;
    else if (this.props.userInfo !== undefined)
      header = <UserProfileBackstageItem userInfo={this.props.userInfo} />;

    return (
      <SafeAreaContext.Consumer>
        {(safeAreaInsets) => (
          <NZ_Backstage
            className={this.props.className}
            header={header}
            isOpen={this.state.isVisible}
            onClose={this._onClose}
            safeAreaInsets={safeAreaInsets}
            showOverlay={this.props.showOverlay}
            style={this.props.style}
          >
            {this.props.children}
          </NZ_Backstage>
        )}
      </SafeAreaContext.Consumer>
    );
  }
}
