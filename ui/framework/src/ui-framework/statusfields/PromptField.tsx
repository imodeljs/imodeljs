/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import "./PromptField.scss";
import classnames from "classnames";
import * as React from "react";
import { connect } from "react-redux";
import { FooterIndicator } from "@bentley/ui-ninezone";
import { UiFramework } from "../UiFramework";
import { StatusFieldProps } from "./StatusFieldProps";

/** Defines properties supported by the Prompt Field Component.
 */
interface PromptFieldProps extends StatusFieldProps {
  /** Prompt text for the active tool */
  toolPrompt: string;
}

/**
 * Prompt Field React component. This component is designed to be specified in a status bar definition.
 * It is used to display prompts from tools. To send a prompt to this component use IModelApp.notifications.outputPromptByKey or
 * IModelApp.notifications.outputPrompt.
 */
class PromptFieldComponent extends React.Component<PromptFieldProps> {

  constructor(props: PromptFieldProps) {
    super(props);
  }

  public override render(): React.ReactNode {
    return (
      <FooterIndicator
        className={classnames("uifw-statusFields-promptField", this.props.className)}
        style={this.props.style}
        isInFooterMode={this.props.isInFooterMode}
      >
        {this.props.toolPrompt}
      </FooterIndicator>
    );
  }
}

/** Function used by Redux to map state data in Redux store to props that are used to render this component. */
function mapStateToProps(state: any) {
  const frameworkState = state[UiFramework.frameworkStateKey];  // since app sets up key, don't hard-code name
  /* istanbul ignore next */
  if (!frameworkState)
    return undefined;

  return { toolPrompt: frameworkState.configurableUiState.toolPrompt };
}

// we declare the variable and export that rather than using export default.
/**
 * Prompt Field React component. This component is designed to be specified in a status bar definition.
 * It is used to display prompts from tools. To send a prompt to this component use IModelApp.notifications.outputPromptByKey or
 * IModelApp.notifications.outputPrompt.
 * This React component is Redux connected.
 * @public
 * @deprecated Use ToolAssistanceField instead
 */ // eslint-disable-next-line @typescript-eslint/naming-convention
export const PromptField = connect(mapStateToProps)(PromptFieldComponent);
