/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Base
 */

import * as React from "react";
import { Rectangle, RectangleProps } from "@bentley/ui-core";
import { Css } from "../utilities/Css";

/** Properties of [[withContainIn]] HOC.
 * @alpha
 */
export interface WithContainInProps {
  /** Function called to determine the actual bounds of wrapped component. See: [[contain]], [[containHorizontally]], [containVertically]. */
  containFn?: (componentBounds: RectangleProps, containerBounds: RectangleProps) => RectangleProps;
  /** Container in which the wrapped component is contained. By default contains component in viewport. */
  container?: HTMLElement | null;
}

/** Contains the component bounds both vertically and horizontally. This is default containment method for [[withContainIn]].
 * @alpha
 */
export const contain = (componentBounds: RectangleProps, containerBounds: RectangleProps): RectangleProps => {
  const bounds = Rectangle.create(componentBounds);
  return bounds.containIn(containerBounds);
};

/** Contains the component bounds horizontally.
 * @alpha
 */
export const containHorizontally = (componentBounds: RectangleProps, containerBounds: RectangleProps): RectangleProps => {
  const bounds = Rectangle.create(componentBounds);
  return bounds.containHorizontallyIn(containerBounds);
};

/** Contains the component bounds vertically.
 * @alpha
 */
export const containVertically = (componentBounds: RectangleProps, containerBounds: RectangleProps): RectangleProps => {
  const bounds = Rectangle.create(componentBounds);
  return bounds.containVerticallyIn(containerBounds);
};

/** HOC which will ensure, that wrapped component bounds are contained in specified container bounds.
 * @alpha Transfer to ui-core or remove if used with popups only.
 */
export const withContainIn = <ComponentProps extends {}>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<ComponentProps>,
) => {
  return class WithContainIn extends React.PureComponent<ComponentProps & WithContainInProps> {
    public ref = React.createRef<HTMLDivElement>();

    public get containFn() {
      const { containFn } = this.props as WithContainInProps;
      return containFn === undefined ? contain : containFn;
    }

    /** @internal */
    public getContainerBounds(): Rectangle {
      if (!this.props.container)
        return new Rectangle(0, 0, window.innerWidth, window.innerHeight);

      const containerBounds = this.props.container.getBoundingClientRect();
      return new Rectangle(containerBounds.left, containerBounds.top, containerBounds.right, containerBounds.bottom);
    }

    /** @internal */
    public getComponentBounds(root: HTMLElement): Rectangle {
      const bounds = root.getBoundingClientRect();
      return Rectangle.create(bounds);
    }

    public override componentDidMount() {
      if (!this.ref.current)
        return;

      const componentBounds = this.getComponentBounds(this.ref.current);
      const containerBounds = this.getContainerBounds();
      const contained = Rectangle.create(this.containFn(componentBounds, containerBounds));

      const offset = componentBounds.topLeft().getOffsetTo(contained.topLeft());
      this.ref.current.style.position = "relative";
      this.ref.current.style.top = Css.toPx(offset.y);
      this.ref.current.style.left = Css.toPx(offset.x);
    }

    public override render() {
      const { containFn, container, ...props } = this.props as WithContainInProps; // eslint-disable-line @typescript-eslint/no-unused-vars
      return (
        <div ref={this.ref}>
          <Component
            {...props as ComponentProps}
            {...this.state}
          />
        </div>
      );
    }
  };
};
