/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolAssistance
 */

import "./Instruction.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { ToolAssistanceItem } from "./Item";
import { NewDot } from "./NewDot";

/** Properties of [[ToolAssistanceInstruction]] component.
 * @beta
 */
export interface ToolAssistanceInstructionProps extends CommonProps {
  /** Image for instruction */
  image: React.ReactNode;
  /** Indicates whether instruction is new */
  isNew?: boolean;
  /** Text for instruction */
  text: string;
}

/** Tool assistance instruction used in [[ToolAssistanceDialog]] component.
 * @beta
 */
export class ToolAssistanceInstruction extends React.PureComponent<ToolAssistanceInstructionProps> {
  public override render() {
    const className = classnames(
      "nz-footer-toolAssistance-instruction",
      this.props.className);
    const textClassName = this.props.isNew ? "nz-text-new" : undefined;

    return (
      <ToolAssistanceItem
        className={className}
        style={this.props.style}
      >
        <span className="nz-image">
          {this.props.isNew && <NewDot />}
          {this.props.image}
        </span>
        <span className={textClassName}>
          {this.props.text}
        </span>
      </ToolAssistanceItem>
    );
  }
}
