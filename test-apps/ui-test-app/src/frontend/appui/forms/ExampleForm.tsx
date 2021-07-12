/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { Dialog, FieldDefinitions, FieldValues, Form } from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";

export class ExampleForm extends React.Component {
  private _title = "Example Form";
  private _siteUrlLabel = "Enter Site";
  private _nameLabel = "Specify List Name";
  private _notesLabel = "Notes";
  private _lockLabel = "Lock";
  private _pickListLabel = "Picker";

  public static open() {
    ModalDialogManager.openDialog(<ExampleForm />);
  }

  protected async handleSubmit(values: FieldValues): Promise<void> {
    await this.processFormSubmission(values);
    ModalDialogManager.closeDialog();
    const msg = JSON.stringify(values);
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Form Submitted", msg));
  }

  protected async processFormSubmission(values: FieldValues): Promise<void> {
    if (!values) {
      throw new Error("No values are available");
    }
    const keys = Object.keys(values);
    if (keys.find((value: string) => value === "SiteUrl")) {
      // for testing just ensure url string has text
      const urlString = values.SiteUrl as string;
      if (urlString.length) {
        return;
      }
    }
    throw new Error("SiteUrl value is not defined"); // Error message will be displayed to user.
  }

  protected handleCancel() {
    ModalDialogManager.closeDialog();
  }

  public override render() {
    const fields: FieldDefinitions = {
      SiteUrl: {
        label: this._siteUrlLabel,
        editor: "textbox",
        value: "",
      },
      Name: {
        label: this._nameLabel,
        editor: "textbox",
        value: "John Smith",
      },
      Notes: {
        label: this._notesLabel,
        editor: "multilinetextbox",
        value: "",

      },
      Lock: {
        label: this._lockLabel,
        editor: "checkbox",  // value for "checkbox" should be a boolean
        value: true,
      },
      PickList: {
        label: this._pickListLabel,
        editor: "dropdown",
        value: "one",
        options: ["one", "two", "three", "four"],
      },
    };

    return (
      <div>
        <Dialog title={this._title}
          opened={true}
          onClose={() => this.handleCancel()}>
          <Form handleFormSubmit={async (values: FieldValues) => this.handleSubmit(values)}
            fields={fields}
          />
        </Dialog>
      </div >
    );
  }
}
