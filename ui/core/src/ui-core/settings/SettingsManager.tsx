/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import { BeUiEvent, Logger } from "@bentley/bentleyjs-core";
import { ConditionalBooleanValue } from "@bentley/ui-abstract";
import { UiCore } from "../UiCore";

/** Interface used to populate a tab entry in the SettingContainer control
 * @beta
 */
export interface SettingsTabEntry {
  /** unique id for entry */
  readonly tabId: string;
  /** localized display label */
  readonly label: string;
  /** Setting page content to display when tab item is selected. */
  readonly page: JSX.Element;
  /** Setting to true if page will register to watch for stage closing event so it can save any dirty settings. Page component should register and handle the events:
   * `settingsManager.onProcessSettingsTabActivation` and `settingsManager.onProcessSettingsContainerClose` */
  readonly pageWillHandleCloseRequest?: boolean;
  /** used to determine position in tablist */
  readonly itemPriority: number;
  /** Optional Subtitle to show below label. */
  readonly subLabel?: string;
  /** Icon specification */
  readonly icon?: string | JSX.Element;
  /** Tooltip. Allows JSX|Element to support react-tooltip component */
  readonly tooltip?: string | JSX.Element;
  /** Allows Settings entry to be disabled */
  readonly isDisabled?: boolean | ConditionalBooleanValue;
}

/** Event class for [[this.onSettingsProvidersChanged]] which is emitted when a new SettingsTabsProvider is added or removed.
 * @beta
 */
export class SettingsProvidersChangedEvent extends BeUiEvent<SettingsProvidersChangedEventArgs> { }

/** Arguments of [[this.onSettingsProvidersChanged]] event.
 * @beta
 */
export interface SettingsProvidersChangedEventArgs {
  readonly providers: ReadonlyArray<SettingsTabsProvider>;
}

/** Event class for [[this.onProcessSettingsTabActivation]] which is emitted when a new Tab needs to be activated. This allows the current
 * settings page to save its settings before activating the new SettingTab.
 * @beta
 */
export class ProcessSettingsTabActivationEvent extends BeUiEvent<ProcessSettingsTabActivationEventArgs> { }

/** Arguments of [[this.onProcessSettingsTabActivation]] event.
 * @beta
 */
export interface ProcessSettingsTabActivationEventArgs {
  readonly tabSelectionFunc: (tabId: string) => void;
  readonly requestedSettingsTabId: string;
}

/** Event class for [[this.onProcessSettingsContainerClose]] which is emitted when the settings container will be closed. This allows the current
 * settings page to save its settings before calling the function to close the container.
 * @beta
 */
export class ProcessSettingsContainerCloseEvent extends BeUiEvent<ProcessSettingsContainerCloseEventArgs> { }

/** Event class for [[this.onCloseSettingsContainer]] which is monitored by the settings container and indicates that some out process want to close the settings container.
 * @internal
 */
export class CloseSettingsContainerEvent extends BeUiEvent<ProcessSettingsContainerCloseEventArgs> { }

/** Arguments of [[this.onProcessSettingsContainerClose]] event.
 * @beta
 */
export interface ProcessSettingsContainerCloseEventArgs {
  readonly closeFunc: (args: any) => void;
  readonly closeFuncArgs?: any;
}

/** Event class for [[this.onActivateSettingsTab]] which is emitted when API call needs to set the active settings tab (ie via Tool key-in).
 * @beta
 */
export class ActivateSettingsTabEvent extends BeUiEvent<ActivateSettingsTabEventArgs> { }

/** Arguments of [[this.onActivateSettingsTab]] event.
 * @beta
 */
export interface ActivateSettingsTabEventArgs {
  readonly settingsTabId: string;
}

/** Setting Provider interface. Implemented by classes that want to supply settings pages for display in the SettingContainer. The
 * classes that implement this interface need to be registered with the [[SettingsManager]].
 * @beta
 */
export interface SettingsTabsProvider {
  /** Id of provider, used to remove registration. */
  readonly id: string;
  getSettingEntries(stageId: string, stageUsage: string): ReadonlyArray<SettingsTabEntry> | undefined;
}

/** Settings Manager class. Hold registration of settings providers and supplies events for the provided settings pages to listen.
 * @beta
 */
export class SettingsManager {
  private _providers: ReadonlyArray<SettingsTabsProvider> = [];

  /** Event raised when SettingsProviders are changed.
   */
  public readonly onSettingsProvidersChanged = new SettingsProvidersChangedEvent();

  /** Event raised solely for a settings page to monitor so it can save its settings before continuing tab activation.
   * See React hook function `useSaveBeforeActivatingNewSettingsTab`.
   */
  public readonly onProcessSettingsTabActivation = new ProcessSettingsTabActivationEvent();

  /** Event raised when the settings container will be closed. Any setting page component that is 'modal' should register to
   * listen to this event so that it can save its state before closing. See React hook function `useSaveBeforeClosingSettingsContainer`.
   */
  public readonly onProcessSettingsContainerClose = new ProcessSettingsContainerCloseEvent();

  /** Event raised to change the active settings tab shown in UI. Monitored by the SettingsContainer.
   * @internal
   */
  public readonly onActivateSettingsTab = new ActivateSettingsTabEvent();

  /** Event monitored by SettingsContainer to process request to close the settings container.
   * @internal
   */
  public readonly onCloseSettingsContainer = new CloseSettingsContainerEvent();

  /** @beta */
  public get providers(): ReadonlyArray<SettingsTabsProvider> { return this._providers; }
  public set providers(p: ReadonlyArray<SettingsTabsProvider>) {
    this._providers = p;
    this.onSettingsProvidersChanged.emit({ providers: p });
  }

  /** Called by application when an tool, keyin, or other process want to change the active settings tab/page giving the current tab/page and opportunity
   * to save its state.
   */
  public activateSettingsTab(settingsTabId: string) {
    this.onActivateSettingsTab.emit({ settingsTabId });
  }

  /** Called by application when the Settings Container is to be closed. The function to invoke to actually close the Settings Container is
   * passed in and executed once the active settings tab/page has a chance to save its settings.
   */
  public closeSettingsContainer(closeFunc: (args: any) => void, closeFuncArgs?: any) {
    this.onCloseSettingsContainer.emit({ closeFunc, closeFuncArgs });
  }

  public addSettingsProvider(settingsProvider: SettingsTabsProvider): void {
    const foundProvider = this._providers.find((p) => p.id === settingsProvider.id);
    if (!foundProvider) {
      const updatedProviders = [
        ...this.providers,
        settingsProvider,
      ];
      this.providers = updatedProviders;
    } else {
      Logger.logInfo(UiCore.loggerCategory(this), `Settings Provider with id of ${settingsProvider.id} has already been registered`);
    }
  }

  public removeSettingsProvider(providerId: string): boolean {
    let result = false;
    const updatedProviders = this._providers.filter((p) => p.id !== providerId);
    if (updatedProviders.length !== this._providers.length) {
      this.providers = updatedProviders;
      result = true;
    }

    return result;
  }

  /** Get an array of SettingsTabEntry objects to populate the settings container. */
  public getSettingEntries(stageId: string, stageUsage: string): Array<SettingsTabEntry> {
    const allSettingEntries: SettingsTabEntry[] = [];
    // Consult the registered SettingsProviders
    this._providers.forEach((p) => {
      const entries = p.getSettingEntries(stageId, stageUsage);
      entries && allSettingEntries.push(...entries);
    });

    return allSettingEntries;
  }
}
