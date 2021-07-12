/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import "./Dialog.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { DivWithOutsideClick } from "../base/DivWithOutsideClick";
import { UiCore } from "../UiCore";
import { CommonProps } from "../utils/Props";
import { Omit } from "../utils/typeUtils";
import { FocusTrap } from "../focustrap/FocusTrap";

// cspell:ignore focustrap

/** Enum for button types. Determines button label, and default button style.
 * @public
 */
export enum DialogButtonType {
  None = "",
  Close = "close",
  OK = "ok",
  Cancel = "cancel",
  Yes = "yes",
  No = "no",
  Retry = "retry",
  Next = "next",
  Previous = "previous"
}

/** Enum for button style.
 * @public
 */
export enum DialogButtonStyle {
  None = "",
  Primary = "uicore-buttons-primary",
  Hollow = "uicore-buttons-hollow",
  Blue = "uicore-buttons-blue",
}

/** Enum for dialog alignment
 * @public
 */
export enum DialogAlignment {
  TopLeft = "top-left", Top = "top", TopRight = "top-right",
  Left = "left", Center = "center", Right = "right",
  BottomLeft = "bottom-left", Bottom = "bottom", BottomRight = "bottom-right",
}

/** Interface for a dialog button in a button cluster
 * @public
 */
export interface DialogButtonDef {
  /** type of button */
  type: DialogButtonType;
  /** Triggered on button click */
  onClick: () => void;
  /** Which button style to decorate button width */
  buttonStyle?: DialogButtonStyle;
  /** Disable the button */
  disabled?: boolean;
  /** Custom label */
  label?: string;
  /** Custom CSS class */
  className?: string;
}

/** Properties for the [[Dialog]] component
 * @public
 */
export interface DialogProps extends Omit<React.AllHTMLAttributes<HTMLDivElement>, "title">, CommonProps {
  /** Indicates whether to show dialog or not */
  opened: boolean;

  /** Indicates whether the user can resize dialog with cursor. Default: false */
  resizable?: boolean;
  /** Indicates whether the user can move dialog with cursor. Default: false */
  movable?: boolean;
  /** Indicates whether the content should be inset. Default: true */
  inset?: boolean;
  /** Indicates whether the focus should be trapped within the dialog. Default: false */
  trapFocus?: boolean;

  /** Whether the hide the header. Default: false */
  hideHeader?: boolean;
  /** Override for the header */
  header?: React.ReactNode;
  /** Title to show in title bar of dialog */
  title?: string | JSX.Element;
  /** Footer to show at bottom of dialog. Note: will override buttonCluster */
  footer?: string | JSX.Element;
  /** List of DialogButtonDef objects specifying buttons and associated onClick events */
  buttonCluster?: DialogButtonDef[];

  /** Default alignment of dialog. Default: DialogAlignment.Center */
  alignment?: DialogAlignment;
  /** Initial x/left position of dialog in px. */
  x?: number;
  /** Initial y/top position of dialog in px. */
  y?: number;

  /** onClick event for X button for dialog */
  onClose?: () => void;
  /** 'keyup' event for Esc key */
  onEscape?: () => void;
  /** Triggered when a click is triggered outside of this dialog. */
  onOutsideClick?: (event: MouseEvent) => any;

  /** Initial width of dialog. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: "50%" */
  width?: string | number;
  /** Initial height of dialog. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  height?: string | number;
  /** Minimum width that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: 300px */
  minWidth?: string | number;
  /** Minimum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. Default: 100px */
  minHeight?: string | number;
  /** Maximum width that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxWidth?: string | number;
  /** Maximum height that the dialog may be resized to. Displayed in px if value is a number; otherwise, displayed in specified CSS unit. */
  maxHeight?: string | number;

  /** Whether to show background overlay. Default: true.
   * @note Modeless dialogs require an id and an implementation of onModelessPointerDown.
   */
  modal?: boolean;
  /** An id for a modeless dialog */
  modelessId?: string;
  /** Pointer Down event handler when modeless (modal = false) */
  onModelessPointerDown?: (event: React.PointerEvent, id: string) => void;

  /** Custom CSS Style for overlay */
  backgroundStyle?: React.CSSProperties;
  /** Custom CSS Style for title */
  titleStyle?: React.CSSProperties;
  /** Custom CSS Style for footer */
  footerStyle?: React.CSSProperties;
  /** Custom CSS class name for the content */
  contentClassName?: string;
  /** Custom CSS Style for the content */
  contentStyle?: React.CSSProperties;
}

