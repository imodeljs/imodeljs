/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MarkupApp
 */

import { Logger } from "@bentley/bentleyjs-core";
import { Point3d, XAndY } from "@bentley/geometry-core";
import { ImageSource, ImageSourceFormat } from "@bentley/imodeljs-common";
import { FrontendLoggerCategory, imageElementFromImageSource, IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { I18NNamespace } from "@bentley/imodeljs-i18n";
import { adopt, create, G, Matrix, Point, Svg, SVG } from "@svgdotjs/svg.js";
import * as redlineTool from "./RedlineTool";
import { MarkupSelected, SelectTool } from "./SelectTool";
import * as textTool from "./TextEdit";
import { UndoManager } from "./Undo";

// cspell:ignore blanchedalmond, lmultiply, svgs

/** The width and height of a Markup image, in pixels.
 * @public */
export interface WidthAndHeight {
  width: number;
  height: number;
}

/** The size and SVG string for a Markup
 * @public
 */
export interface MarkupSvgData {
  /** The size of the image, in pixels. This also indicates the aspect ratio of the SVG data. */
  rect: WidthAndHeight;
  /** a string holding the svg data for the markup. Will be undefined if [[MarkupApp.stop]] is called without an active Markup */
  svg?: string;
}

/** Markup data returned by [[MarkupApp.stop]]
 * @public
 */
export interface MarkupData extends MarkupSvgData {
  /** a base64 encoded string with the image of the view that was marked up. See [[MarkupApp.props.result]] for options. */
  image?: string;
}

/**
 * The main object for the Markup package. It is a singleton that stores the state of the Markup application.
 * It has only static members and methods. Applications may customize and control the behavior of the Markup by
 * setting members of [[MarkupApp.props]]. When [[MarkupApp.start]] is first called, it registers a set of "Markup.xxx"
 * tools that may be invoked from UI controls.
 * @public
 */
export class MarkupApp {
  /** the current Markup being created */
  public static markup?: Markup;
  /** The namespace for the Markup tools */
  public static namespace: I18NNamespace;
  /** By setting members of this object, applications can control the appearance and behavior of various parts of MarkupApp. */
  public static props = {
    /** the UI controls displayed on Elements by the Select Tool to allow users to modify them. */
    handles: {
      /** The diameter of the circles for the handles. */
      size: 10,
      /** The attributes of the stretch handles */
      stretch: { "fill-opacity": .85, "stroke": "black", "fill": "white" },
      /** The attributes of the line that connects the top-center stretch handle to the rotate handle. */
      rotateLine: { "stroke": "grey", "fill-opacity": .85 },
      /** The attributes of the rotate handle. */
      rotate: { "cursor": "url(Markup/rotate.png) 12 12, auto", "fill-opacity": .85, "stroke": "black", "fill": "lightBlue" },
      /** The attributes of box around the element. */
      moveOutline: { "cursor": "move", "stroke-dasharray": "6,6", "fill": "none", "stroke-opacity": .85, "stroke": "white" },
      /** The attributes of box that provides the move cursor. */
      move: { "cursor": "move", "opacity": 0, "stroke-width": 10, "stroke": "white" },
      /** The attributes of handles on the vertices of lines. */
      vertex: { "cursor": "url(cursors/crosshair.cur), crosshair", "fill-opacity": .85, "stroke": "black", "fill": "white" },
    },
    /** properties for providing feedback about selected elements. */
    hilite: {
      /** the color of selected elements */
      color: "magenta",
      /** the color of an element as the cursor passes over it */
      flash: "cyan",
    },
    /** optionally, show a drop-shadow behind all markup elements. */
    dropShadow: {
      /** if false, no drop shadow */
      enable: true,
      /** the attributes of the drop shadow. See https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow */
      attr: {
        "stdDeviation": 2,
        "dx": 1.2,
        "dy": 1.4,
        "flood-color": "#1B3838",
      },
    },
    /** The "active placement" parameters. New elements are created with these parameters, so UI controls should set them. */
    active: {
      /** the CSS style properties of new text elements. */
      text: {
        "font-family": "sans-serif",
        "font-size": "30px",
        "stroke": "none",
        "fill": "red",
      },
      /** the CSS style properties of new elements. */
      element: {
        "stroke": "red",
        "stroke-opacity": 0.8,
        "stroke-width": 3,
        "stroke-dasharray": 0,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "fill": "blue",
        "fill-opacity": 0.2,
      },
      arrow: {
        length: 7,
        width: 6,
      },
      cloud: {
        path: "M3.0,2.5 C3.9,.78 5.6,-.4 8.1,1.0 C9.1,0 11.3,-.2 12.5,.5 C14.2,-.5 17,.16 17.9,2.5 C21,3 20.2,7.3 17.6,7.5 C16.5,9.2 14.4,9.8 12.7,8.9 C11.6,10 9.5,10.3 8.1,9.4 C5.7,10.8 3.3,9.4 2.6,7.5 C-.9,7.7 .6,1.7 3.0,2.5z",
      },
    },
    /** Values for placing and editing Text. */
    text: {
      /** A default string for the Markup.Text.Place command. Applications can turn this off, or supply the user's initials, for example. */
      startValue: "Note: ",
      /** Parameters for the size and appearance of the text editor */
      edit: {
        background: "blanchedalmond",
        /** Starting size, will be updated if user stretches the box */
        size: { width: "25%", height: "4em" },
        /** font size of the text editor */
        fontSize: "14pt",
        /** A background box drawn around text so user can tell what's being selected */
        textBox: { "fill": "lightGrey", "fill-opacity": .1, "stroke-opacity": .85, "stroke": "lightBlue" },
      },
    },
    /** Used to draw the border outline around the view while it is being marked up so the user can tell Markup is active */
    borderOutline: {
      "stroke": "gold",
      "stroke-width": 6,
      "stroke-opacity": 0.4,
      "fill": "none",
    },
    /** Used to draw the border corner symbols for the view while it is being marked up so the user can tell Markup is active */
    borderCorners: {
      "stroke": "black",
      "stroke-width": 2,
      "stroke-opacity": 0.2,
      "fill": "gold",
      "fill-opacity": 0.2,
    },
    /** Determines what is returned by MarkupApp.stop */
    result: {
      /** The format for the image data. */
      imageFormat: "image/png",
      /** If true, the markup graphics will be imprinted in the returned image. */
      imprintSvgOnImage: true,
      /** the maximum width for the returned image. If the source view width is larger than this, it will be scaled down to this size. */
      maxWidth: 2048,
    },
  };

  private static _saveDefaultToolId = "";
  /** @internal */
  public static screenToVbMtx(): Matrix {
    const matrix = this.markup?.svgMarkup?.screenCTM().inverse();
    return (undefined !== matrix ? matrix : new Matrix());
  }
  /** @internal */
  public static getVpToScreenMtx(): Matrix { const rect = this.markup!.markupDiv.getBoundingClientRect(); return (new Matrix()).translateO(rect.left, rect.top); }
  /** @internal */
  public static getVpToVbMtx(): Matrix { return this.getVpToScreenMtx().lmultiplyO(this.screenToVbMtx()); }
  /** @internal */
  public static convertVpToVb(pt: XAndY): Point3d {
    const pt0 = new Point(pt.x, pt.y);
    pt0.transformO(this.getVpToVbMtx());
    return new Point3d(pt0.x, pt0.y, 0);
  }

  /** determine whether there's a markup session currently active */
  public static get isActive() { return undefined !== this.markup; }
  public static markupSelectToolId = "Markup.Select";

  protected static createMarkup(view: ScreenViewport, markupData?: MarkupSvgData) { return new Markup(view, markupData); }

  protected static lockViewportSize(view: ScreenViewport, markupData?: MarkupSvgData) {
    const parentDiv = view.vpDiv;
    const rect = parentDiv.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    if (markupData) {
      const aspect = markupData.rect.height / markupData.rect.width;
      if ((width * aspect) > height)
        width = Math.floor(height / aspect);
      else
        height = Math.floor(width * aspect);
    }
    const style = parentDiv.style;
    style.width = `${width}px`;
    style.height = `${height}px`;
  }

  /** @internal */
  public static getActionName(action: string) { return IModelApp.i18n.translate(`${this.namespace.name}:actions.${action}`); }

  /** Start a markup session */
  public static async start(view: ScreenViewport, markupData?: MarkupSvgData): Promise<void> {
    if (this.markup)
      return; // a markup session is already active.

    await this.initialize();

    // first, lock the viewport to its current size while the markup session is running
    this.lockViewportSize(view, markupData);

    this.markup = this.createMarkup(view, markupData); // start a markup against the provided view.
    if (!this.markup.svgMarkup) {
      ScreenViewport.setToParentSize(this.markup.vp.vpDiv);
      this.markup.markupDiv.remove();
      return;
    }

    IModelApp.toolAdmin.markupView = view; // so viewing tools won't operate on the view.

    // set the markup Select tool as the default tool and start it, saving current default tool
    this._saveDefaultToolId = IModelApp.toolAdmin.defaultToolId;
    IModelApp.toolAdmin.defaultToolId = this.markupSelectToolId;
    IModelApp.toolAdmin.startDefaultTool();
  }

  /** Read the result of a Markup session, then stop the session.
   * @note see [MarkupApp.props.result] for options.
   */
  public static async stop(): Promise<MarkupData> {
    const data = await this.readMarkup();
    if (!this.markup)
      return data;

    // restore original size for vp.
    ScreenViewport.setToParentSize(this.markup.vp.vpDiv);

    IModelApp.toolAdmin.markupView = undefined; // re-enable viewing tools for the view being marked-up
    this.markup.destroy();
    this.markup = undefined;
    // now restore the default tool and start it
    IModelApp.toolAdmin.defaultToolId = this._saveDefaultToolId;
    this._saveDefaultToolId = "";
    IModelApp.toolAdmin.startDefaultTool();
    return data;
  }

  /** Call this method to initialize the Markup system.
   * It asynchronously loads the MarkupTools namespace for the prompts and tool names for the Markup system, and
   * also registers all of the Markup tools.
   * @return a Promise that may be awaited to ensure that the MarkupTools namespace had been loaded.
   * @note This method is automatically called every time you call [[start]]. Since the Markup tools cannot
   * start unless there is a Markup active, there's really no need to call this method directly.
   * The only virtue in doing so is to pre-load the Markup namespace if you have an opportunity to do so earlier in your
   * startup code.
   * @note This method may be called multiple times, but only the first time initiates the loading/registering. Subsequent
   * calls return the same Promise.
   */
  public static async initialize(): Promise<void> {
    if (undefined === this.namespace) {     // only need to do this once
      this.namespace = IModelApp.i18n.registerNamespace("MarkupTools");
      IModelApp.tools.register(SelectTool, this.namespace);
      IModelApp.tools.registerModule(redlineTool, this.namespace);
      IModelApp.tools.registerModule(textTool, this.namespace);
    }
    return this.namespace.readFinished; // so caller can make sure localized messages are ready.
  }

  /** convert the current markup SVG into a string, but don't include decorations or dynamics
   * @internal
   */
  protected static readMarkupSvg() {
    const markup = this.markup;
    if (!markup || !markup.svgContainer)
      return undefined;
    markup.svgDecorations!.remove(); // we don't want the decorations or dynamics to be included
    markup.svgDynamics!.remove();
    IModelApp.toolAdmin.startDefaultTool();
    return markup.svgContainer.svg(); // string-ize the SVG data
  }

  /** convert the current markup SVG into a string (after calling readMarkupSvg) making sure width and height are specified.
   * @internal
   */
  protected static readMarkupSvgForDrawImage() {
    const markup = this.markup;
    if (!markup || !markup.svgContainer)
      return undefined;
    // Firefox requires width and height on top-level svg or drawImage does nothing, passing width/height to drawImage doesn't work.
    const rect = markup.markupDiv.getBoundingClientRect();
    markup.svgContainer.width(rect.width);
    markup.svgContainer.height(rect.height);
    return markup.svgContainer.svg(); // string-ize the SVG data
  }

  /** @internal */
  protected static async readMarkup(): Promise<MarkupData> {
    const result = this.props.result;
    let canvas = this.markup!.vp.readImageToCanvas();
    let svg, image;
    try {
      svg = this.readMarkupSvg(); // read the current svg data for the markup
      const svgForImage = (svg && result.imprintSvgOnImage ? this.readMarkupSvgForDrawImage() : undefined);
      if (svgForImage) {
        const svgImage = await imageElementFromImageSource(new ImageSource(svgForImage, ImageSourceFormat.Svg));
        canvas.getContext("2d")!.drawImage(svgImage, 0, 0); // draw markup svg onto view's canvas2d
      }

      // is the source view too wide? If so, we need to scale the image down.
      if (canvas.width > result.maxWidth) {
        // yes, we have to scale it down, create a new canvas and set the new canvas' size
        const newCanvas = document.createElement("canvas");
        newCanvas.width = result.maxWidth;
        newCanvas.height = canvas.height * (result.maxWidth / canvas.width);
        newCanvas.getContext("2d")!.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newCanvas.width, newCanvas.height);
        canvas = newCanvas; // return the image from adjusted canvas, not view canvas.
      }

      // return the markup data to be saved by the application.
      image = (!result.imageFormat ? undefined : canvas.toDataURL(result.imageFormat));
    } catch (e) {
      Logger.logError(`${FrontendLoggerCategory.Package}.markup`, "Error creating image from svg", () => ({ message: e.message }));
    }
    return { rect: { width: canvas.width, height: canvas.height }, svg, image };
  }

  /** @internal */
  public static markupPrefix = "markup-";
  /** @internal */
  public static get dropShadowId() { return `${this.markupPrefix}dropShadow`; } // this is referenced in the markup Svg to apply the drop-shadow filter to all markup elements.
  /** @internal */
  public static get cornerId() { return `${this.markupPrefix}photoCorner`; }
  /** @internal */
  public static get containerClass() { return `${this.markupPrefix}container`; }
  /** @internal */
  public static get dynamicsClass() { return `${this.markupPrefix}dynamics`; }
  /** @internal */
  public static get decorationsClass() { return `${this.markupPrefix}decorations`; }
  /** @internal */
  public static get markupSvgClass() { return `${this.markupPrefix}svg`; }
  /** @internal */
  public static get boxedTextClass() { return `${this.markupPrefix}boxedText`; }
  /** @internal */
  public static get textClass() { return `${this.markupPrefix}text`; }
  /** @internal */
  public static get stretchHandleClass() { return `${this.markupPrefix}stretchHandle`; }
  /** @internal */
  public static get rotateLineClass() { return `${this.markupPrefix}rotateLine`; }
  /** @internal */
  public static get rotateHandleClass() { return `${this.markupPrefix}rotateHandle`; }
  /** @internal */
  public static get vertexHandleClass() { return `${this.markupPrefix}vertexHandle`; }
  /** @internal */
  public static get moveHandleClass() { return `${this.markupPrefix}moveHandle`; }
  /** @internal */
  public static get textOutlineClass() { return `${this.markupPrefix}textOutline`; }
  /** @internal */
  public static get textEditorClass() { return `${this.markupPrefix}textEditor`; }
}

