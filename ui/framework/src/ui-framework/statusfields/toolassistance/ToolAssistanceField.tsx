/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./ToolAssistanceField.scss";
import classnames from "classnames";
import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import {
  IModelApp, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceInstructions, ToolAssistanceKeyboardInfo,
  ToolAssistanceSection,
} from "@bentley/imodeljs-frontend";
import { IconSpecUtilities } from "@bentley/ui-abstract";
import {
  FillCentered, HorizontalTabs, Icon, LabeledToggle, LocalSettingsStorage, SvgSprite, UiCore, UiSetting, UiSettingsResult, UiSettingsStatus, UiSettingsStorage,
} from "@bentley/ui-core";
import {
  FooterPopup, ToolAssistanceInstruction as NZ_ToolAssistanceInstruction, TitleBarButton, ToolAssistance, ToolAssistanceDialog, ToolAssistanceItem,
  ToolAssistanceSeparator,
} from "@bentley/ui-ninezone";
import { CursorPrompt } from "../../cursor/cursorprompt/CursorPrompt";
import { FrontstageManager, ToolIconChangedEventArgs } from "../../frontstage/FrontstageManager";
import { MessageManager, ToolAssistanceChangedEventArgs } from "../../messages/MessageManager";
import { StatusBarFieldId } from "../../statusbar/StatusBarWidgetControl";
import { UiFramework } from "../../UiFramework";
import { StatusFieldProps } from "../StatusFieldProps";
import { UiSettingsContext } from "../../uisettings/useUiSettings";

import acceptPointIcon from "./accept-point.svg?sprite";
import cursorClickIcon from "./cursor-click.svg?sprite";
import oneTouchDragIcon from "./gesture-one-finger-drag.svg?sprite";
import oneTouchDoubleTapIcon from "./gesture-one-finger-tap-double.svg?sprite";
import oneTouchTapIcon from "./gesture-one-finger-tap.svg?sprite";
import twoTouchPinchIcon from "./gesture-pinch.svg?sprite";
import twoTouchDragIcon from "./gesture-two-finger-drag.svg?sprite";
import twoTouchTapIcon from "./gesture-two-finger-tap.svg?sprite";
import clickLeftDragIcon from "./mouse-click-left-drag.svg?sprite";
import clickLeftIcon from "./mouse-click-left.svg?sprite";
import clickRightDragIcon from "./mouse-click-right-drag.svg?sprite";
import clickRightIcon from "./mouse-click-right.svg?sprite";
import clickMouseWheelDragIcon from "./mouse-click-wheel-drag.svg?sprite";
import mouseWheelClickIcon from "./mouse-click-wheel.svg?sprite";
import touchCursorDragIcon from "./touch-cursor-pan.svg?sprite";
import touchCursorTapIcon from "./touch-cursor-point.svg?sprite";

// cSpell:ignore cursorprompt

/** Properties of [[ToolAssistanceField]] component.
 * @public
 */
export interface ToolAssistanceFieldProps extends StatusFieldProps {
  /** Indicates whether to include promptAtCursor Checkbox. Defaults to true. */
  includePromptAtCursor: boolean;
  /** Optional parameter for persistent UI settings. Defaults to UiSettingsContext.
   */
  uiSettings?: UiSettingsStorage;
  /** Cursor Prompt Timeout period. Defaults to 5000. */
  cursorPromptTimeout: number;
  /** Fade Out the Cursor Prompt when closed. */
  fadeOutCursorPrompt: boolean;
  /** Indicates whether to show promptAtCursor by default. Defaults to false. */
  defaultPromptAtCursor: boolean;
}

/** Default properties of [[ToolAssistanceField]] component.
 * @internal
 */
export type ToolAssistanceFieldDefaultProps =
  Pick<ToolAssistanceFieldProps, "includePromptAtCursor" | "uiSettings" | "cursorPromptTimeout" | "fadeOutCursorPrompt" | "defaultPromptAtCursor">;

/** @internal */
interface ToolAssistanceFieldState {
  instructions: ToolAssistanceInstructions | undefined;
  toolIconSpec: string;
  showPromptAtCursor: boolean;
  includeMouseInstructions: boolean;
  includeTouchInstructions: boolean;
  showMouseTouchTabs: boolean;
  showMouseInstructions: boolean;
  showTouchInstructions: boolean;
  mouseTouchTabIndex: number;
  isPinned: boolean;
}

