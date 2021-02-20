/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { EditorBasicManipulationCommandIpc, editorBuiltInCmdIds } from "@bentley/imodeljs-editor-common";
import { ElementSetTool } from "@bentley/imodeljs-frontend";
import { CompressedId64Set, IModelStatus } from "@bentley/bentleyjs-core";
import { EditTools } from "./EditTool";

/** Delete elements immediately from active selection set or prompt user to identify elements to delete. */
export class DeleteElementsTool extends ElementSetTool {
  public static toolId = "DeleteElements";

  protected get allowSelectionSet(): boolean { return true; }
  protected get allowGroups(): boolean { return true; }
  protected get allowDragSelect(): boolean { return true; }
  protected get controlKeyContinuesSelection(): boolean { return true; }
  protected get requireAcceptForSelectionSetOperation(): boolean { return false; }

  public static callCommand<T extends keyof EditorBasicManipulationCommandIpc>(method: T, ...args: Parameters<EditorBasicManipulationCommandIpc[T]>): ReturnType<EditorBasicManipulationCommandIpc[T]> {
    return EditTools.callCommand(method, ...args) as ReturnType<EditorBasicManipulationCommandIpc[T]>;
  }

  public async processAgendaImmediate(): Promise<void> {
    try {
      await EditTools.startCommand<string>(editorBuiltInCmdIds.cmdBasicManipulation, this.iModel.key);
      if (IModelStatus.Success === await DeleteElementsTool.callCommand("deleteElements", CompressedId64Set.compressArray(this.agenda.elements)))
        await this.iModel.saveChanges();
    } catch (err) {
      // TODO: NotificationManager message?
    }
  }

  public onRestartTool(): void {
    const tool = new DeleteElementsTool();
    if (!tool.run())
      this.exitTool();
  }
}
