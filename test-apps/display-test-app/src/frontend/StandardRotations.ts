/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IModelApp, Viewport } from "@bentley/imodeljs-frontend";
import { createToolButton, ToolBarDropDown } from "./ToolBar";

const entries = [
  "\ue916", // top
  "\ue910", // bottom
  "\ue914", // left
  "\ue915", // right
  "\ue911", // front
  "\ue90f", // back
  "\ue912", // isoLeft
  "\ue913", // isoRight
];

export class StandardRotations extends ToolBarDropDown {
  private readonly _element: HTMLElement;
  private readonly _parent: HTMLElement;
  private readonly _vp: Viewport;

  public constructor(parent: HTMLElement, vp: Viewport) {
    super();
    this._parent = parent;
    this._vp = vp;
    this._element = document.createElement("div");
    this._element.className = "toolMenu";
    this._element.style.display = "block";

    // 2 rows of 4 buttons.
    let div = document.createElement("div");
    div.style.display = "flex";
    this._element.appendChild(div);
    for (let i = 0; i < entries.length; i++) {
      if (4 === i) {
        div = document.createElement("div");
        div.style.display = "flex";
        this._element.appendChild(div);
      }

      div.appendChild(createToolButton({
        iconUnicode: entries[i],
        click: () => IModelApp.tools.run("View.Standard", IModelApp.viewManager.selectedView, i),
      }));
    }

    parent.appendChild(this._element);
  }

  public get isOpen() { return "none" !== this._element.style.display; }
  protected _open() { this._element.style.display = "block"; }
  protected _close() { this._element.style.display = "none"; }

  public override get onViewChanged(): Promise<void> {
    this._parent.style.display = this._vp.view.allow3dManipulations() ? "block" : "none";
    return Promise.resolve();
  }
}
