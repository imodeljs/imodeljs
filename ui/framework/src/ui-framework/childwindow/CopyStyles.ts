/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/**
 * Copies the source CSS into the destination
 * @param targetDoc - target document
 * @param sourceDoc - source document
 * @internal
 */
export function copyStyles(targetDoc: Document, sourceDoc: Document = document) {
  const stylesheets = Array.from(sourceDoc.styleSheets);
  stylesheets.forEach((stylesheet) => {
    const css = stylesheet;
    // istanbul ignore if
    if (stylesheet.href) {
      const newStyleElement = targetDoc.createElement("link");
      newStyleElement.rel = "stylesheet";
      newStyleElement.href = stylesheet.href;
      targetDoc.head.appendChild(newStyleElement);
    } else {
      // istanbul ignore else
      if (css && css.cssRules && css.cssRules.length > 0) {
        const newStyleElement = targetDoc.createElement("style");
        Array.from(css.cssRules).forEach((rule) => {
          newStyleElement.appendChild(targetDoc.createTextNode(rule.cssText));
        });
        targetDoc.head.appendChild(newStyleElement);
      }
    }
  });

  // copy sprites
  const svgSymbolParent = sourceDoc.getElementById("__SVG_SPRITE_NODE__");
  // istanbul ignore else
  if (svgSymbolParent) {
    targetDoc.body.appendChild(svgSymbolParent.cloneNode(true));
  }
}
