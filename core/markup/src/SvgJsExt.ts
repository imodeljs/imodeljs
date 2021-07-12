/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MarkupApp
 */

import { Transform } from "@bentley/geometry-core";
import { Box, extend, G, Element as MarkupElement, Matrix, nodeOrNew, Rect, register, Svg, Text } from "@svgdotjs/svg.js";
import { MarkupApp } from "./Markup";

// cspell:ignore lmultiply matrixify dmove

/** @public */
export interface MarkupColor {
  fill: any;
  stroke: any;
}

/** Add methods and classes to svg.js library for Markup.
 * @public
 */
declare module "@svgdotjs/svg.js" {
  function register(subclass: typeof MarkupElement, name?: string): void; // eslint-disable-line @typescript-eslint/no-shadow
  function nodeOrNew(name: string, node: any): any; // eslint-disable-line @typescript-eslint/no-shadow

  interface Dom {
    css(val: object): this;
  }
  /** @public */
  interface Element {
    inSelection?: boolean;
    originalEl?: Element;

    /** make a copy of this Element, set its `isMarkup` flag, and reset its color if it was hilited. */
    cloneMarkup(): this;
    /** if this element is currently hilited or flashed, reset to its original color */
    resetColor(): void;
    /** override the color of this element to a new color, saving original */
    overrideColor(color: string): void;
    /** turn on `inSelection` and set its color to hilite */
    hilite(): void;
    /** turn off hilite, turn off `inSelection` flag */
    unHilite(): void;
    /** set this element to the flash color */
    flash(): void;
    /** turn off flash color */
    unFlash(): void;
    /** reposition and resize this element */
    markupStretch(x: number, y: number, w: number, h: number, mtx: Matrix): void;
    /** return true if this element is a child of the supplied Svg. */
    isChildOf(svg: Svg): boolean;
    /** return selectable element or the outermost group containing this element if it's a child of the supplied Svg. */
    getChildOrGroupOf(svg: G): MarkupElement | undefined;

    /** @internal */
    forElementsOfGroup(fn: (child: MarkupElement) => void): void;
    /** @internal */
    getNpcToVp(): Matrix;
    /** @internal */
    getOutline(expand?: number): Rect;
  }
  /** @public */
  interface Text {
    getMarkup(): string;
    createMarkup(val: string, spacing: number): void;
    getFontSize(): number;
  }

  /** @public */
  interface Matrix {
    /** convert this SVG.Matrix into an iModel Transform */
    toIModelTransform(): Transform;
    fromIModelTransform(t: Transform): this;
  }

  /** @internal */
  interface Container {
    foreignObject(width: number, height: number): ForeignObject;
  }
  class ForeignObject extends Container {
  }
}

const OLDCOLOR = "Color";

/** this is the SVG.js way of adding methods to classes */
extend(MarkupElement, {
  forElementsOfGroup(fn: (child: MarkupElement) => void): void {
    const me = this as MarkupElement;
    if (me instanceof G)
      me.each((i, children) => { const child = children[i]; if (child instanceof MarkupElement) fn(child); }, false);
  },
  cloneMarkup(): MarkupElement {
    const me = this as MarkupElement;
    const cloned = me.clone();
    cloned.node.removeAttribute("id");
    cloned.resetColor();
    return cloned;
  },
  overrideColor(color: string) {
    const me = this as MarkupElement;
    me.forElementsOfGroup((child) => child.overrideColor(color)); // Do children first, getComputedStyle will inherit from group for unspecified values...
    let oldColor = me.data(OLDCOLOR) as MarkupColor | undefined;
    if (undefined === oldColor) {
      const css = window.getComputedStyle(me.node);
      const colorOrNone = (c: string | null) => (c && c !== "none") ? c : "none";
      oldColor = { fill: colorOrNone(css.fill), stroke: colorOrNone(css.stroke) };
      me.data(OLDCOLOR, oldColor);
    }
    const toColor = (val: string | null) => (!val || val === "none") ? "none" : color;
    me.css({ fill: toColor(oldColor.fill), stroke: toColor(oldColor.stroke) });
  },
  resetColor() {
    const me = this as MarkupElement;
    const oldColor = me.data(OLDCOLOR) as MarkupColor;
    if (undefined !== oldColor)
      me.css(oldColor).data(OLDCOLOR, null); // change to old color and remove data object
    me.forElementsOfGroup((child) => child.resetColor());
  },
  hilite() { const me = this as MarkupElement; if (!me.inSelection) { me.overrideColor(MarkupApp.props.hilite.color); me.inSelection = true; } },
  unHilite() { const me = this as MarkupElement; if (me.inSelection) { me.resetColor(); me.inSelection = undefined; } },
  flash() { const me = this as MarkupElement; if (!me.inSelection) me.overrideColor(MarkupApp.props.hilite.flash); },
  unFlash() { const me = this as MarkupElement; if (!me.inSelection) me.resetColor(); },
  markupStretch(w: number, h: number, x: number, y: number, _mtx: Matrix) { const me = this as MarkupElement; me.size(w, h).move(x, y); },
  isChildOf(svg: Svg) {
    const parent = (this as MarkupElement).parent();
    return (parent === svg) ? true : (parent instanceof MarkupElement) ? parent.isChildOf(svg) : false;
  },
  getChildOrGroupOf(svg: G): MarkupElement | undefined {
    const me = this as MarkupElement;
    const parents = me.parents(svg.parent());
    if (0 === parents.length || parents[parents.length - 1].node !== svg.node)
      return undefined;
    if (parents.length > 1) {
      for (let index = parents.length - 2; index >= 0; --index)
        if (parents[index] instanceof G || parents[index] instanceof Text)
          return parents[index];
    }
    return me;
  },
  getNpcToVp(): Matrix {
    const me = this as MarkupElement;
    const bb = me.bbox();
    return new Matrix().scaleO(bb.w, bb.h).translateO(bb.x, bb.y).lmultiplyO(me.matrixify());
  },
  getOutline(expand?: number): Rect {
    const me = this as MarkupElement;
    const box = me.bbox();
    if (expand === undefined) expand = 0;
    return new Rect().move(box.x - expand, box.y - expand).size(box.w + (expand * 2), box.h + (expand * 2)).transform(me.matrixify());
  },
});

