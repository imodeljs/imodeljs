/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import "./KeyinBrowser.scss";
// cSpell:ignore Modeless keyins keyinbrowser testid
import * as React from "react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType, Tool } from "@bentley/imodeljs-frontend";
import { AutoSuggest, AutoSuggestData, CommonProps, InputLabel } from "@bentley/ui-core";
import { Button, LabeledInput } from "@itwin/itwinui-react";
import { UiFramework } from "../UiFramework";
import { SpecialKey } from "@bentley/ui-abstract";

/** Data for each key-in.
 */
interface KeyinBrowserData extends AutoSuggestData {
  // AutoSuggestData.value is the toolId
  // AutoSuggestData.label is the keyin

  /** English key-in - Browser supports both English and localized key-ins */
  englishKeyin: string;
}

/** State of key-in browser.
 */
interface KeyinBrowserState {
  keyins: KeyinBrowserData[];
  currentToolId: string | undefined;
  currentArgs: string;
}

/** Arguments for [[KeyinBrowserProps]] onExecute callback.
 * @beta
 */
export interface KeyinBrowserExecuteArgs {
  /** Id of the tool that was run */
  toolId: string | undefined;
  /** Arguments passed to the tool */
  args: string[];
  /** Status of the key-in run */
  runStatus: boolean;
}

/** Properties of the [[KeyinBrowser]] component.
 * @beta
 */
export interface KeyinBrowserProps extends CommonProps {
  /** Function called after the key-in is executed */
  onExecute?: (args: KeyinBrowserExecuteArgs) => void;
  /** Function called on Escape or popup close */
  onCancel?: () => void;
}

/**
 * Component used to allow users to select, provide arguments, and execute a key-in.
 * @beta
 */
export class KeyinBrowser extends React.PureComponent<KeyinBrowserProps, KeyinBrowserState> {
  private _toolIdLabel = UiFramework.translate("keyinbrowser.keyin");
  private _argsLabel = UiFramework.translate("keyinbrowser.args");
  private _argsTip = UiFramework.translate("keyinbrowser.argsTip");
  private _executeLabel = UiFramework.translate("keyinbrowser.execute");
  private _suggestPlaceholder = UiFramework.translate("keyinbrowser.placeholder");
  private _toolIdKey = "keyinbrowser:keyin";
  private _isMounted = false;

  /** @internal */
  constructor(props: any) {
    super(props);
    const currentToolId = this.getSavedToolId();
    const currentArgs = this.getToolArgs(currentToolId);

    this.state = {
      keyins: [],
      currentToolId,
      currentArgs,
    };
  }

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;

    let keyins = this.getToolKeyinMap();
    this.setState({ keyins });

    setTimeout(() => {
      keyins = keyins.sort((a: AutoSuggestData, b: AutoSuggestData) => a.label.localeCompare(b.label));
      // istanbul ignore else
      if (this._isMounted)
        this.setState({ keyins });
    });
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  private getArgsKey(toolId: string | undefined): string | undefined {
    if (toolId && toolId.length > 0)
      return `keyinbrowser:${toolId}`;
    return undefined;
  }

  private getSavedToolId(): string | undefined {
    const toolId = window.localStorage.getItem(this._toolIdKey);
    return toolId ? toolId : undefined;
  }

  private getToolArgs(toolId: string | undefined): string {
    const argsKey = this.getArgsKey(toolId);
    if (argsKey && argsKey.length > 0) {
      const args = window.localStorage.getItem(argsKey);
      // istanbul ignore if
      if (args && /* istanbul ignore next */ args.length > 0 && /* istanbul ignore next */ args[0] === "[") {
        return (JSON.parse(args) as string[]).join("|");
      }
    }
    return "";
  }

  private getToolKeyinMap(): KeyinBrowserData[] {
    const keyins: KeyinBrowserData[] = [];
    IModelApp.tools.getToolList()
      .forEach((tool: typeof Tool) => keyins.push({ value: tool.toolId, label: tool.keyin, englishKeyin: tool.englishKeyin }));
    return keyins;
  }

  private getArgsArray(): string[] {
    // istanbul ignore else
    if (this.state.currentArgs.length > 0) {
      return this.state.currentArgs.split("|");
    }
    return [];
  }

  private _onClick = () => {
    this._execute();
  };

  private _execute(): void {
    let toolId: string | undefined;
    let args: string[] = [];
    let runStatus = false;

    // istanbul ignore else
    if (this.state.currentToolId && this.state.currentToolId.length > 0) {
      const foundTool = IModelApp.tools.find(this.state.currentToolId);
      // istanbul ignore else
      if (foundTool) {
        toolId = foundTool.toolId;
        args = this.getArgsArray();
        const maxArgs = foundTool.maxArgs;

        if (args.length < foundTool.minArgs || (undefined !== maxArgs && args.length > maxArgs)) {
          this._outputMessage(UiFramework.translate("keyinbrowser.incorrectArgs"));
          return;
        }

        let key = "keyinbrowser:keyin";
        window.localStorage.setItem(key, toolId);

        // istanbul ignore if
        if (args && args.length > 0) {
          key = `keyinbrowser:${toolId}`;
          const objectAsString = JSON.stringify(args);
          window.localStorage.setItem(key, objectAsString);
        }

        const tool = new foundTool();
        runStatus = false;

        try {
          runStatus = args.length > 0 ? /* istanbul ignore next */ tool.parseAndRun(...args) : tool.run();
          !runStatus && this._outputMessage(UiFramework.translate("keyinbrowser.failedToRun"));
        } catch (e) {
          // istanbul ignore next
          this._outputMessage(`${UiFramework.translate("keyinbrowser.exceptionOccurred")}: ${e}`);
        }
      }
    }

    // istanbul ignore else
    if (this.props.onExecute)
      this.props.onExecute({ toolId, args, runStatus });
  }