/** Tool Assistance Field React component.
 * @public
 */
export class ToolAssistanceField extends React.Component<ToolAssistanceFieldProps, ToolAssistanceFieldState> {
  /** @internal */
  public static override contextType = UiSettingsContext;
  /** @internal */
  public declare context: React.ContextType<typeof UiSettingsContext>;

  private static _toolAssistanceKey = "ToolAssistance";
  private static _showPromptAtCursorKey = "showPromptAtCursor";
  private static _mouseTouchTabIndexKey = "mouseTouchTabIndex";
  private _showPromptAtCursorSetting: UiSetting<boolean>;
  private _mouseTouchTabIndexSetting: UiSetting<number>;
  private _target: HTMLElement | null = null;
  private _className: string;
  private _indicator = React.createRef<HTMLDivElement>();
  private _cursorPrompt: CursorPrompt;
  private _isMounted = false;
  private _uiSettingsStorage: UiSettingsStorage;

  /** @internal */
  public static readonly defaultProps: ToolAssistanceFieldDefaultProps = {
    includePromptAtCursor: true,
    cursorPromptTimeout: 5000,
    fadeOutCursorPrompt: true,
    defaultPromptAtCursor: false,
  };

  /** @internal */
  constructor(p: ToolAssistanceFieldProps) {
    super(p);

    const instance = this.constructor;
    this._className = instance.name;

    const mobile = UiFramework.isMobile();

    this.state = {
      instructions: undefined,
      toolIconSpec: "",
      showPromptAtCursor: p.defaultPromptAtCursor,
      includeMouseInstructions: !mobile,
      includeTouchInstructions: true,
      showMouseTouchTabs: false,
      showMouseInstructions: false,
      showTouchInstructions: false,
      mouseTouchTabIndex: 0,
      isPinned: false,
    };

    this._uiSettingsStorage = new LocalSettingsStorage();
    this._cursorPrompt = new CursorPrompt(this.props.cursorPromptTimeout, this.props.fadeOutCursorPrompt);
    this._showPromptAtCursorSetting = new UiSetting(ToolAssistanceField._toolAssistanceKey, ToolAssistanceField._showPromptAtCursorKey,
      () => this.state.showPromptAtCursor);
    this._mouseTouchTabIndexSetting = new UiSetting(ToolAssistanceField._toolAssistanceKey, ToolAssistanceField._mouseTouchTabIndexKey,
      () => this.state.mouseTouchTabIndex);
  }

  /** @internal */
  public override async componentDidMount() {
    this._isMounted = true;
    MessageManager.onToolAssistanceChangedEvent.addListener(this._handleToolAssistanceChangedEvent);
    FrontstageManager.onToolIconChangedEvent.addListener(this._handleToolIconChangedEvent);

    // istanbul ignore else
    if (this.props.uiSettings)
      this._uiSettingsStorage = this.props.uiSettings;
    else if (this.context)
      this._uiSettingsStorage = this.context;

    await this.restoreSettings();
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
    MessageManager.onToolAssistanceChangedEvent.removeListener(this._handleToolAssistanceChangedEvent);
    FrontstageManager.onToolIconChangedEvent.removeListener(this._handleToolIconChangedEvent);
  }

  private async restoreSettings() {
    let getShowPromptAtCursor: Promise<UiSettingsResult> | undefined;
    // istanbul ignore else
    if (this.props.includePromptAtCursor) {
      getShowPromptAtCursor = this._showPromptAtCursorSetting.getSetting(this._uiSettingsStorage);
    }
    const getMouseTouchTabIndex = this._mouseTouchTabIndexSetting.getSetting(this._uiSettingsStorage);
    const [showPromptAtCursorResult, mouseTouchTabIndexResult] = await Promise.all([
      getShowPromptAtCursor,
      getMouseTouchTabIndex,
    ]);

    // istanbul ignore else
    if (showPromptAtCursorResult !== undefined && showPromptAtCursorResult.status === UiSettingsStatus.Success) {
      // istanbul ignore else
      if (this._isMounted)
        this.setState({ showPromptAtCursor: showPromptAtCursorResult.setting });
    }

    // istanbul ignore else
    if (mouseTouchTabIndexResult.status === UiSettingsStatus.Success) {
      // istanbul ignore else
      if (this._isMounted)
        this.setState({ mouseTouchTabIndex: mouseTouchTabIndexResult.setting });
    }
  }

