/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  XAndY,
} from "@bentley/geometry-core";
import {
  AbstractToolbarProps,
  ActionButton,
  CommonToolbarItem,
  OnCancelFunc,
  OnItemExecutedFunc,
  RelativePosition,
  UiAdmin,
} from "@bentley/ui-abstract";
import {
  IModelApp,
} from "@bentley/imodeljs-frontend";
import {
  Window,
  WindowProps,
} from "./Window";
import { Surface } from "./Surface";

interface ToolbarWindowProps extends WindowProps {
  items: CommonToolbarItem[];
  onItemExecuted: OnItemExecutedFunc;
}

class ToolbarWindow extends Window {
  public override get isCloseable() { return false; }
  public get windowId() { return "toolbar"; }

  public constructor(surface: Surface, props: ToolbarWindowProps) {
    super(surface, props);
    surface.element.appendChild(this.container);
    this.setHeaderVisible(false);

    const content = IModelApp.makeHTMLElement("div", { className: "popup-toolbar" });
    const items = [...props.items];
    items.sort((a, b) => a.itemPriority - b.itemPriority);

    for (const item of items) {
      const button = item as ActionButton;
      if (undefined === button.execute || true === item.isHidden)
        continue; // GroupButton, CustomButtonDefinition...

      const span = IModelApp.makeHTMLElement("span", { className: "icon" });
      span.style.fontSize = "35px";
      if (typeof item.icon === "string")
        span.classList.add(item.icon);

      const div = IModelApp.makeHTMLElement("div", { className: "popup-toolbar-button" });
      if (typeof item.label === "string")
        div.title = item.label;

      if (true === item.isDisabled)
        div.style.opacity = "50%";

      div.addEventListener("click", (_) => {
        button.execute();
        props.onItemExecuted(item);
      });

      div.appendChild(span);
      content.appendChild(div);
    }

    this.contentDiv.appendChild(content);

    const w = content.clientWidth + 2;
    const h = content.clientHeight;
    this._header.resizeContent(w, h);
  }
}

export class UiManager extends UiAdmin {
  public override get cursorPosition(): XAndY {
    return super.cursorPosition;
  }

  public override showToolbar(tbProps: AbstractToolbarProps, location: XAndY, offset: XAndY, onItemExecuted: OnItemExecutedFunc, _onCancel: OnCancelFunc, _relPos?: RelativePosition, _elem?: HTMLElement): boolean {
    const surface = Surface.instance;
    if (undefined !== surface.findWindowById("toolbar"))
      return false;

    const props = {
      onItemExecuted,
      items: tbProps.items,
      title: "Toolbar",
      top: location.y + offset.y,
      left: location.x + offset.x,
      width: 456,
      height: 123,
    };

    const win = new ToolbarWindow(surface, props);
    surface.addWindow(win);
    surface.togglePin(win);
    return true;
  }

  public override hideToolbar(): boolean {
    const window = Surface.instance.findWindowById("toolbar");
    if (undefined === window)
      return false;

    Surface.instance.forceClose(window);
    return true;
  }
}