  private _outputMessage = (msg: string) => {
    const details = new NotifyMessageDetails(OutputMessagePriority.Error, msg, undefined, OutputMessageType.Alert);
    IModelApp.notifications.outputMessage(details);
  };

  // istanbul ignore next
  private _onKeyinSelected = (selected: AutoSuggestData): void => {
    const currentToolId = selected.value;
    const currentArgs = this.getToolArgs(currentToolId);
    // istanbul ignore else
    if (this._isMounted)
      this.setState({ currentToolId, currentArgs });
  };

  private _onArgumentsChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState({ currentArgs: event.target.value });
  };

  private _onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (SpecialKey.Enter === event.key) {
      event.stopPropagation();
      this._execute();
      return;
    }

    // istanbul ignore else
    if (SpecialKey.Escape === event.key) {
      // istanbul ignore else
      if (this.props.onCancel)
        this.props.onCancel();
      return;
    }
  };

  private _onInputFocus = (event: React.FocusEvent<HTMLInputElement>): void => {
    // istanbul ignore else
    if (event.target) {
      event.target.select();
    }
  };

  private _onAutoSuggestEnter = (event: React.KeyboardEvent): void => {
    event.stopPropagation();

    const inputValue = (event.target as HTMLInputElement).value;
    // istanbul ignore else
    if (this._processInputValue(inputValue)) {
      setTimeout(() => {
        this._execute();
      });
    }
  };

  private _onAutoSuggestTab = (event: React.KeyboardEvent): void => {
    event.stopPropagation();

    const inputValue = (event.target as HTMLInputElement).value;
    this._processInputValue(inputValue);
  };

  private _processInputValue(inputValue: string): boolean {
    let currentKeyin = "";
    let foundTool: typeof Tool | undefined;

    if (this.state.currentToolId && this.state.currentToolId.length > 0) {
      foundTool = IModelApp.tools.find(this.state.currentToolId);
      // istanbul ignore else
      if (foundTool)
        currentKeyin = foundTool.keyin;
    }

    // istanbul ignore next
    if (inputValue !== currentKeyin) {
      const inputValueLower = inputValue.trim().toLowerCase();
      foundTool = IModelApp.tools.getToolList()
        .find((tool: typeof Tool) => tool.keyin.toLowerCase() === inputValueLower || tool.englishKeyin.toLowerCase() === inputValueLower);

      if (!foundTool) {
        this._outputMessage(UiFramework.translate("keyinbrowser.couldNotFindTool"));
        return false;
      } else {
        const currentToolId = foundTool.toolId;
        // istanbul ignore else
        if (this._isMounted)
          this.setState({ currentToolId });
      }
    }

    return true;
  }

  private _onAutoSuggestEscape = (event: React.KeyboardEvent): void => {
    event.stopPropagation();
    // istanbul ignore else
    if (this.props.onCancel)
      this.props.onCancel();
  };

  /** Calculate suggestions for any given input value. */
  private _getSuggestions = async (value: string): Promise<AutoSuggestData[]> => {
    const inputValue = value.trim().toLowerCase();
    const inputLength = inputValue.length;

    return Promise.resolve(
      inputLength === 0 ?
        /* istanbul ignore next */[] :
        this.state.keyins.filter((data: KeyinBrowserData) => {
          return data.label.toLowerCase().includes(inputValue) || data.englishKeyin.toLowerCase().includes(inputValue);
        })
    );
  };

  /** @internal */
  public override render(): React.ReactNode {
    return (
      <div className="uif-keyinbrowser-div">
        <InputLabel label={this._toolIdLabel}>
          <AutoSuggest value={this.state.currentToolId} style={{ width: "250px" }}
            placeholder={this._suggestPlaceholder} options={this.state.keyins}
            onSuggestionSelected={this._onKeyinSelected} onPressEnter={this._onAutoSuggestEnter}
            onPressTab={this._onAutoSuggestTab} onPressEscape={this._onAutoSuggestEscape} onInputFocus={this._onInputFocus}
            getSuggestions={this._getSuggestions} data-testid="uif-keyin-autosuggest" />
        </InputLabel>
        <LabeledInput label={this._argsLabel} title={this._argsTip} value={this.state.currentArgs}
          data-testid="uif-keyin-arguments" id="uif-keyin-arguments"
          onKeyDown={this._onKeyDown} onChange={this._onArgumentsChange} onFocus={this._onInputFocus} />
        <Button styleType="cta" data-testid="uif-keyin-browser-execute" onClick={this._onClick}>{this._executeLabel}</Button>
      </div>
    );
  }
}