  private _handleToolAssistanceChangedEvent = (args: ToolAssistanceChangedEventArgs): void => {
    let showMouseTouchTabs = false;
    let showMouseInstructions = false;
    let showTouchInstructions = false;

    if (args.instructions && args.instructions.sections) {
      const hasMouseInstructions = args.instructions.sections.some((section: ToolAssistanceSection) => {
        return section.instructions.some((instruction: ToolAssistanceInstruction) => this._isMouseInstruction(instruction));
      });
      const hasTouchInstructions = args.instructions.sections.some((section: ToolAssistanceSection) => {
        return section.instructions.some((instruction: ToolAssistanceInstruction) => this._isTouchInstruction(instruction));
      });

      if (this.state.includeMouseInstructions && this.state.includeTouchInstructions && hasMouseInstructions && hasTouchInstructions) {
        showMouseTouchTabs = true;
        showMouseInstructions = this.state.mouseTouchTabIndex === 0;
        showTouchInstructions = this.state.mouseTouchTabIndex === 1;
      } else {
        if (this.state.includeMouseInstructions && hasMouseInstructions)
          showMouseInstructions = true;
        else if (this.state.includeTouchInstructions && hasTouchInstructions)
          showTouchInstructions = true;
      }
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState(
        {
          instructions: args.instructions,
          showMouseTouchTabs,
          showMouseInstructions,
          showTouchInstructions,
        },
        () => {
          this._showCursorPrompt();
        },
      );
  };

  private _isBothInstruction = (instruction: ToolAssistanceInstruction) => {
    return instruction.inputMethod === undefined || instruction.inputMethod === ToolAssistanceInputMethod.Both;
  };

  private _isMouseInstruction = (instruction: ToolAssistanceInstruction) => instruction.inputMethod === ToolAssistanceInputMethod.Mouse;

  private _isTouchInstruction = (instruction: ToolAssistanceInstruction) => instruction.inputMethod === ToolAssistanceInputMethod.Touch;

  private _handleToolIconChangedEvent = (args: ToolIconChangedEventArgs): void => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState(
        { toolIconSpec: args.iconSpec },
        () => {
          this._showCursorPrompt();
        },
      );

  };

  private _showCursorPrompt() {
    if (this.state.showPromptAtCursor && this.state.instructions)
      this._cursorPrompt.display(this.state.toolIconSpec, this.state.instructions.mainInstruction);
  }

  private _sectionHasDisplayableInstructions(section: ToolAssistanceSection): boolean {
    const displayableInstructions = this._getDisplayableInstructions(section);
    return displayableInstructions.length > 0;
  }

  private _getDisplayableInstructions(section: ToolAssistanceSection): ToolAssistanceInstruction[] {
    const displayableInstructions = section.instructions.filter((instruction: ToolAssistanceInstruction) => {
      return (
        this._isBothInstruction(instruction)
        || (this.state.showMouseInstructions && this._isMouseInstruction(instruction))
        || (this.state.showTouchInstructions && this._isTouchInstruction(instruction))
      );
    });
    return displayableInstructions;
  }