/** @internal */
interface DialogState {
  rightResizing: boolean;
  downResizing: boolean;
  moving: boolean;
  grabOffsetX: number;
  grabOffsetY: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  positionSet: boolean;
}

/**
 * Dialog React component with optional resizing and dragging functionality
 * @public
 */
export class Dialog extends React.Component<DialogProps, DialogState> {
  private _parentDocument = document;
  private _containerRef = React.createRef<HTMLDivElement>();
  public static defaultProps: Partial<DialogProps> = {
    alignment: DialogAlignment.Center,
    minWidth: 300,
    minHeight: 100,
    width: "50%",
    hideHeader: false,
    resizable: false,
    movable: false,
    modal: true,
    inset: true,
    trapFocus: false,
  };

  /** @internal */
  public override readonly state: Readonly<DialogState>;

  constructor(props: DialogProps) {
    super(props);
    this.state = {
      rightResizing: false,
      downResizing: false,
      moving: false,
      grabOffsetX: 0,
      grabOffsetY: 0,
      positionSet: props.x !== undefined || props.y !== undefined,
    };
  }

  private getParentWindow() {
    // istanbul ignore next
    return this._parentDocument.defaultView ?? window;
  }

  public override componentWillUnmount(): void {
    const parentWindow = this.getParentWindow();
    parentWindow.removeEventListener("pointerup", this._handlePointerUp, true);
    parentWindow.removeEventListener("pointermove", this._handlePointerMove, true);
    this._parentDocument.removeEventListener("keyup", this._handleKeyUp, true);
  }

  public override componentDidMount(): void {
    const parentWindow = this.getParentWindow();
    parentWindow.addEventListener("pointerup", this._handlePointerUp, true);
    this._parentDocument.addEventListener("keyup", this._handleKeyUp, true);
  }

  public handleRefSet = (containerDiv: HTMLDivElement | null) => {
    if (containerDiv)
      this._parentDocument = containerDiv.ownerDocument;
  };

  public override render(): JSX.Element {
    const {
      opened, title, footer, buttonCluster, onClose, onEscape, onOutsideClick, // eslint-disable-line @typescript-eslint/no-unused-vars
      minWidth, minHeight, x, y, width, height, maxHeight, maxWidth,
      backgroundStyle, titleStyle, footerStyle, style, contentStyle, contentClassName,
      modal, resizable, movable, className, alignment, inset, trapFocus, modelessId, onModelessPointerDown, // eslint-disable-line @typescript-eslint/no-unused-vars
      hideHeader, header, ...props } = this.props;

    const containerStyle: React.CSSProperties = {
      margin: "",
      left: x, top: y,
      width, height,
    };

    if (this.state.x !== undefined || this.state.y !== undefined) {
      // istanbul ignore else
      if (this.state.x !== undefined) {
        containerStyle.marginLeft = "0";
        containerStyle.marginRight = "0";
        containerStyle.left = this.state.x;
      }
      // istanbul ignore else
      if (this.state.y !== undefined) {
        containerStyle.marginTop = "0";
        containerStyle.marginBottom = "0";
        containerStyle.top = this.state.y;
      }
    }

    if (this.state.width !== undefined || this.state.height !== undefined) {
      // istanbul ignore else
      if (this.state.width !== undefined)
        containerStyle.width = this.state.width;
      // istanbul ignore else
      if (this.state.height !== undefined)
        containerStyle.height = this.state.height;
    }

    const minMaxStyle: React.CSSProperties = {};
    minMaxStyle.minWidth = (typeof minWidth === "number") ? `${minWidth}px` : minWidth;
    minMaxStyle.minHeight = (typeof minHeight === "number") ? `${minHeight}px` : minHeight;
    if (maxWidth !== undefined)
      minMaxStyle.maxWidth = (typeof maxWidth === "number") ? `${maxWidth}px` : maxWidth;
    if (maxHeight !== undefined)
      minMaxStyle.maxHeight = (typeof maxHeight === "number") ? `${maxHeight}px` : maxHeight;

    const buttons = this.getFooterButtons(this.props);

    const footerElement: React.ReactNode = footer || (buttons.length > 0 && <div className={"core-dialog-buttons"}>{buttons}</div>);

    const divStyle: React.CSSProperties = {
      ...backgroundStyle,
      ...style,
    };

    const headerElement = header || (
      <div
        className={
          classnames(
            "core-dialog-head",
            { "core-dialog-movable": movable })
        }
        data-testid="core-dialog-head"
        onPointerDown={this._handleStartMove}>
        <div className={"core-dialog-title"} data-testid="core-dialog-title" style={titleStyle}>{title}</div>
        <button
          className={"core-focus-trap-ignore-initial core-dialog-close icon icon-close"}
          data-testid="core-dialog-close"
          onClick={onClose}
        />
      </div>
    );

    return (
      <div ref={this.handleRefSet}
        className={classnames(
          "core-dialog",
          !modal && "core-dialog-hidden",
          opened && "core-dialog-opened",
          className,
        )}
        style={divStyle}
        data-testid="core-dialog-root"
        {...props}
      >
        { opened &&
          <DivWithOutsideClick onOutsideClick={onOutsideClick}>
            <FocusTrap active={trapFocus && modal} returnFocusOnDeactivate={true}>
              <div
                className={classnames("core-dialog-container", this.getCSSClassNameFromAlignment(alignment))}
                style={{ ...containerStyle, ...minMaxStyle }}
                data-testid="core-dialog-container"
                onPointerDown={this._handleContainerPointerDown}
              >
                <div className={"core-dialog-area"} ref={this._containerRef} style={minMaxStyle}>
                  {!hideHeader &&
                    headerElement
                  }
                  <div
                    className={classnames(
                      "core-dialog-content",
                      { "core-dialog-content-no-inset": !inset },
                      contentClassName)}
                    style={contentStyle}>
                    {this.props.children}
                  </div>
                  {footerElement &&
                    <div className={"core-dialog-footer"} style={footerStyle}>
                      {footerElement}
                    </div>
                  }
                  <div
                    className={classnames("core-dialog-drag", "core-dialog-drag-right", { "core-dialog-drag-enabled": resizable })}
                    data-testid="core-dialog-drag-right"
                    onPointerDown={this._handleStartResizeRight}
                  />
                  <div
                    className={classnames("core-dialog-drag", "core-dialog-drag-bottom-mid", { "core-dialog-drag-enabled": resizable })}
                    data-testid="core-dialog-drag-bottom"
                    onPointerDown={this._handleStartResizeDown}
                  />
                  <div
                    className={classnames("core-dialog-drag", "core-dialog-drag-bottom-right", { "core-dialog-drag-enabled": resizable })}
                    data-testid="core-dialog-drag-bottom-right"
                    onPointerDown={this._handleStartResizeDownRight}
                  />
                </div>
              </div>
            </FocusTrap>
          </DivWithOutsideClick>
        }
      </div>
    );
  }