const removeSvgNamespace = (svg: Svg) => { svg.node.removeAttribute("xmlns:svgjs"); return svg; };
const newSvgElement = (name: string) => adopt(create(name));

/**
 * The current markup being created/edited. Holds the SVG elements, plus the active [[MarkupTool]].
 * When starting a Markup, a new Div is added as a child of the ScreenViewport's vpDiv.
 * @public
 */
export class Markup {
  /** @internal */
  public readonly markupDiv: HTMLDivElement;
  /** @internal */
  public readonly undo = new UndoManager();
  /** @internal */
  public readonly selected!: MarkupSelected;
  /** @internal */
  public readonly svgContainer?: Svg;
  /** @internal */
  public readonly svgMarkup?: G;
  /** @internal */
  public readonly svgDynamics?: G;
  /** @internal */
  public readonly svgDecorations?: G;

  /** create the drop-shadow filter in the Defs section of the supplied svg element */
  private createDropShadow(svg: Svg) {
    const filter = SVG(`#${MarkupApp.dropShadowId}`); // see if we already have one?
    if (filter) filter.remove(); // yes, remove it. This must be someone modifying the drop shadow properties

    // create a new filter, and add it to the Defs of the supplied svg
    svg.defs()
      .add(newSvgElement("filter").id(MarkupApp.dropShadowId)
        .add(newSvgElement("feDropShadow").attr(MarkupApp.props.dropShadow.attr)));
  }
  private addNested(className: string): G { return this.svgContainer!.group().addClass(className); }
  private addBorder() {
    const rect = this.svgContainer!.viewbox();
    const inset = MarkupApp.props.borderOutline["stroke-width"];
    const cornerSize = inset * 6;
    const cornerPts = [0, 0, cornerSize, 0, cornerSize * .7, cornerSize * .3, cornerSize * .3, cornerSize * .3, cornerSize * .3, cornerSize * .7, 0, cornerSize];
    const decorations = this.svgDecorations!;
    const photoCorner = decorations.symbol().polygon(cornerPts).attr(MarkupApp.props.borderCorners).id(MarkupApp.cornerId);
    const cornerGroup = decorations.group();
    cornerGroup.rect(rect.width - inset, rect.height - inset).move(inset / 2, inset / 2).attr(MarkupApp.props.borderOutline);
    cornerGroup.use(photoCorner);
    cornerGroup.use(photoCorner).rotate(90).translate(rect.width - cornerSize, 0);
    cornerGroup.use(photoCorner).rotate(180).translate(rect.width - cornerSize, rect.height - cornerSize);
    cornerGroup.use(photoCorner).rotate(270).translate(0, rect.height - cornerSize);
  }

