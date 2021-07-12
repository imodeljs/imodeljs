/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AutoSuggest
 */

import "./AutoSuggest.scss";
import * as React from "react";
import * as ReactAutosuggest from "react-autosuggest";
import { Logger } from "@bentley/bentleyjs-core";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "../utils/Props";
import { UiCore } from "../UiCore";

/** Data for the [[AutoSuggest]] options
 * @beta
 */
export interface AutoSuggestData {
  /** Value of [[AutoSuggest]] option. */
  value: string;
  /** Label of [[AutoSuggest]] option. This is shown in the dropdown. */
  label: string;
}

/** Prototype for function returning AutoSuggestData
 * @beta
 */
export type GetAutoSuggestDataFunc = (value: string) => AutoSuggestData[];

/** Prototype for async function returning AutoSuggestData
 * @beta
 */
export type AsyncGetAutoSuggestDataFunc = (value: string) => Promise<AutoSuggestData[]>;

/** Properties for the [[AutoSuggest]] component.
 * @beta
 */
export interface AutoSuggestProps extends React.InputHTMLAttributes<HTMLInputElement>, CommonProps {
  /** Optional input value override. */
  value?: string;
  /** Options for dropdown. */
  options?: AutoSuggestData[] | GetAutoSuggestDataFunc;
  /** Asynchronously calculate suggestions for any given input value. */
  getSuggestions?: AsyncGetAutoSuggestDataFunc;
  /** Gets a label associated with a given value */
  getLabel?: (value: string | undefined) => string;
  /** Handler for when suggested selected. */
  onSuggestionSelected: (selected: AutoSuggestData) => void;
  /** Handler for Enter key. */
  onPressEnter?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Handler for Escape key. */
  onPressEscape?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Handler for Tab key. */
  onPressTab?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Handler for input receiving focus. */
  onInputFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Called every time you need to clear suggestions. */
  onSuggestionsClearRequested?: () => void;
  /** Indicates whether to set focus to the input element */
  setFocus?: boolean;

  /** Use it only if you need to customize the rendering of the input.
   * @internal
   */
  renderInputComponent?: any; // ReactAutosuggest.RenderInputComponent<AutoSuggestData>; NOTE: changed to "any" because build was failing with RenderInputComponent is not generic?
  /** Use it if you want to customize things inside the suggestions container beyond rendering the suggestions themselves.
   * @internal
   */
  renderSuggestionsContainer?: ReactAutosuggest.RenderSuggestionsContainer;

  /** @internal */
  alwaysRenderSuggestions?: boolean;
}

/** @internal */
interface AutoSuggestState {
  inputValue: string;
  suggestions: AutoSuggestData[];
}

/** Auto Suggest React component. Uses the react-autosuggest component internally.
 * @beta
 */
export class AutoSuggest extends React.PureComponent<AutoSuggestProps, AutoSuggestState> {
  private _isMounted = false;

  constructor(props: AutoSuggestProps) {
    super(props);

    // Autosuggest is a controlled component.
    // This means that you need to provide an input value
    // and an onChange handler that updates this value (see below).
    // Suggestions also need to be provided to the Autosuggest,
    // and they are initially empty because the Autosuggest is closed.
    this.state = {
      inputValue: this.getLabel(props.value),
      suggestions: [],
    };
  }

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  public override componentDidUpdate(prevProps: AutoSuggestProps) {
    if (this.props.value !== prevProps.value || this.props.options !== prevProps.options) {
      this.setState((_prevState, props) => ({
        inputValue: this.getLabel(props.value),
      }));
    }
  }

  private _onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = "";

    if (e.target.tagName === "LI" && e.target.textContent)
      newValue = e.target.textContent;
    else if (e.target.value)
      newValue = e.target.value;

