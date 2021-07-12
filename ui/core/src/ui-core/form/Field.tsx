/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Form
 */

import * as React from "react";
import { Checkbox } from "../checkbox/Checkbox";
import { Input } from "../inputs/Input";
import { Textarea } from "../inputs/Textarea";
import { Select } from "../select/Select";
import { FieldDef, FormContext, FormContextState } from "./Form";

// cSpell:ignore multilinetextbox

/** Properties used to create a [[Field]] in a [[Form]]
 * @beta
 */
export interface FieldProps extends FieldDef {
  /* The unique field name */
  id: string;
}

/** Component that represents a single field in an input form. Only four type of editors are supported. Field gets/sets state data from/to the context control by the form.
 * @beta
 */
export class Field extends React.Component<FieldProps> {
  constructor(props: FieldProps) {
    super(props);
  }

  public override render() {
    return (
      <FormContext.Consumer>
        {(context: FormContextState | undefined) => (
          <div className="core-form-group">
            {this.props.editor!.toLowerCase() !== "checkbox" && this.props.label && <label className="core-form-label" htmlFor={this.props.id}>{this.props.label}</label>}

            {this.props.editor!.toLowerCase() === "textbox" && (
              <Input
                id={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(event) => context!.setValues({ [this.props.id]: event.currentTarget.value })}
                className="core-form-input"
              />
            )}
            {this.props.editor!.toLowerCase() === "checkbox" && (
              <Checkbox
                label={this.props.label}
                id={this.props.id}
                checked={context!.values[this.props.id]}
                onChange={() => context!.setValues({ [this.props.id]: !context!.values[this.props.id] })}
              />
            )}
            {this.props.editor!.toLowerCase() === "multilinetextbox" && (
              <Textarea
                id={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(event) => context!.setValues({ [this.props.id]: event.currentTarget.value })}
                className="core-form-textarea"
              />
            )}
            {this.props.editor!.toLowerCase() === "dropdown" && this.props.options && (
              <Select
                id={this.props.id}
                name={this.props.id}
                value={context!.values[this.props.id]}
                onChange={(event) => context!.setValues({ [this.props.id]: event.currentTarget.value })}
                options={this.props.options}
                className="core-form-select"
              />
            )}
          </div>
        )}
      </FormContext.Consumer>
    );
  }
}