extend(G, {
  markupStretch(_w: number, _h: number, _x: number, _y: number, mtx: Matrix) { (this as G).attr("transform", mtx); },
});
extend(Text, {
  getFontSize(): number { const me = this as Text; return parseFloat(window.getComputedStyle(me.node).fontSize); },
  markupStretch(_w: number, _h: number, _x: number, _y: number, mtx: Matrix) { (this as Text).attr("transform", mtx); },
  getMarkup() {
    const node = (this as Text).node;
    let text = "";
    node.childNodes.forEach((child) => {
      if (child.nodeName === "tspan" || child.nodeName === "#text") {
        if (text.length !== 0) text += "\n";
        text += child.textContent;
      }
    });
    return text;
  },
  createMarkup(val: string, spacing: number) {
    spacing = spacing ? spacing : 1;
    const me = this as Text;
    me.clear();
    if (val === "")
      return;
    const lines = val.split("\n");
    me.plain(lines[0]);
    const x = me.attr("x");
    me.build(true);
    for (let i = 1; i < lines.length; ++i) {
      const tspan = me.tspan(lines[i]);
      tspan.dy(spacing);
      tspan.x(x);
    }
    me.build(false);
    me.dom = {};
  },
  // override for Text so that empty text will return a size
  getOutline(expand?: number): Rect {
    const me = this as Text;
    const node = me.node;
    const content = node.textContent;
    if (content !== null && content.length > 0)
      return MarkupElement.prototype.getOutline.call(me, expand);
    node.textContent = "M";
    const outline = MarkupElement.prototype.getOutline.call(me, expand);
    node.textContent = content;
    return outline;
  },
  writeDataToDom() {
    const me = this as Text;
    const dom = me.dom; // strip off useless "leading" data
    me.dom = {};
    MarkupElement.prototype.writeDataToDom.call(me);
    me.dom = dom;
    return me;
  },
});

extend(Matrix, {
  toIModelTransform() {
    const m = this as Matrix;
    return Transform.createRowValues(m.a, m.c, 0, m.e, m.b, m.d, 0, m.f, 0, 0, 1, 0);
  },
  fromIModelTransform(t: Transform) {
    const m = this as Matrix;
    const o = t.origin;
    const mtx = t.matrix;
    m.a = mtx.coffs[0];
    m.b = mtx.coffs[3];
    m.c = mtx.coffs[1];
    m.d = mtx.coffs[4];
    m.e = o.x;
    m.f = o.y;
    return this;
  },
});

/** Dummy class so a <title> inside a <g> will work.
 * @internal
 */
export class Title extends MarkupElement {
  constructor(node: any) { super(nodeOrNew("title", node)); }
  public override scale() { return this; }
  public override size() { return this; }
  public override move() { return this; }
  public override dmove() { return this; }
  public override bbox() { return new Box(); }
  public override screenCTM() { return new Matrix(); }

}
register(Title, "Title");

/** only for tests
 *  @internal
 */
export function initSvgExt() { }
