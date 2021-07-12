/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IconPicker
 */

import "./IconPickerButton.scss";
import classnames from "classnames";
import * as React from "react";
import { RelativePosition } from "@bentley/ui-abstract";
import { CommonProps, Popup, SvgSprite } from "@bentley/ui-core";

/** Properties for the [[IconItem]] React component
 * @alpha
 */
interface IconItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {
  /** icon specification */
  icon: string;
  /** function to run when user selects icon */
  onClick?: () => void;
}

/** IconItem Functional component
 * @alpha
 */
// istanbul ignore next
class IconItem extends React.PureComponent<IconItemProps> {
  /** @internal */
  constructor(props: IconItemProps) {
    super(props);
  }

  public override render() {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onClick, icon, // do not pass on item specific props
      ...otherProps
    } = this.props;

    const handleClick = (_e: React.MouseEvent) => {
      if (onClick)
        onClick();
    };

    const classes = classnames("components-icon-swatch", this.props.className);

    return (
      <button {...otherProps} className={classes} style={this.props.style} onClick={handleClick}>
        <SvgSprite src={this.props.icon} />
      </button>
    );
  }
}

/** Properties for the [[IconPicker]] React component
 * @alpha
 */
// istanbul ignore next
export interface IconPickerProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {
  /** active string */
  icon: string;
  /** available icons */
  icons: string[];
  /** function to run when user selects icon */
  onIconChange?: ((icon: string) => void) | undefined;
  /** Disabled or not */
  disabled?: boolean;
  /** Readonly or not */
  readonly?: boolean;
  /** Title to show at top of DropDown */
  dropDownTitle?: string;
  /** Number of columns */
  numColumns: number;
}

/** @internal */
interface IconPickerState {
  showPopup: boolean;
  icon: string;
}

/** IconPickerButton component
 * @alpha
 */
// istanbul ignore next
export class IconPickerButton extends React.PureComponent<IconPickerProps, IconPickerState> {
  private _target = React.createRef<HTMLButtonElement>();

  /** @internal */
  public static defaultProps: Partial<IconPickerProps> = {
    numColumns: 4,
  };

  /** @internal */
  constructor(props: IconPickerProps) {
    super(props);

    this.state = { showPopup: false, icon: this.props.icon };
  }

  private _togglePopup = () => {
    if (this.props.readonly)
      return;

    this.setState((prevState) => ({ showPopup: !prevState.showPopup }));
  };

  private _closePopup = () => {
    this.setState({ showPopup: false });
  };

  private _handleIconPicked = (icon: string) => {
    this.setState(
      { showPopup: false, icon },
      () => {
        // istanbul ignore else
        if (this.props.onIconChange)
          this.props.onIconChange(icon);
      });
  };

  private renderPopup(title: string | undefined) {
    const containerStyle: React.CSSProperties = { gridTemplateColumns: `repeat(${this.props.numColumns}, 1fr)` };
    return (
      <div className="components-iconpicker-popup-container">
        {title && <h4>{title}</h4>}
        <div data-testid="components-iconpicker-popup-icons" className="components-iconpicker-popup-icons" style={containerStyle}>
          {this.props.icons.map((icon: string, index: number) => <IconItem key={index} icon={icon} onClick={this._handleIconPicked.bind(this, icon)} />)}
        </div>
      </div>
    );
  }

  /** @internal */
  public override render() {
    const buttonStyle = { ...this.props.style } as React.CSSProperties;
    const buttonClassNames = classnames("components-iconpicker-button",
      this.props.readonly && "readonly",
      this.props.className,
    );

    return (
      <>
        <button data-testid="components-iconpicker-button" onClick={this._togglePopup} className={buttonClassNames} style={buttonStyle} disabled={this.props.disabled} ref={this._target}>
          <SvgSprite className="iconpicker-button-sprite" src={this.state.icon} />
          <span className="icon icon-chevron-down" />
        </button>
        <Popup
          className="components-iconpicker-popup"
          isOpen={this.state.showPopup}
          position={RelativePosition.BottomLeft}
          onClose={this._closePopup}
          target={this._target.current}>
          {this.renderPopup(this.props.dropDownTitle)}
        </Popup>
      </>
    );
  }

}