  private _handleMouseTouchTab = async (index: number) => {
    const showMouseInstructions = index === 0;
    const showTouchInstructions = index === 1;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        mouseTouchTabIndex: index,
        showMouseInstructions,
        showTouchInstructions,
      }, async () => {
        await this._mouseTouchTabIndexSetting.saveSetting(this._uiSettingsStorage);
      });
  };

  /** @internal */
  public override render(): React.ReactNode {
    const { instructions } = this.state;
    const dialogTitle = (IModelApp.toolAdmin.activeTool) ? /* istanbul ignore next */ IModelApp.toolAdmin.activeTool.flyover : UiFramework.translate("toolAssistance.title");
    const mouseLabel = UiFramework.translate("toolAssistance.mouse");
    const touchLabel = UiFramework.translate("toolAssistance.touch");
    let prompt = "";
    let tooltip = "";
    let toolIcon: React.ReactNode;
    let dialogContent: React.ReactNode;

    if (instructions) {
      prompt = instructions.mainInstruction.text;
      toolIcon = <Icon iconSpec={this.state.toolIconSpec} />;

      let displayableSections: ToolAssistanceSection[] | undefined;
      if (instructions.sections) {
        displayableSections = instructions.sections.filter((section: ToolAssistanceSection) => this._sectionHasDisplayableInstructions(section));
      }

      dialogContent = (
        <div>
          {this.state.showMouseTouchTabs &&
            <HorizontalTabs className="uifw-toolAssistance-tabs" labels={[mouseLabel, touchLabel]} activeIndex={this.state.mouseTouchTabIndex} onClickLabel={this._handleMouseTouchTab} />
          }

          <div className="uifw-toolAssistance-content">
            <NZ_ToolAssistanceInstruction
              key="main"
              image={ToolAssistanceField.getInstructionImage(instructions.mainInstruction)}
              text={instructions.mainInstruction.text}
              isNew={instructions.mainInstruction.isNew} />

            {displayableSections && displayableSections.map((section: ToolAssistanceSection, index1: number) => {
              return (
                <React.Fragment key={index1.toString()}>
                  <ToolAssistanceSeparator key={index1.toString()}>{section.label}</ToolAssistanceSeparator>
                  {this._getDisplayableInstructions(section).map((instruction: ToolAssistanceInstruction, index2: number) => {
                    return (
                      <NZ_ToolAssistanceInstruction
                        key={`${index1.toString()}-${index2.toString()}`}
                        image={ToolAssistanceField.getInstructionImage(instruction)}
                        text={instruction.text}
                        isNew={instruction.isNew} />
                    );
                  })}
                </React.Fragment>
              );
            })}

            {this.props.includePromptAtCursor &&
              <>
                <ToolAssistanceSeparator key="prompt-sep" />
                <ToolAssistanceItem key="prompt-item">
                  <LabeledToggle
                    label={UiFramework.translate("toolAssistance.promptAtCursor")}
                    isOn={this.state.showPromptAtCursor} onChange={this._onPromptAtCursorChange} />
                </ToolAssistanceItem>
              </>
            }
          </div>
        </div>
      );
    }

    if (prompt)
      tooltip = prompt;

    // istanbul ignore next
    if (IModelApp.toolAdmin.activeTool)
      tooltip = `${IModelApp.toolAdmin.activeTool.flyover} > ${tooltip}  `;

    if (tooltip) {
      const lineBreak = "\u000d\u000a";
      tooltip = tooltip + lineBreak;
    }

    tooltip += UiFramework.translate("toolAssistance.moreInfo");

    return (
      <>
        <div ref={this._handleTargetRef}>
          <ToolAssistance
            icons={
              <>
                {toolIcon}
              </>
            }
            indicatorRef={this._indicator}
            className={classnames("uifw-statusFields-toolassistance", this.props.className)}
            style={this.props.style}
            isInFooterMode={this.props.isInFooterMode}
            onClick={this._handleToolAssistanceIndicatorClick}
            title={tooltip}
          >
            {this.props.isInFooterMode ? prompt : undefined}
          </ToolAssistance>
        </div>
        <FooterPopup
          isOpen={this.props.openWidget === this._className}
          onClose={this._handleClose}
          onOutsideClick={this._handleOutsideClick}
          target={this._target}
          isPinned={this.state.isPinned}
        >
          <ToolAssistanceDialog
            buttons={
              <>
                {!this.state.isPinned &&
                  <TitleBarButton onClick={this._handlePinButtonClick} title={UiFramework.translate("toolAssistance.pin")}>
                    <i className={"icon icon-pin"} />
                  </TitleBarButton>
                }
                {this.state.isPinned &&
                  <TitleBarButton onClick={this._handleCloseButtonClick} title={UiCore.translate("dialog.close")}>
                    <i className={"icon icon-close"} />
                  </TitleBarButton>
                }
              </>
            }
            title={dialogTitle}
          >
            {dialogContent}
          </ToolAssistanceDialog>
        </FooterPopup>
      </>
    );
  }

  private _handleTargetRef = (target: HTMLElement | null) => {
    this._target = target;
  };

  private _onPromptAtCursorChange = async (checked: boolean) => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        showPromptAtCursor: checked,
      }, async () => {
        await this._showPromptAtCursorSetting.saveSetting(this._uiSettingsStorage);
      });
  };

  private _handleClose = () => {
    this.setOpenWidget(null);
  };

  private _handleOutsideClick = (e: MouseEvent) => {
    if (this.state.isPinned)
      return;

    // istanbul ignore if
    if (!this._indicator.current ||
      !(e.target instanceof Node) ||
      this._indicator.current.contains(e.target))
      return;

    this._handleClose();
  };

  private _handleToolAssistanceIndicatorClick = () => {
    const isOpen = this.props.openWidget === this._className;
    if (isOpen) {
      this.setOpenWidget(null);
    } else
      this.setOpenWidget(this._className);
  };

  private _handlePinButtonClick = () => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState({ isPinned: true });
  };

  private _handleCloseButtonClick = () => {
    this._handleClose();
  };

  private setOpenWidget(openWidget: StatusBarFieldId) {
    // istanbul ignore else
    if (this.props.onOpenWidget)
      this.props.onOpenWidget(openWidget);

    if (!openWidget && this.state.isPinned) {
      // istanbul ignore else
      if (this._isMounted)
        this.setState({ isPinned: false });
    }
  }

  /** @internal */
  public static getInstructionImage(instruction: ToolAssistanceInstruction): React.ReactNode {
    let image: React.ReactNode;

    if ((typeof instruction.image === "string" || instruction.image !== ToolAssistanceImage.Keyboard) && instruction.keyboardInfo) {
      if (instruction.keyboardInfo.keys.length === 1 && !instruction.keyboardInfo.bottomKeys) {
        const key = instruction.keyboardInfo.keys[0];
        const rightImage = (typeof instruction.image === "string") ?
          <div className="uifw-toolassistance-icon-medium"><Icon iconSpec={instruction.image} /></div> :
          this.getInstructionSvgImage(instruction, true);

        image = (
          <FillCentered>
            {ToolAssistanceField.getKeyNode(key, 0, "uifw-toolassistance-key-modifier")}
            {rightImage}
          </FillCentered>
        );
      } else {
        Logger.logError(UiFramework.loggerCategory(this), `getInstructionImage: Invalid keyboardInfo provided with image`);
      }
    } else if (typeof instruction.image === "string") {
      if (instruction.image.length > 0) {
        const svgSource = IconSpecUtilities.getSvgSource(instruction.image);
        const className = (svgSource !== undefined) ? "uifw-toolassistance-svg" : "uifw-toolassistance-icon-large";
        image = <div className={className}><Icon iconSpec={instruction.image} /></div>;
      }
    } else if (instruction.image === ToolAssistanceImage.Keyboard) {
      if (instruction.keyboardInfo) {
        image = ToolAssistanceField.getInstructionKeyboardImage(instruction.keyboardInfo);
      } else {
        Logger.logError(UiFramework.loggerCategory(this), `getInstructionImage: ToolAssistanceImage.Keyboard specified but no keyboardInfo provided`);
      }
    } else {
      image = this.getInstructionSvgImage(instruction, false);
    }

    return image;
  }

  private static getInstructionSvgImage(instruction: ToolAssistanceInstruction, mediumSize: boolean): React.ReactNode {
    let image: React.ReactNode;
    let className = mediumSize ? "uifw-toolassistance-svg-medium" : "uifw-toolassistance-svg";

    // istanbul ignore else
    if (typeof instruction.image !== "string" && instruction.image !== ToolAssistanceImage.Keyboard) {
      const toolAssistanceImage: ToolAssistanceImage = instruction.image;
      let svgImage = "";

      switch (toolAssistanceImage) {
        case ToolAssistanceImage.AcceptPoint:
          svgImage = acceptPointIcon;
          break;
        case ToolAssistanceImage.CursorClick:
          svgImage = cursorClickIcon;
          break;
        case ToolAssistanceImage.LeftClick:
          svgImage = clickLeftIcon;
          break;
        case ToolAssistanceImage.RightClick:
          svgImage = clickRightIcon;
          break;
        case ToolAssistanceImage.MouseWheel:
          svgImage = mouseWheelClickIcon;
          break;
        case ToolAssistanceImage.LeftClickDrag:
          svgImage = clickLeftDragIcon;
          className = mediumSize ? "uifw-toolassistance-svg-medium-wide" : "uifw-toolassistance-svg-wide";
          break;
        case ToolAssistanceImage.RightClickDrag:
          svgImage = clickRightDragIcon;
          className = mediumSize ? "uifw-toolassistance-svg-medium-wide" : "uifw-toolassistance-svg-wide";
          break;
        case ToolAssistanceImage.MouseWheelClickDrag:
          svgImage = clickMouseWheelDragIcon;
          className = mediumSize ? "uifw-toolassistance-svg-medium-wide" : "uifw-toolassistance-svg-wide";
          break;
        case ToolAssistanceImage.OneTouchTap:
          svgImage = oneTouchTapIcon;
          break;
        case ToolAssistanceImage.OneTouchDoubleTap:
          svgImage = oneTouchDoubleTapIcon;
          break;
        case ToolAssistanceImage.OneTouchDrag:
          svgImage = oneTouchDragIcon;
          break;
        case ToolAssistanceImage.TwoTouchTap:
          svgImage = twoTouchTapIcon;
          break;
        case ToolAssistanceImage.TwoTouchDrag:
          svgImage = twoTouchDragIcon;
          break;
        case ToolAssistanceImage.TwoTouchPinch:
          svgImage = twoTouchPinchIcon;
          break;
        case ToolAssistanceImage.TouchCursorTap:
          svgImage = touchCursorTapIcon;
          break;
        case ToolAssistanceImage.TouchCursorDrag:
          svgImage = touchCursorDragIcon;
          className = mediumSize ? /* istanbul ignore next */ "uifw-toolassistance-svg-medium-wide" : "uifw-toolassistance-svg-wide";
          break;
      }

      image = (
        <div className={className}>
          {svgImage &&
            // istanbul ignore next
            <SvgSprite src={svgImage} />
          }
        </div>
      );
    }

    return image;
  }

  private static getInstructionKeyboardImage(keyboardInfo: ToolAssistanceKeyboardInfo): React.ReactNode {
    let image: React.ReactNode;

    if (keyboardInfo.bottomKeys !== undefined) {
      image = (
        <div className="uifw-toolassistance-key-group">
          <span className="row1">
            {keyboardInfo.keys.map((key: string, index1: number) => {
              return ToolAssistanceField.getKeyNode(key, index1, "uifw-toolassistance-key-small");
            })}
          </span>
          <br />
          <span className="row2">
            {keyboardInfo.bottomKeys.map((key: string, index2: number) => {
              return ToolAssistanceField.getKeyNode(key, index2, "uifw-toolassistance-key-small");
            })}
          </span>
        </div>
      );
    } else if (keyboardInfo.keys.length === 2) {
      image = (
        <FillCentered>
          {keyboardInfo.keys.map((key: string, index3: number) => {
            let className = "uifw-toolassistance-key-medium";
            if (key.length > 1)
              className = "uifw-toolassistance-key-modifier";
            return ToolAssistanceField.getKeyNode(key, index3, className);
          })}
        </FillCentered>
      );
    } else if (keyboardInfo.keys[0]) {
      if (keyboardInfo.keys[0].length > 1)
        image = ToolAssistanceField.getKeyNode(keyboardInfo.keys[0], 0, "uifw-toolassistance-key-large");
      else
        image = ToolAssistanceField.getKeyNode(keyboardInfo.keys[0], 0);
    } else {
      Logger.logError(UiFramework.loggerCategory(this), `ToolAssistanceImage.Keyboard specified but ToolAssistanceKeyboardInfo not valid`);
    }

    return image;
  }

  private static getKeyNode(key: string, index: number, className?: string): React.ReactNode {
    return (
      <div key={index.toString()} className={classnames("uifw-toolassistance-key", className)}>
        <FillCentered>{key}</FillCentered>
      </div>
    );
  }
}