  private getCSSClassNameFromAlignment(alignment?: DialogAlignment): string {
    let className = "";

    // Drop the alignment CSS class if the Dialog has been sized or moved.
    if (this.state.positionSet)
      return "";

    // istanbul ignore next
    if (!alignment)
      alignment = DialogAlignment.Center;

    switch (alignment) {
      case DialogAlignment.TopLeft:
        className = "core-dialog-top-left";
        break;
      case DialogAlignment.Top:
        className = "core-dialog-top";
        break;
      case DialogAlignment.TopRight:
        className = "core-dialog-top-right";
        break;
      case DialogAlignment.Left:
        className = "core-dialog-left";
        break;
      case DialogAlignment.Center:
        className = "core-dialog-center";
        break;
      case DialogAlignment.Right:
        className = "core-dialog-right";
        break;
      case DialogAlignment.BottomLeft:
        className = "core-dialog-bottom-left";
        break;
      case DialogAlignment.Bottom:
        className = "core-dialog-bottom";
        break;
      case DialogAlignment.BottomRight:
        className = "core-dialog-bottom-right";
        break;
    }

    return className;
  }

  private getFooterButtons(props: DialogProps) {
    const buttons: React.ReactNode[] = [];
    if (props.buttonCluster) {
      props.buttonCluster.forEach((button: DialogButtonDef, index: number) => {
        let buttonText = "";
        let buttonClass = classnames("core-dialog-button", `dialog-button-${button.type}`, button.className);

        switch (button.type) {
          case DialogButtonType.OK:
            buttonText = UiCore.translate("dialog.ok");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-primary");
            break;
          case DialogButtonType.Retry:
            buttonText = UiCore.translate("dialog.retry");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-primary");
            break;
          case DialogButtonType.Yes:
            buttonText = UiCore.translate("dialog.yes");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-primary");
            break;
          case DialogButtonType.No:
            buttonText = UiCore.translate("dialog.no");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-hollow");
            break;
          case DialogButtonType.Cancel:
            buttonText = UiCore.translate("dialog.cancel");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-hollow");
            break;
          case DialogButtonType.Close:
            buttonText = UiCore.translate("dialog.close");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-hollow");
            break;
          case DialogButtonType.Next:
            buttonText = UiCore.translate("dialog.next");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-primary");
            break;
          case DialogButtonType.Previous:
            buttonText = UiCore.translate("dialog.previous");
            buttonClass = classnames(buttonClass, button.buttonStyle || "uicore-buttons-primary");
            break;
        }

        if (button.label)
          buttonText = button.label;

        buttons.push(<button className={buttonClass} disabled={button.disabled} key={index.toString()} onClick={button.onClick}>{buttonText}</button>);
      });
    }
    return buttons;
  }

