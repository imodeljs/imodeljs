/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import * as React from "react";
import {  IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { ModalDialogManager } from "@bentley/ui-framework";
import { SampleModalDialog } from "../dialogs/SampleModalDialog";
import { BadgeType, ConditionalBooleanValue, IconSpecUtilities, ToolbarItemUtilities } from "@bentley/ui-abstract";
import { TraceUiItemsProvider } from "../NetworkTraceUIProvider";
import connectedIcon from "../icons/connected-query.svg?sprite";

/**
 * Immediate tool that will open an example modal dialog.The tool is created and register to allow the user
 * to activate the tool via the key-in palette using the tools keyin property (which must be unique across
 * all registered application and extension tools).
 * @alpha
 */
export class OpenTraceDialogTool extends Tool {
  public static override toolId = "uiTestExtension-OpenTraceDialogTool";
  public static override iconSpec = IconSpecUtilities.createSvgIconSpec(connectedIcon);

  // istanbul ignore next
  public static override get minArgs() { return 0; }
  // istanbul ignore next
  public static override get maxArgs() { return 0; }

  public override run(): boolean {
    ModalDialogManager.openDialog(<SampleModalDialog />);
    return true;
  }

  public override parseAndRun(): boolean {
    return this.run();
  }

  public static override get flyover(): string {
    return TraceUiItemsProvider.translate("trace-tool-connected");
  }

  // if supporting localized key-ins return a localized string
  public static override get keyin(): string {
    return "trace tool connected";
  }

  public static override get englishKeyin(): string {
    return "trace tool connected";
  }

  public static getActionButtonDef(itemPriority: number, groupPriority?: number) {
    const isDisabledCondition = new ConditionalBooleanValue(
      (): boolean => {
        return !TraceUiItemsProvider.isTraceAvailable;
      },
      [TraceUiItemsProvider.syncEventIdTraceAvailable],
      !TraceUiItemsProvider.isTraceAvailable
    );

    const overrides = {
      isDisabled: isDisabledCondition,
      badgeType: BadgeType.TechnicalPreview,
      groupPriority,
    };

    return ToolbarItemUtilities.createActionButton(OpenTraceDialogTool.toolId, itemPriority, OpenTraceDialogTool.iconSpec, OpenTraceDialogTool.flyover,
      () => { IModelApp.tools.run(OpenTraceDialogTool.toolId); },
      overrides);
  }
}
