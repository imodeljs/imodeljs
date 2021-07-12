/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { XAndY } from "@bentley/geometry-core";
import {
  IModelApp, MessageBoxIconType, MessageBoxType, MessageBoxValue, NotificationManager, NotifyMessageDetails, ToolTipOptions,
} from "@bentley/imodeljs-frontend";
import { Surface } from "./Surface";
import { showError, showStatus } from "./Utils";
import { Window, WindowProps } from "./Window";

// cspell:ignore messagebox messageboxtext messageboxbutton

export interface NotificationsWindowProps extends WindowProps {
  maxStoredMessages: number;
}

export class NotificationsWindow extends Window {
  private readonly _maxMessages: number;

  public override get isCloseable() { return false; }
  public get windowId() { return "notifications"; }

  public constructor(surface: Surface, props: NotificationsWindowProps) {
    super(surface, props);
    this._maxMessages = props.maxStoredMessages;
    this.contentDiv.id = "notifications-window";
    surface.element.appendChild(this.container);
  }

  public addMessage(message: NotifyMessageDetails): void {
    const toHtml = (msg: HTMLElement | string) => {
      return ("string" !== typeof msg) ? msg : IModelApp.makeHTMLElement("div", { innerText: msg });
    };

    const msgDiv = IModelApp.makeHTMLElement("div", { parent: this.contentDiv });
    msgDiv.appendChild(toHtml(message.briefMessage));
    if (undefined !== message.detailedMessage)
      msgDiv.appendChild(toHtml(message.detailedMessage));

    IModelApp.makeHTMLElement("hr", { parent: msgDiv });

    while (this.contentDiv.childElementCount > this._maxMessages)
      this.contentDiv.removeChild(this.contentDiv.firstChild!);

    this.contentDiv.scrollTop = this.contentDiv.scrollHeight;
  }
}

export class Notifications extends NotificationManager {
  private _tooltipDiv?: HTMLDivElement;

  public override outputPrompt(prompt: string) { showStatus(prompt); }

  /** Output a message and/or alert to the user. */
  public override outputMessage(message: NotifyMessageDetails) {
    showError(message.briefMessage);
    Surface.instance.notifications.addMessage(message);
  }

  public override async openMessageBox(_mbType: MessageBoxType, message: HTMLElement | string, _icon: MessageBoxIconType): Promise<MessageBoxValue> {
    const rootDiv = document.getElementById("root") as HTMLDivElement;
    if (!rootDiv)
      return MessageBoxValue.Cancel;

    // create a dialog element.
    const dialog = IModelApp.makeHTMLElement("dialog", { parent: rootDiv, className: "notification-messagebox" });

    // set up the message
    const span = IModelApp.makeHTMLElement("span", { parent: dialog, className: "notification-messageboxtext" });
    if (typeof message === "string")
      span.innerHTML = message;
    else
      span.appendChild(message);

    // make the ok button
    const button = IModelApp.makeHTMLElement("button", { parent: dialog, className: "notification-messageboxbutton" });
    button.innerHTML = "Ok";

    const promise = new Promise<MessageBoxValue>((resolve, _rej) => {
      button.addEventListener("click", () => {
        dialog.close();
        rootDiv.removeChild(dialog);
        resolve(MessageBoxValue.Ok);
      });
    });

    // add the dialog to the root div element and show it.
    dialog.showModal();
    return promise;
  }

  public override get isToolTipSupported() { return true; }
  public override get isToolTipOpen() {
    return undefined !== this._tooltipDiv;
  }

  public override clearToolTip(): void {
    if (undefined !== this._tooltipDiv) {
      this._tooltipDiv.remove();
      this._tooltipDiv = undefined;
    }
  }

  protected override _showToolTip(parent: HTMLElement, message: HTMLElement | string, pt?: XAndY, _options?: ToolTipOptions): void {
    this.clearToolTip();

    if (undefined === pt) {
      const rect = parent.getBoundingClientRect();
      pt = { x: rect.width / 2, y: rect.height / 2 };
    }

    const div = IModelApp.makeHTMLElement("div", { parent, className: "tooltip" });
    div.style.position = "absolute";
    div.style.top = `${pt.y - 20}px`;
    div.style.left = `${pt.x + 15}px`;

    if (message instanceof HTMLElement)
      div.appendChild(message);
    else
      div.innerText = message;

    this._tooltipDiv = div;
  }
}
