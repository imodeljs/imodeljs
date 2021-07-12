/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import "./ActionButtonList.scss";
import * as React from "react";
import { PropertyRecord } from "@bentley/ui-abstract";
import { Orientation } from "@bentley/ui-core";
import { ActionButtonRenderer, ActionButtonRendererProps } from "./ActionButtonRenderer";

/** Properties of [[ActionButtonList]] React component
 * @beta
 */
export interface ActionButtonListProps {
  /** Orientation to use for displaying the action buttons */
  orientation: Orientation;
  /** Property that action buttons belong to */
  property: PropertyRecord;
  /** Array of action button renderers */
  actionButtonRenderers: ActionButtonRenderer[];
  /** Indicated whether a property is hovered  */
  isPropertyHovered?: boolean;
}

/** ActionButtonList React component.
 * @beta
 */
export class ActionButtonList extends React.PureComponent<ActionButtonListProps> {
  private getClassName(orientation: Orientation) {
    return orientation === Orientation.Horizontal
      ? "components-property-action-button-list--horizontal"
      : "components-property-action-button-list--vertical";
  }

  /** @internal */
  public override render() {
    return (
      <div className={this.getClassName(this.props.orientation)}>
        {this.props.actionButtonRenderers.map((renderer, index) =>
          <ActionButtonContainer
            key={index}
            renderer={renderer}
            rendererProps={{
              property: this.props.property,
              isPropertyHovered: this.props.isPropertyHovered,
            }}
          />,
        )}
      </div>
    );
  }
}

interface ActionButtonContainerProps {
  renderer: ActionButtonRenderer;
  rendererProps: ActionButtonRendererProps;
}

function ActionButtonContainer(props: ActionButtonContainerProps) {
  const actionButton = props.renderer(props.rendererProps);
  if (!actionButton)
    return null;

  return (
    <div className="components-action-button-container">
      {actionButton}
    </div>
  );
}