  private _handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === SpecialKey.Escape && this.props.opened && this.props.onEscape) {
      this.props.onEscape();
    }
  };

  private _handleContainerPointerDown = (event: React.PointerEvent): void => {
    if (!this.props.modal) {
      if (this.props.onModelessPointerDown && this.props.modelessId)
        this.props.onModelessPointerDown(event, this.props.modelessId);
    }
  };

  private _handleStartResizeRight = (event: React.PointerEvent): void => {
    event.preventDefault();
    this.setState({ rightResizing: true });
    const parentWindow = this.getParentWindow();
    parentWindow.addEventListener("pointermove", this._handlePointerMove, true);
  };

  private _handleStartResizeDown = (event: React.PointerEvent): void => {
    event.preventDefault();
    this.setState({ downResizing: true });
    const parentWindow = this.getParentWindow();
    parentWindow.addEventListener("pointermove", this._handlePointerMove, true);
  };

  private _handleStartResizeDownRight = (event: React.PointerEvent): void => {
    event.preventDefault();
    this.setState({ downResizing: true, rightResizing: true });
    const parentWindow = this.getParentWindow();
    parentWindow.addEventListener("pointermove", this._handlePointerMove, true);
  };

  private _handleStartMove = (event: React.PointerEvent): void => {
    if (!this.props.movable)
      return;

    event.preventDefault();
    // istanbul ignore else
    if (this._containerRef.current) {
      const rect = this._containerRef.current.getBoundingClientRect();
      const grabOffsetX = event.clientX - rect.left;
      const grabOffsetY = event.clientY - rect.top;
      this.setState({
        grabOffsetX,
        grabOffsetY,
        moving: true,
      });

      const parentWindow = this.getParentWindow();
      parentWindow.addEventListener("pointermove", this._handlePointerMove, true);
    }
  };

  private _handlePointerMove = (event: PointerEvent): void => {
    if ((!this.props.resizable && !this.props.movable) || !this._containerRef.current)
      return;

    const { minWidth, maxWidth, minHeight, maxHeight, movable } = this.props;
    let { x, y, width, height } = this.state;

    // istanbul ignore else
    if (x === undefined) { // if x is undefined, so is y, width, and height
      const rect = this._containerRef.current.getBoundingClientRect();
      width = rect.width, height = rect.height, x = rect.left, y = rect.top;
    }

    if (this.props.resizable) {
      if (this.state.rightResizing) {
        const pointerX = event.clientX;
        width = pointerX - x;
        // istanbul ignore else
        if (typeof minWidth === "number")
          width = Math.max(width, minWidth);
        if (maxWidth !== undefined && typeof maxWidth === "number")
          width = Math.min(width, maxWidth);
      }

      if (this.state.downResizing) {
        const pointerY = event.clientY;
        height = pointerY - y!;
        // istanbul ignore else
        if (typeof minHeight === "number")
          height = Math.max(height, minHeight);
        if (maxHeight !== undefined && typeof maxHeight === "number")
          height = Math.min(height, maxHeight);
      }

      this.setState({ width, height });
    }

    if (movable && this.state.moving) {
      x = event.clientX - this.state.grabOffsetX;
      y = event.clientY - this.state.grabOffsetY;
      this.setState({ x, y, positionSet: true });
    }
  };

  private _handlePointerUp = (_event: PointerEvent): void => {
    if (!this.props.movable && !this.props.resizable)
      return;

    // istanbul ignore else
    if (this._containerRef.current) {
      this.setState({
        rightResizing: false,
        downResizing: false,
        moving: false,
        grabOffsetX: 0,
        grabOffsetY: 0,
      });
    }

    const parentWindow = this.getParentWindow();
    parentWindow.removeEventListener("pointermove", this._handlePointerMove, true);
  };
}
