/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Form
 */

import "./Form.scss";
import * as React from "react";
import { UiCore } from "../UiCore";
import { Field } from "./Field";
import { Button } from "@itwin/itwinui-react";

// cSpell:ignore multilinetextbox

/** The available editors for the fields in a [[Form]].
 * @beta
 */
export type FieldEditor = "textbox" | "multilinetextbox" | "dropdown" | "checkbox";

/** Interface used to define each [[Field]] in a [[Form]]
 * @beta
 */
export interface FieldDef {
  /* The label text for the field */
  label?: string;

  /* The editor for the field */
  editor?: FieldEditor;

  /* The drop down items for the field */
  options?: string[] | { [key: string]: string };

  /* The initial field value */
  value?: any;
}

/** Key/value pairs for all the field values with key being the field HTML Id.
 * @beta
 */
export interface FieldValues {
  [key: string]: any;
}

/** The state data used by [[Form]] to hold state of each [[Field]] and the result of submit button processing.
 * @beta
 */
interface FormState {
  /* The field values */
  values: FieldValues;

  /* The errorMsg message return in catch of async submit button processing */
  errorMsg: string;

  /* Whether the form has been successfully submitted */
  submitSuccess?: boolean;
}

/**
 * FormContextState combines the Form's state data with the callbacks used to update the value of the state data.
 * @beta
 */
export interface FormContextState extends FormState {
  setValues: (values: FieldValues) => void;
}

/** React context used by Form as a Provider and by the Fields as Consumers and updaters.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FormContext = React.createContext<FormContextState | undefined>(undefined);
FormContext.displayName = "ui-core:FormContext";

/** Key/value pairs for all the field definitions to be displayed in a [[Form]].
 * @beta
 */
export interface FieldDefinitions {
  [key: string]: FieldDef;
}

/** Properties that define [[Form]] including the callback to be called when the Submit button is pressed.
 * @beta
 */
export interface FormProps {
  /** Required async callback the processes the Form data and throws and Error if the data cannot be processed.  */
  handleFormSubmit: (values: FieldValues) => Promise<void>;
  /** Definition used to create each Field in the Form. */
  fields: FieldDefinitions;
  /** Optional label which will override default Submit button label. */
  submitButtonLabel?: string;
}

/** Component used to create a Form using supplied properties to specify the fields of the Form.
 * @example
 * // Example of using a form as contents of a modal dialog.
 * export class ExampleForm extends React.Component {
 *   public static open() {
 *   const form = new ExampleForm({});
 *   ModalDialogManager.openDialog(form.render());
 * }
 *
 * protected async handleSubmit(values: FieldValues): Promise<void> {
 *   await this.processFormSubmission(values);
 *   ModalDialogManager.closeDialog();
 *   const msg = JSON.stringify(values);
 *   IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Form Submitted", msg));
 * }
 *
 * protected async processFormSubmission(values: FieldValues): Promise<void> {
 *   // if error occurs during async processing throw an Error and return error message back to form.
 *   throw new Error("Error processing form");
 * }
 *
 * protected handleCancel() {
 *   ModalDialogManager.closeDialog();
 * }
 *
 * public render() {
 *   const fields: FieldDefinitions = {
 *     Name: {
 *       label: this._nameLabel,
 *       editor: "textbox",
 *       value: "John Smith",
 *     },
 *     PickList: {
 *       label: this._pickListLabel,
 *       editor: "dropdown",
 *       value: "one",
 *       options: ["one", "two", "three", "four"],
 *     },
 *   };
 *
 *   return (
 *     <div>
 *       <Dialog title="Example Form"
 *         opened={true}
 *         onClose={() => this.handleCancel()}>
 *         <Form handleFormSubmit={(values: FieldValues) => this.handleSubmit(values)}
 *           fields={fields}
 *         />
 *       </Dialog>
 *     </div >
 *   );
 * }
 * @beta
 */
export class Form extends React.Component<FormProps, FormState> {
  private _submitButtonLabel = UiCore.translate("form.submitButtonLabel");
  private _errorPrefix = UiCore.translate("form.errorPrefix");
  private _errorSuffix = UiCore.translate("form.errorSuffix");

  constructor(props: FormProps) {
    super(props);

    // set initial values for field values
    const values: FieldValues = {};
    Object.keys(props.fields).forEach((key) => values[key] = props.fields[key].value);

    this.state = {
      errorMsg: "",
      values,
    };
  }

  /**
   * Returns whether there is an errorMsg message in the state/context
   * @param errorMsg - The form errorMsg
   */
  private haveError(errorMsg: string) {
    return errorMsg && errorMsg.length;
  }

  private _setValues = (values: FieldValues) => {
    this.setState((prevState) => ({ values: { ...prevState.values, ...values } }));
  };

  private _handleSubmit = (event: React.FormEvent<HTMLFormElement>, values: FieldValues) => {
    event.preventDefault();

    // istanbul ignore next
    if (!this.props.handleFormSubmit || !values || 0 === values.length)
      throw new Error("A handleFormSubmit function and values must be defined");

    this.props.handleFormSubmit(values)
      .then(() => {
        // Currently we don't need to do anything if successful. Typically the hosting dialog will close when the
        // submission is successful.
        // console.log(rtnMsg);
      })
      .catch((reason: Error) => {
        this.setState({ submitSuccess: false, errorMsg: reason.message });
      });
  };

  public override render() {
    const { submitSuccess, errorMsg } = this.state;
    const { fields, submitButtonLabel } = this.props;
    const context: FormContextState = { ...this.state, setValues: this._setValues };

    return (
      <FormContext.Provider value={context}>
        <div className="core-form-wrapper">
          <form onSubmit={(event: React.FormEvent<HTMLFormElement>) => this._handleSubmit(event, this.state.values)} noValidate={true}>
            <div className="core-form-container">
              {Object.keys(fields).map((key) => <Field key={key} id={key} {...this.props.fields[key]} />)}
              <div className="core-form-footer">
                <div className="core-form-buttons">
                  <Button type="submit" styleType="high-visibility">
                    {submitButtonLabel ? submitButtonLabel : this._submitButtonLabel}
                  </Button>
                </div>
                {submitSuccess === false && this.haveError(errorMsg) && (
                  <div className="core-form-alert" role="alert">{`${this._errorPrefix}-${errorMsg} ${this._errorSuffix}`}</div>
                )}
              </div>
            </div>
          </form>
        </div>
      </FormContext.Provider>
    );
  }
}
