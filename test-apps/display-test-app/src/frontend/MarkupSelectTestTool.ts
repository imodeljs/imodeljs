/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { EventHandled, IModelApp } from "@bentley/imodeljs-frontend";
import { SelectTool } from "@bentley/imodeljs-markup";

async function getSvgFile(uri: string): Promise<string> {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", uri);
  const loaded = new Promise((resolve) => xhr.addEventListener("load", resolve));
  xhr.send();
  await loaded;
  return xhr.responseText;
}

export class MarkupSelectTestTool extends SelectTool {
  public static override toolId = "Markup.TestSelect";
  public override async onKeyTransition(wentDown: boolean, key: KeyboardEvent): Promise<EventHandled> {
    if (EventHandled.Yes === await super.onKeyTransition(wentDown, key))
      return EventHandled.Yes;
    if (!wentDown)
      return EventHandled.No;
    const tools = IModelApp.tools;
    switch (key.key.toLowerCase()) {
      case "a":
        tools.run("Markup.Arrow");
        return EventHandled.Yes;
      case "c":
        tools.run("Markup.Circle");
        return EventHandled.Yes;
      case "d":
        tools.run("Markup.Distance");
        return EventHandled.Yes;
      case "e":
        tools.run("Markup.Ellipse");
        return EventHandled.Yes;
      case "l":
        tools.run("Markup.Line");
        return EventHandled.Yes;
      case "o":
        tools.run("Markup.Cloud");
        return EventHandled.Yes;
      case "p":
        tools.run("Markup.Polygon");
        return EventHandled.Yes;
      case "r":
        tools.run("Markup.Rectangle");
        return EventHandled.Yes;
      case "s":
        tools.run("Markup.Sketch");
        return EventHandled.Yes;
      case "t":
        tools.run("Markup.Text.Place");
        return EventHandled.Yes;
      case "1":
        const symbol1 = await getSvgFile("Warning_sign.svg");
        if (undefined === symbol1)
          return EventHandled.No;
        tools.run("Markup.Symbol", symbol1);
        return EventHandled.Yes;
      case "2":
        const symbol2 = await getSvgFile("window-area.svg");
        if (undefined === symbol2)
          return EventHandled.No;
        tools.run("Markup.Symbol", symbol2, true);
        return EventHandled.Yes;
    }
    return EventHandled.No;
  }
}