  /** Create a new Markup for the supplied ScreenViewport. Adds a new "overlay-markup" div into the "vpDiv"
   * of the viewport.
   * @note you must call destroy on this object at end of markup to remove the markup div.
   */
  public constructor(public vp: ScreenViewport, markupData?: MarkupSvgData) {
    this.markupDiv = vp.addNewDiv("overlay-markup", true, 20); // this div goes on top of the canvas, but behind UI layers
    const rect = this.markupDiv.getBoundingClientRect();

    // First, see if there is a markup passed in as an argument
    if (markupData && markupData.svg) {
      this.markupDiv.innerHTML = markupData.svg; // make it a child of the markupDiv
      this.svgContainer = SVG(`.${MarkupApp.containerClass}`) as Svg | undefined; // get it in svg.js format
      this.svgMarkup = SVG(`.${MarkupApp.markupSvgClass}`) as G | undefined;
      if (!this.svgContainer || !this.svgMarkup) // if either isn't present, its not a valid markup
        return;
      removeSvgNamespace(this.svgContainer); // the SVG call above adds this - remove it
      this.svgMarkup.each(() => { }, true); // create an SVG.Element for each entry in the supplied markup.
    } else {
      // create the container that will be returned as the "svg" data for this markup
      this.svgContainer = SVG().addTo(this.markupDiv).addClass(MarkupApp.containerClass).viewbox(0, 0, rect.width, rect.height);
      removeSvgNamespace(this.svgContainer);
      this.svgMarkup = this.addNested(MarkupApp.markupSvgClass);
    }

    if (MarkupApp.props.dropShadow.enable) {
      this.createDropShadow(this.svgContainer);
      this.svgContainer.attr("filter", `url(#${MarkupApp.dropShadowId})`);
    }

    /** add two nested groups for providing feedback during the markup session. These Svgs are removed before the data is returned. */
    this.svgDynamics = this.addNested(MarkupApp.dynamicsClass); // only for tool dynamics of SVG graphics.
    this.svgDecorations = this.addNested(MarkupApp.decorationsClass); // only for temporary decorations of SVG graphics.
    this.addBorder();
    this.selected = new MarkupSelected(this.svgDecorations);
  }

