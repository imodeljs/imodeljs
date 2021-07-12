/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

// cSpell:ignore focusvalue uiadmin

import * as React from "react";
import "./KeyinPalettePanel.scss";
import { FilteredText, Listbox, ListboxItem, UiSettingsStatus } from "@bentley/ui-core";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType, ParseAndRunResult } from "@bentley/imodeljs-frontend";
import { UiFramework } from "../UiFramework";
import { matchesWords, OnItemExecutedFunc, SpecialKey } from "@bentley/ui-abstract";
import { ClearKeyinPaletteHistoryTool } from "../tools/KeyinPaletteTools";
import { useUiSettingsStorageContext } from "../uisettings/useUiSettings";
import { KeyinEntry } from "../uiadmin/FrameworkUiAdmin";
import { Input } from "@itwin/itwinui-react";

const KEYIN_PALETTE_NAMESPACE = "KeyinPalettePanel";
const KEYIN_HISTORY_KEY = "historyArray";

/** @internal */
export function clearKeyinPaletteHistory() {
  const uiSettingsStorage = UiFramework.getUiSettingsStorage();
  // istanbul ignore else
  if (uiSettingsStorage) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    uiSettingsStorage.deleteSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY);
  }
}

interface KeyinPalettePanelProps {
  keyins: KeyinEntry[];
  onKeyinExecuted?: OnItemExecutedFunc;
  historyLength?: number;
}

/**
 * @internal
 */
