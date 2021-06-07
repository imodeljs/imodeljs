/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MarkupTools
 */

import {
  BeButtonEvent, CoreTools, EventHandled, IModelApp, InputSource, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod,
  ToolAssistanceInstruction, ToolAssistanceSection,
} from "@bentley/imodeljs-frontend";
import { G, Text as MarkupText } from "@svgdotjs/svg.js";
import { MarkupApp } from "./Markup";
import { MarkupTool } from "./MarkupTool";
import { RedlineTool } from "./RedlineTool";

// cspell:ignore rbox

/** Tool to place new text notes on a Markup.
 * @public
 */
export class PlaceTextTool extends RedlineTool {
  public static toolId = "Markup.Text.Place";
  public static iconSpec = "icon-text-medium";
  protected _nRequiredPoints = 1;
  protected _minPoints = 0;
  protected _value!: string;

  public onPostInstall(): void {
    this._value = MarkupApp.props.text.startValue; // so applications can put a default string (e.g. user's initials) in the note. Can be empty
    super.onPostInstall();
  }

  protected showPrompt(): void { this.provideToolAssistance(`${MarkupTool.toolKey}Text.Place.Prompts.FirstPoint`, true); }

  protected createMarkup(svg: G, ev: BeButtonEvent, isDynamics: boolean): void {
    if (isDynamics && InputSource.Touch === ev.inputSource)
      return;
    const start = MarkupApp.convertVpToVb(ev.viewPoint); // starting point in viewbox coordinates
    const text = new MarkupText().plain(this._value); // create a plain text element
    svg.put(text); // add it to the supplied container
    this.setCurrentTextStyle(text); // apply active text style
    text.translate(start.x, start.y); // and position it relative to the cursor
    if (isDynamics) {
      svg.add(text.getOutline().attr(MarkupApp.props.text.edit.textBox).addClass(MarkupApp.textOutlineClass)); // in dynamics, draw the box around the text
    } else {
      new EditTextTool(text, true).run(); // text is now positioned, open text editor
    }
  }
  public onRestartTool(): void { }
  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { this.exitTool(); return EventHandled.Yes; }
}

/** Tool for editing text. Started automatically by the place text tool and by clicking on text from the SelectTool
 * @public
 */
export class EditTextTool extends MarkupTool {
  public static toolId = "Markup.Text.Edit";
  public static iconSpec = "icon-text-medium";
  public editor?: HTMLTextAreaElement;
  public editDiv?: HTMLDivElement;
  public boxed?: G;
  constructor(public text?: MarkupText | G, private _fromPlaceTool = false) { super(); }

  protected showPrompt(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, IModelApp.i18n.translate(`${MarkupTool.toolKey}Text.Edit.Prompts.FirstPoint`));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.Accept");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Exit");
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  /** Open the text editor  */
  public startEditor() {
    let text = this.text;
    if (text === undefined)
      return;

    if (text instanceof G) {
      this.boxed = text;
      text = text.children()[1] as MarkupText;
      if (!(text instanceof MarkupText))
        return;
      this.text = text;
    }
    const markupDiv = this.markup.markupDiv;
    const editDiv = this.editDiv = document.createElement("div"); // create a new DIV to hold the text editor
    const editProps = MarkupApp.props.text.edit;
    let style = editDiv.style;
    style.backgroundColor = editProps.background;
    style.top = style.left = "0";
    style.right = style.bottom = "100%";

    markupDiv.appendChild(editDiv); // add textEditor div to markup div

    const divRect = markupDiv.getBoundingClientRect();
    const outline = text.getOutline(); // use the outline rather than the text in case it's blank.
    text.after(outline); // we have to add it to the DOM or the rbox call doesn't work.
    const rbox = outline.rbox();
    const bbox = outline.bbox();
    outline.remove(); // take it out again.
    const editor = this.editor = document.createElement("textarea");
    editDiv.appendChild(editor);
    editor.className = MarkupApp.textEditorClass;
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.wrap = "off";
    // so we don't send these events to the ToolAdmin and process them by tools. We want default handling
    const mouseListener = (ev: Event) => (ev.stopPropagation(), true);
    (editor as any).onselectstart = editor.oncontextmenu = editor.onmousedown = editor.onmouseup = mouseListener; // enable default handling for these events

    // Tab, Escape, ctrl-enter, or shift-enter all end the editor
    editor.onkeydown = (ev: KeyboardEvent) => {
      if (ev.key === "Tab" || ev.key === "Escape" || (ev.key === "Enter" && (ev.shiftKey || ev.ctrlKey)))
        this.exitTool();
      ev.stopPropagation();

    };
    const textElStyle = window.getComputedStyle(text.node);

    style = editor.style;
    style.pointerEvents = "auto";
    style.position = "absolute";
    style.top = `${(rbox.cy - (bbox.h / 2)) - divRect.top}px`; // put the editor over the middle of the text element
    style.left = `${(rbox.cx - (bbox.w / 2)) - divRect.left}px`;
    style.height = editProps.size.height;
    style.width = editProps.size.width;
    style.resize = "both";
    style.fontFamily = textElStyle.fontFamily; // set the font family and anchor to the same as the text element
    style.textAnchor = textElStyle.textAnchor;
    style.fontSize = editProps.fontSize; // from app.props

    const parentZ = parseInt(window.getComputedStyle(markupDiv).zIndex || "0", 10);
    style.zIndex = (parentZ + 200).toString();

    editor.innerHTML = text.getMarkup(); // start with existing text
    this.editor.focus(); // give the editor focus

    // if we're started from the place text tool, select the entire current value, otherwise place the cursor at the end.
    this.editor.setSelectionRange(this._fromPlaceTool ? 0 : editor.value.length, editor.value.length);
  }

  /** Called when EditText exits, saves the edited value into the text element */
  public onCleanup() {
    if (!this.editDiv)
      return;

    const text = this.text! as MarkupText;
    const original = this.boxed ? this.boxed : text;
    const undo = this.markup.undo;
    undo.performOperation(this.keyin, () => {
      const newVal = this.editor!.value;
      if (newVal.trim() === "") { // if the result of the editing is blank, just delete the text element
        if (!this._fromPlaceTool)
          undo.onDelete(original);
        original.remove(); // must do this *after* we call undo.onDelete
        return;
      }

      let newText: G | MarkupText = text.clone();
      const fontSize = text.getFontSize();
      newText.createMarkup(newVal, fontSize);
      if (this.boxed) {
        newText = this.createBoxedText((original as G).parent() as G, newText);
        newText.matrix(original.matrix());
      }
      original.replace(newText);
      if (this._fromPlaceTool)
        undo.onAdded(newText);
      else
        undo.onModified(newText, original);
    });

    const editSize = MarkupApp.props.text.edit.size;
    const style = this.editor!.style;
    editSize.height = style.height;
    editSize.width = style.width;
    this.editDiv.remove();
    this.editDiv = undefined;
    this.editor = undefined;
  }

  public onInstall() {
    if (!super.onInstall())
      return false;
    this.startEditor();
    return true;
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { this.exitTool(); return EventHandled.Yes; }
  public async onDataButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { this.exitTool(); return EventHandled.Yes; }
  public async onMouseStartDrag(_ev: BeButtonEvent): Promise<EventHandled> { this.exitTool(); return EventHandled.Yes; }
}
