/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./BlockingPrompt.scss";
import "./Common.scss";
import * as React from "react";
import { Spinner, SpinnerSize } from "@bentley/ui-core";

interface BlockingPromptProps {
  prompt: string;
}

/**
 * Display a message box centered in the view port with lightbox (ghosting background)
 */
export class BlockingPrompt extends React.Component<BlockingPromptProps> {
  public override render() {
    return (
      <div className="blocking-modal-background fade-in-fast">
        <div className="blocking-prompt fade-in">
          <Spinner size={SpinnerSize.Large} />
          <span>{this.props.prompt}</span>
        </div>
      </div>
    );
  }
}