export function KeyinPalettePanel({ keyins, onKeyinExecuted, historyLength: allowedHistoryLength = 6 }: KeyinPalettePanelProps) {
  const [currentKeyin, setCurrentKeyin] = React.useState<string>("");
  const placeholderLabel = React.useRef(UiFramework.translate("keyinbrowser.placeholder"));
  const inputRef = React.useRef<HTMLInputElement>(null);
  const keyinSeparator = "--#--";
  const [historyKeyins, setHistoryKeyins] = React.useState<string[]>([]);
  const uiSettingsStorage = useUiSettingsStorageContext();

  React.useEffect(() => {
    async function fetchState() {
      const settingsResult = await uiSettingsStorage.getSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY);
      // istanbul ignore else
      if (UiSettingsStatus.Success === settingsResult.status) {
        const filteredHistory = (settingsResult.setting as string[]).filter((keyin) => {
          const result = IModelApp.tools.parseKeyin(keyin);
          return result.ok;
        });
        setHistoryKeyins(filteredHistory);
      } else {
        setHistoryKeyins([]);
      }
    }

    fetchState(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [uiSettingsStorage]);

  // istanbul ignore next
  const storeHistoryKeyins = React.useCallback(async (value: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    const result = await uiSettingsStorage.saveSetting(KEYIN_PALETTE_NAMESPACE, KEYIN_HISTORY_KEY, value);
    if (result.status !== UiSettingsStatus.Success) {
      const briefMessage = UiFramework.translate("keyinbrowser.couldNotSaveHistory");
      const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Error, briefMessage);
      IModelApp.notifications.outputMessage(errorDetails);
    }
  }, [uiSettingsStorage]);

  const allKeyins = React.useMemo(() => {
    const availableKeyins = [];
    historyKeyins.forEach((value: string) => {
      availableKeyins.push({ value, isHistory: true });
    });
    availableKeyins.push(...keyins.sort((a, b) => a.value.toLowerCase().localeCompare(b.value.toLowerCase())));
    return availableKeyins;
  }, [historyKeyins, keyins]);

  const submitKeyin = React.useCallback(async (value: string) => {
    let message: string | undefined;
    try {
      switch (IModelApp.tools.parseAndRun(value)) {
        case ParseAndRunResult.ToolNotFound:
          message = `UiFramework.translate("keyinbrowser.couldNotFindTool")} ${value}`;
          break;
        // istanbul ignore next
        case ParseAndRunResult.BadArgumentCount:
          message = UiFramework.translate("keyinbrowser.incorrectArgs");
          break;
        // istanbul ignore next
        case ParseAndRunResult.FailedToRun:
          message = UiFramework.translate("keyinbrowser.failedToRun");
          break;
      }
    } catch (ex) {
      // istanbul ignore next
      message = `${UiFramework.translate("keyinbrowser.exceptionOccurred")}: ${ex}`;
    }

    // istanbul ignore else
    if (undefined !== message) {
      const briefMessage = UiFramework.translate("keyinbrowser.exceptionOccurred");
      const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Error, briefMessage, message, OutputMessageType.Sticky);
      IModelApp.notifications.outputMessage(errorDetails);
    } else {
      // istanbul ignore next
      if (value.length < 400 && value !== ClearKeyinPaletteHistoryTool.keyin && value !== ClearKeyinPaletteHistoryTool.englishKeyin) {
        const newHistoryEntries: string[] = [value];
        for (const entry of historyKeyins) {
          if (entry !== value) {
            newHistoryEntries.push(entry);
            if (newHistoryEntries.length >= allowedHistoryLength)
              break;
          }
        }
        await storeHistoryKeyins(newHistoryEntries);
      }

      // close the popup by processing the supplied onKeyinExecuted function
      if (onKeyinExecuted)
        onKeyinExecuted(value);
    }
  }, [storeHistoryKeyins, onKeyinExecuted, historyKeyins, allowedHistoryLength]);

  const selectKeyin = React.useCallback(() => {
    // istanbul ignore else
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
    }
  }, [inputRef]);

  const updateKeyin = React.useCallback((value: string) => {
    setCurrentKeyin(value);
    selectKeyin();
  }, [selectKeyin]);

  const getKeyinFromListboxValue = (value: string | undefined) => {
    // istanbul ignore else
    if (value) {
      const indexSeparator = value.search(keyinSeparator);
      // istanbul ignore else
      if (indexSeparator)
        return value.substr(0, indexSeparator);
    }
    // istanbul ignore next
    return undefined;
  };

  const handleKeypressOnKeyinsList = React.useCallback(async (event: React.KeyboardEvent<HTMLUListElement>) => {
    const key = event.key;
    // built into listbox a "Space" key will trigger the selection of a entry so if an Enter key is pressed
    // assume user wants to execute the entry.
    // istanbul ignore else
    if (key === SpecialKey.Enter) {
      event.preventDefault();
      // istanbul ignore next
      const keyinToSend = getKeyinFromListboxValue(event.currentTarget?.dataset?.focusvalue);
      // istanbul ignore else
      if (keyinToSend) {
        if (event.ctrlKey)
          updateKeyin(keyinToSend);
        else
          await submitKeyin(keyinToSend);
      }
    }
  }, [submitKeyin, updateKeyin]);

  const onListboxValueChange = React.useCallback(async (value: string, isControlOrCommandPressed?: boolean) => {
    const keyin = getKeyinFromListboxValue(value);
    // istanbul ignore else
    if (keyin) {
      if (isControlOrCommandPressed)
        updateKeyin(keyin);
      else
        await submitKeyin(keyin);
    }
  }, [submitKeyin, updateKeyin]);

  const onInputValueChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentKeyin(event.target.value);
  }, []);

  const filteredKeyins = React.useMemo(() => {
    const filteredHistory: KeyinEntry[] = [];
    if (undefined === currentKeyin || 0 === currentKeyin.length) {
      return allKeyins;
    } else {
      const newKeyinSet: KeyinEntry[] = [];
      allKeyins.forEach((value) => {
        const matches = matchesWords(currentKeyin, value.value);
        if (matches && matches.length) {
          // istanbul ignore else
          if (value.isHistory) {
            filteredHistory.push(value);
            newKeyinSet.push({ ...value, matches });
          } else {
            // only add entry if no match in filtered history
            // istanbul ignore else
            if (-1 === filteredHistory.findIndex((historyEntry: KeyinEntry) => historyEntry.value === value.value))
              newKeyinSet.push({ ...value, matches });
          }
        }
      });
      return newKeyinSet;
    }
  }, [allKeyins, currentKeyin]);

  const onInputValueKeyDown = React.useCallback(async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (SpecialKey.Enter === event.key) {
      event.preventDefault();
      event.stopPropagation();
      // istanbul ignore else
      if (1 === filteredKeyins.length) {
        if (event.ctrlKey)
          updateKeyin(filteredKeyins[0].value);
        else
          await submitKeyin(filteredKeyins[0].value);
      } else {
        if (currentKeyin)
          await submitKeyin(currentKeyin);
      }
    } else if (SpecialKey.Tab === event.key && 1 === filteredKeyins.length) {
      event.preventDefault();
      event.stopPropagation();
      updateKeyin(filteredKeyins[0].value);
    } else {
      if (event.key === SpecialKey.ArrowDown && filteredKeyins.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        // istanbul ignore else
        if (inputRef.current) {
          const nextElement = inputRef.current.nextElementSibling as HTMLElement;
          nextElement && nextElement.focus();
        }
      }
    }

  }, [filteredKeyins, submitKeyin, currentKeyin, updateKeyin]);

  const lastHistoryIndex = filteredKeyins.findIndex((entry) => (true !== entry.isHistory)) - 1;

  return <div className="uifw-command-palette-panel">
    <Input ref={inputRef} type="text" onKeyDown={onInputValueKeyDown}
      className={"uifw-command-palette-input"} data-testid="command-palette-input" onChange={onInputValueChange}
      placeholder={placeholderLabel.current} value={currentKeyin}
    />
    {(filteredKeyins.length > 0) &&
      <Listbox id="uifw-command-sources" className="map-manager-source-list" onKeyPress={handleKeypressOnKeyinsList}
        onListboxValueChange={onListboxValueChange} >
        {
          filteredKeyins.map((entry, index) => {
            const value = `${entry.value}${keyinSeparator}${entry.isHistory ? "history" : "registry"}`;
            const itemClass = `uifw-command-palette-value-entry${index === lastHistoryIndex ? " uifw-history-bottom-border" : ""}`;
            return <ListboxItem key={`${entry.value}-${index}`} className={itemClass} value={value} >
              <FilteredText value={entry.value} matches={entry.matches} />
            </ListboxItem>;
          })
        }
      </Listbox >
    }
  </div >;
}
