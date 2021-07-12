/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import "./SheetsModalFrontstage.scss";
import classnames from "classnames";
import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { CommonProps, FlexWrapContainer, ScrollView, SearchBox, UiCore, UiEvent } from "@bentley/ui-core";
import { FrontstageManager, ModalFrontstageInfo } from "../frontstage/FrontstageManager";
import { UiFramework } from "../UiFramework";
import { SheetData } from "./SheetNavigationAid";

/** Data about a sheet card
 * @alpha
 */
export interface CardInfo {
  index: number;
  label: string;
  iconSpec: string;
  isActive: boolean;
  viewId: any;
}

/** Arguments for CardSelectedEvent
 * @alpha
 */
export interface CardSelectedEventArgs {
  id: any;
  index: number;
}

/** Class for CardSelectedEvent
 * @alpha
 */
export class CardSelectedEvent extends UiEvent<CardSelectedEventArgs> { }

/** Modal frontstage displaying sheet information in cards.
 * @alpha
 */
export class SheetsModalFrontstage implements ModalFrontstageInfo {
  public title: string = UiFramework.translate("navigationAid.sheetsModalFrontstage");
  private _cards: CardInfo[] = [];
  private _connection: IModelConnection;
  private _currentIndex: number;
  private _searchValue: string = "";

  /**
   * Creates a SheetsModalFrontstage
   * @param sheets Collection of sheets available in SheetNavigationAid
   * @param connection IModelConnection to query for sheet ViewState
   */
  constructor(sheets: SheetData[], connection: IModelConnection, currentIndex: number) {
    this._connection = connection;
    this._currentIndex = currentIndex;
    this._storeSheetsAsCards(sheets);
  }

  /**
   * Gathers card info from available sheets
   * @param sheets SheetData from available sheets
   */
  private _storeSheetsAsCards(sheets: SheetData[]) {
    sheets.forEach((sheet: SheetData, index: number) => {
      this._cards.push({ index, label: sheet.name, iconSpec: "icon-document", viewId: sheet.viewId, isActive: index === this._currentIndex });
    });
  }

  /** Gets set of cards */
  public get content(): React.ReactNode {
    return <CardContainer cards={this._cards} searchValue={this._searchValue} connection={this._connection} />;
  }

  /** Gets components to be placed in the app bar */
  public get appBarRight(): React.ReactNode {
    return (
      <SearchBox placeholder={UiCore.translate("general.search")} onValueChanged={this._handleSearchValueChanged} valueChangedDelay={250} />
    );
  }

  /** Updates stage based on search value */
  // istanbul ignore next
  private _handleSearchValueChanged = (value: string): void => {
    this._searchValue = value;
    FrontstageManager.updateModalFrontstage();
  };
}

/** Properties for [[CardContainer]]
 * @alpha
 */
export interface CardContainerProps extends CommonProps {
  cards: CardInfo[];
  searchValue: string;
  connection: IModelConnection;
}

/** Displays cards in SheetModalFrontstage
 * @alpha
 */
export class CardContainer extends React.Component<CardContainerProps> {
  private static _cardSelectedEvent: CardSelectedEvent = new CardSelectedEvent();

  /** Get CardSelectedEvent event */
  public static get onCardSelectedEvent(): CardSelectedEvent { return CardContainer._cardSelectedEvent; }

  /** @internal */
  public override render() {
    return (
      <ScrollView className={this.props.className} style={this.props.style}>
        <FlexWrapContainer>
          {
            this.props.cards.map((card: CardInfo, _index: number) => {
              let includeCard = true;
              const iconClassName = (typeof card.iconSpec === "string") ? card.iconSpec : /* istanbul ignore next */ "icon-placeholder";

              if (this.props.searchValue) {
                includeCard = this.contains(card.label, this.props.searchValue);
              }

              if (includeCard) {
                return (
                  <SheetCard key={card.label} label={card.label} index={card.index} iconSpec={iconClassName} isActive={card.isActive} onClick={async () => this._handleCardSelected(card)} />
                );
              }

              return null;
            })
          }
        </FlexWrapContainer>
      </ScrollView>
    );
  }

  /**
   * Determines if string contains a substring
   * @param valueA The string to search through
   * @param valueB The value to search for
   * @return True if valueB can be found in valueA, false otherwise
   */
  private contains(valueA: string, valueB: string): boolean {
    if (!valueA || !valueB)
      return false;

    if (valueB.length > valueA.length)
      return false;

    return valueA.toLocaleUpperCase().indexOf(valueB.toLocaleUpperCase(), 0) !== -1;
  }

  /**
   * Updates view with ViewState for selected card.
   * @param card Data about the sheet card selected.
   */
  private async _handleCardSelected(card: CardInfo) {
    // istanbul ignore if
    if (IModelApp.viewManager && IModelApp.viewManager.selectedView) {
      const vp = IModelApp.viewManager.selectedView;
      const viewState = await this.props.connection.views.load(card.viewId);
      vp.changeView(viewState);
    }

    card.isActive = true;
    FrontstageManager.closeModalFrontstage();
    CardContainer.onCardSelectedEvent.emit({ id: card.viewId, index: card.index });
  }
}

/** Properties for [[SheetCard]]
 * @alpha
 */
export interface SheetCardProps {
  label: string;
  index: number;
  iconSpec: string;
  isActive: boolean;
  onClick: () => void;
}

/** State for [[SheetCard]]
 * @internal
 */
interface SheetCardState {
  isActive: boolean;
  isPressed: boolean;
}

/** Displays information about an individual sheet
 * @alpha
 */
export class SheetCard extends React.Component<SheetCardProps, SheetCardState> {
  constructor(props: SheetCardProps) {
    super(props);
    this.state = { isActive: this.props.isActive, isPressed: false };
  }

  private _onClick = () => {
    this.setState({ isActive: true }, () => this.props.onClick());
  };

  private _onMouseDown = () => {
    this.setState({ isPressed: true });
  };

  private _onMouseLeave = () => {
    if (this.state.isPressed)
      this.setState({ isPressed: false });
  };

  public override render() {
    const { label, index, iconSpec } = this.props;

    const className = classnames(
      "uifw-sheet-card",
      this.state.isActive && "is-active",
      this.state.isPressed && "is-pressed",
    );

    const iconClassName = classnames(
      "icon",
      (typeof iconSpec === "string") ? iconSpec : /* istanbul ignore next */ "icon-placeholder",
    );

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div className={className} onClick={this._onClick} onMouseDown={this._onMouseDown} onMouseLeave={this._onMouseLeave} role="button" tabIndex={-1} >
        {label}
        <div className="sheet-image-container">
          <div className={iconClassName} />
        </div >
        <div className="sheet-index">{index + 1}</div>
      </div >
    );
  }
}