    this.setState({
      inputValue: newValue,
    });
  };

  private _onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // istanbul ignore else
    if (this.props.onInputFocus)
      this.props.onInputFocus(e);
  };

  /** Autosuggest will call this function every time you need to update suggestions. */
  private _onSuggestionsFetchRequested = async (request: ReactAutosuggest.SuggestionsFetchRequestedParams): Promise<void> => {
    const value = request.value;
    const suggestions = await this._getSuggestions(value);

    if (this._isMounted)
      this.setState({ suggestions });
  };

  /** Autosuggest will call this function every time you need to clear suggestions. */
  private _onSuggestionsClearRequested = () => {
    this.setState({ suggestions: [] });
    this.props.onSuggestionsClearRequested && this.props.onSuggestionsClearRequested();
  };

  private _onSuggestionSelected = (_event: React.FormEvent<any>, data: ReactAutosuggest.SuggestionSelectedEventData<AutoSuggestData>): void => {
    this.props.onSuggestionSelected(data.suggestion);
  };

  /** Teach Autosuggest how to calculate suggestions for any given input value. */
  private _getSuggestions = async (value: string): Promise<AutoSuggestData[]> => {
    if (typeof this.props.options === "function")
      return Promise.resolve(this.props.options(value));

    if (this.props.getSuggestions)
      return this.props.getSuggestions(value);

    if (this.props.options === undefined) {
      Logger.logError(UiCore.loggerCategory(this), `props.options or props.getSuggestions should be provided`);
      return Promise.resolve([]);
    }

    const inputValue = value.trim().toLowerCase();
    const inputLength = inputValue.length;

    return Promise.resolve(
      inputLength === 0 ?
      /* istanbul ignore next */[] :
        this.props.options.filter((data: AutoSuggestData) => {
          return data.label.toLowerCase().includes(inputValue) || data.value.toLowerCase().includes(inputValue);
        })
    );
  };

  /** When suggestion is clicked, Autosuggest needs to populate the input based on the clicked suggestion.  */
  private _getSuggestionValue = (suggestion: AutoSuggestData) => suggestion.label;

  /** Render each suggestion. */
  private _renderSuggestion = (suggestion: AutoSuggestData) => (
    <span>
      {suggestion.label}
    </span>
  );

  private getLabel(value: string | undefined): string {
    let label = "";

    if (this.props.getLabel) {
      label = this.props.getLabel(value);
    } else if (this.props.options instanceof Array) {
      const entry = this.props.options.find((data: AutoSuggestData) => data.value === value);
      if (entry)
        label = entry.label;
    } else {
      Logger.logError(UiCore.loggerCategory(this), `props.getLabel should be provided when props.options is a function`);
    }

    return label;
  }

  private _handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case SpecialKey.Enter:
        // istanbul ignore else
        if (this.props.onPressEnter)
          this.props.onPressEnter(e);
        break;
      case SpecialKey.Escape:
        // istanbul ignore else
        if (this.props.onPressEscape)
          this.props.onPressEscape(e);
        break;
      case SpecialKey.Tab:
        // istanbul ignore else
        if (this.props.onPressTab)
          this.props.onPressTab(e);
        break;
    }
  };

  private _theme = {
    container: "uicore-autosuggest__container",
    containerOpen: "uicore-autosuggest__container--open",
    input: "uicore-autosuggest__input",
    inputOpen: "uicore-autosuggest__input--open",
    inputFocused: "uicore-autosuggest__input--focused",
    suggestionsContainer: "uicore-autosuggest__suggestions-container",
    suggestionsContainerOpen: "uicore-autosuggest__suggestions-container--open",
    suggestionsList: "uicore-autosuggest__suggestions-list",
    suggestion: "uicore-autosuggest__suggestion",
    suggestionFirst: "uicore-autosuggest__suggestion--first",
    suggestionHighlighted: "uicore-autosuggest__suggestion--highlighted",
    sectionContainer: "uicore-autosuggest__section-container",
    sectionContainerFirst: "uicore-autosuggest__section-container--first",
    sectionTitle: "uicore-autosuggest__section-title",
  };

  public override render(): JSX.Element {
    const { inputValue, suggestions } = this.state;
    const { value, onChange, placeholder, options, onSuggestionSelected, setFocus, alwaysRenderSuggestions, // eslint-disable-line @typescript-eslint/no-unused-vars
      onPressEnter, onPressEscape, onPressTab, onInputFocus, getLabel, // eslint-disable-line @typescript-eslint/no-unused-vars
      getSuggestions,  // eslint-disable-line deprecation/deprecation, @typescript-eslint/no-unused-vars
      renderInputComponent, renderSuggestionsContainer, onSuggestionsClearRequested,  // eslint-disable-line @typescript-eslint/no-unused-vars
      ...props } = this.props;
    const inputPlaceholder = (!inputValue) ? placeholder : undefined;

    const inputProps: ReactAutosuggest.InputProps<AutoSuggestData> = {
      ...props,
      value: inputValue,
      onChange: this._onChange,
      onFocus: this._onFocus,
      placeholder: inputPlaceholder,
      autoFocus: setFocus,
    };

    return (
      // The onKeyDown event handler is only being used to capture bubbled events
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div className={this.props.className} style={this.props.style} onKeyDown={this._handleKeyDown}>
        <ReactAutosuggest
          theme={this._theme}
          suggestions={suggestions}
          onSuggestionsFetchRequested={this._onSuggestionsFetchRequested}
          onSuggestionsClearRequested={this._onSuggestionsClearRequested}
          getSuggestionValue={this._getSuggestionValue}
          renderSuggestion={this._renderSuggestion}
          inputProps={inputProps}
          onSuggestionSelected={this._onSuggestionSelected}
          alwaysRenderSuggestions={alwaysRenderSuggestions}
          renderInputComponent={renderInputComponent}
          renderSuggestionsContainer={renderSuggestionsContainer}
        />
      </div>
    );
  }
}