  /** Called when the Markup is destroyed */
  public destroy() { this.markupDiv.remove(); }
  /** Turn on picking the markup elements in the markup view */
  public enablePick() { this.markupDiv.style.pointerEvents = "auto"; }
  /** Turn off picking the markup elements in the markup view */
  public disablePick() { this.markupDiv.style.pointerEvents = "none"; }
  /** Change the default cursor for the markup view */
  public setCursor(cursor: string) { this.markupDiv.style.cursor = cursor; }
  /** Delete all the entries in the selection set, then empty it. */
  public deleteSelected() { this.selected.deleteAll(this.undo); }
  /** Bring all the entries in the selection set to the front. */
  public bringToFront() { this.selected.reposition(MarkupApp.getActionName("toFront"), this.undo, (el) => el.front()); }
  /** Send all the entries in the selection set to the back. */
  public sendToBack() { this.selected.reposition(MarkupApp.getActionName("toBack"), this.undo, (el) => el.back()); }
  /** Group all the entries in the selection set, then select the group. */
  public groupSelected() { if (undefined !== this.svgMarkup) this.selected.groupAll(this.undo); }
  /** Ungroup all the group entries in the selection set. */
  public ungroupSelected() { if (undefined !== this.svgMarkup) this.selected.ungroupAll(this.undo); }
}
