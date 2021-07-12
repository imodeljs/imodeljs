/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { DatePickerPopupButton, DatePickerPopupButtonProps } from "@bentley/ui-components";
import { ModalDialogManager, ModelessDialogManager, PopupManager } from "@bentley/ui-framework";
import { SampleModelessDialog } from "../appui/dialogs/SampleModelessDialog";
import { TestModalDialog } from "../appui/dialogs/TestModalDialog";

import { SamplePopupContextMenu } from "../appui/frontstages/component-examples/SamplePopupContextMenu";
import { TableExampleContent } from "../appui/contentviews/TableExampleContent";
import "./PopupTestPanel.scss";
import { AbstractToolbarProps, BadgeType, RelativePosition } from "@bentley/ui-abstract";
import { WeightPickerHost } from "../appui/frontstages/component-examples/ComponentExamplesProvider";
import { Button } from "@itwin/itwinui-react";

export function DatePickerHost(props: DatePickerPopupButtonProps) {
  const { onDateChange, selected, ...otherProp } = props;
  const [currentDate, setCurrentDate] = React.useState(selected);

  const handleOnDateChange = React.useCallback((day: Date) => {
    onDateChange && onDateChange(day);
    setCurrentDate(day);
  }, [onDateChange]);

  return (
    <DatePickerPopupButton style={{ width: "fit-content" }} selected={currentDate} onDateChange={handleOnDateChange} {...otherProp} />
  );
}

export function PopupTestPanel() {
  const divRef = React.useRef<HTMLDivElement>(null);

  const closeToolbar = React.useCallback(() => {
    // eslint-disable-next-line no-console
    console.log(`closeToolbar`);
    PopupManager.hideToolbar();
  }, []);

  const handleShowToolbarClick = React.useCallback(() => {
    const toolbarProps: AbstractToolbarProps = {
      items: [
        { id: "Mode-1", itemPriority: 10, label: "Mode 1", icon: "icon-placeholder", badgeType: BadgeType.New, execute: () => { } },
        { id: "Mode-2", itemPriority: 20, label: "Mode 2", icon: "icon-placeholder", execute: () => { } },
      ],
    };

    PopupManager.showToolbar(toolbarProps, divRef.current?.ownerDocument.documentElement ?? document.documentElement,
      { x: 50, y: 250 }, { x: 0, y: 0 }, closeToolbar, closeToolbar, RelativePosition.TopRight);
  }, [closeToolbar]);

  const handleOpenModalClick = React.useCallback(() => {
    ModalDialogManager.openDialog(<TestModalDialog opened={true} />, "TestModal", divRef.current?.ownerDocument ?? document);
  }, []);

  const handleOpenModelessClick = React.useCallback(() => {
    ModelessDialogManager.openDialog(
      <SampleModelessDialog opened={true} movable={true} dialogId={"SampleModeless"} />, "SampleModeless", divRef.current?.ownerDocument ?? document);
  }, []);

  return (
    <div className="test-popup-test-panel-container" ref={divRef}>
      <div className="test-popup-test-panel">
        <SamplePopupContextMenu />
        <DatePickerHost selected={new Date()} />
        <Button style={{ width: "180px" }} onClick={handleOpenModalClick}>Open Modal</Button>
        <Button style={{ width: "180px" }} onClick={handleOpenModelessClick}>Open Modeless</Button>
        <Button style={{ width: "180px" }} onClick={handleShowToolbarClick}>Open Toolbar</Button>
        <WeightPickerHost activeWeight={3} onLineWeightPick={() => { }} />
        {true && <div className="test-table-widget-container">
          <TableExampleContent />
        </div>}
      </div>
    </div>
  );
}
