/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import memoize from "micro-memoize";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  Content, DEFAULT_KEYS_BATCH_SIZE, Descriptor, DescriptorOverrides, DiagnosticsOptionsWithHandler, Field, KeySet, PageOptions, RegisteredRuleset,
  RequestOptionsWithRuleset, Ruleset, RulesetVariable, SelectionInfo,
} from "@bentley/presentation-common";
import { IModelContentChangeEventArgs, Presentation } from "@bentley/presentation-frontend";
import { PropertyRecord } from "@bentley/ui-abstract";
import { PresentationComponentsLoggerCategory } from "../ComponentsLoggerCategory";
import { createDiagnosticsOptions, DiagnosticsProps } from "./Diagnostics";
import { IPresentationDataProvider } from "./IPresentationDataProvider";
import { RulesetRegistrationHelper } from "./RulesetRegistrationHelper";
import { findField } from "./Utils";

/**
 * Properties for invalidating content cache.
 * @public
 */
export interface CacheInvalidationProps {
  /**
   * Invalidate content descriptor. Should be set when invalidating
   * after changing anything that affects how the descriptor is built:
   * `keys`, `selectionInfo`, `imodel`, `rulesetId`.
   */
  descriptor?: boolean;

  /**
   * Invalidate configured content descriptor. Should be set when
   * invalidating something that affects how descriptor is configured
   * in the `configureContentDescriptor` callback, e.g. hidden fields,
   * sorting, filtering, etc.
   */
  descriptorConfiguration?: boolean;

  /**
   * Invalidate cached content size. Should be set after changing anything
   * that may affect content size. Generally, it should always be set when
   * the `descriptor` flag is set. Additionally, it should also be set after
   * setting `filterExpression` or similar descriptor properties.
   */
  size?: boolean;

  /**
   * Invalidate cached content. Should be set after changing anything that may
   * affect content. Generally, it should always be set when the `descriptor`
   * flag is set. Additionally, it should also be set after setting `sortingField`,
   * `sortDirection`, `filterExpression` and similar fields.
   */
  content?: boolean;
}
/** @public */
export namespace CacheInvalidationProps {
  /**
   * Create CacheInvalidationProps to fully invalidate all caches.
   */
  export const full = (): CacheInvalidationProps => ({ descriptor: true, descriptorConfiguration: true, size: true, content: true });
}

/**
 * Interface for all presentation-driven content providers.
 * @public
 */
export interface IContentDataProvider extends IPresentationDataProvider {
  /** Display type used to format content */
  readonly displayType: string;
  /** Keys defining what to request content for */
  keys: KeySet;
  /** Information about selection event that results in content change */
  selectionInfo: SelectionInfo | undefined;

  /**
   * Get the content descriptor.
   */
  getContentDescriptor: () => Promise<Descriptor | undefined>;

  /**
   * Get the number of content records.
   */
  getContentSetSize: () => Promise<number>;

  /**
   * Get the content.
   * @param pageOptions Paging options.
   */
  getContent: (pageOptions?: PageOptions) => Promise<Content | undefined>;

  /** Get field that was used to create the given property record */
  getFieldByPropertyRecord: (propertyRecord: PropertyRecord) => Promise<Field | undefined>;
}

/**
 * Properties for creating a `ContentDataProvider` instance.
 * @public
 */
export interface ContentDataProviderProps extends DiagnosticsProps {
  /** IModel to pull data from. */
  imodel: IModelConnection;

  /** Id of the ruleset to use when requesting content or a ruleset itself. */
  ruleset: string | Ruleset;

  /** The content display type which this provider is going to load data for. */
  displayType: string;

  /**
   * Paging size for obtaining content records.
   *
   * Presentation data providers, when used with paging, have ability to save one backend request for size / count. That
   * can only be achieved when `pagingSize` property is set on the data provider and it's value matches size which is used when
   * requesting content. To help developers notice this problem, data provider emits a warning similar to this:
   * ```
   * ContentDataProvider.pagingSize doesn't match pageOptions in ContentDataProvider.getContent call. Make sure you set provider's pagingSize to avoid excessive backend requests.
   * ```
   * To fix the issue, developers should make sure the page size used for requesting data is also set for the data provider:
   * ```TS
   * const pagingSize = 10;
   * const provider = new ContentDataProvider({ imodel, ruleset, displayType, pagingSize});
   * // only one backend request is made for the two following requests:
   * provider.getContentSetSize();
   * provider.getContent({ start: 0, size: pagingSize });
   * ```
   */
  pagingSize?: number;

  /**
   * Auto-update content when ruleset, ruleset variables or data in the iModel changes.
   * @alpha
   */
  enableContentAutoUpdate?: boolean;
}

/**
 * Base class for all presentation-driven content providers.
 * @public
 */
export class ContentDataProvider implements IContentDataProvider {
  private _imodel: IModelConnection;
  private _rulesetRegistration: RulesetRegistrationHelper;
  private _displayType: string;
  private _keys: KeySet;
  private _previousKeysGuid: string;
  private _selectionInfo?: SelectionInfo;
  private _pagingSize?: number;
  private _diagnosticsOptions?: DiagnosticsOptionsWithHandler;

  /** Constructor. */
  constructor(props: ContentDataProviderProps) {
    this._rulesetRegistration = new RulesetRegistrationHelper(props.ruleset);
    this._displayType = props.displayType;
    this._imodel = props.imodel;
    this._keys = new KeySet();
    this._previousKeysGuid = this._keys.guid;
    this._pagingSize = props.pagingSize;
    this._diagnosticsOptions = createDiagnosticsOptions(props);
    if (props.enableContentAutoUpdate) {
      Presentation.presentation.onIModelContentChanged.addListener(this.onIModelContentChanged);
      Presentation.presentation.rulesets().onRulesetModified.addListener(this.onRulesetModified);
      Presentation.presentation.vars(this._rulesetRegistration.rulesetId).onVariableChanged.addListener(this.onRulesetVariableChanged);
    }
    this.invalidateCache(CacheInvalidationProps.full());
  }

  /** Destructor. Must be called to clean up.  */
  public dispose() {
    Presentation.presentation.onIModelContentChanged.removeListener(this.onIModelContentChanged);
    Presentation.presentation.rulesets().onRulesetModified.removeListener(this.onRulesetModified);
    Presentation.presentation.vars(this._rulesetRegistration.rulesetId).onVariableChanged.removeListener(this.onRulesetVariableChanged);
    this._rulesetRegistration.dispose();
  }

  /** Display type used to format content */
  public get displayType(): string { return this._displayType; }

  /**
   * Paging options for obtaining content.
   * @see `ContentDataProviderProps.pagingSize`
   */
  public get pagingSize(): number | undefined { return this._pagingSize; }
  public set pagingSize(value: number | undefined) { this._pagingSize = value; }

  /** IModel to pull data from */
  public get imodel(): IModelConnection { return this._imodel; }
  public set imodel(imodel: IModelConnection) {
    if (this._imodel === imodel)
      return;

    this._imodel = imodel;
    this.invalidateCache(CacheInvalidationProps.full());
  }

  /** Id of the ruleset to use when requesting content */
  public get rulesetId(): string { return this._rulesetRegistration.rulesetId; }
  public set rulesetId(value: string) {
    if (this.rulesetId === value)
      return;

    this._rulesetRegistration = new RulesetRegistrationHelper(value);
    this.invalidateCache(CacheInvalidationProps.full());
  }

  /** Keys defining what to request content for */
  public get keys() { return this._keys; }
  public set keys(keys: KeySet) {
    if (keys.guid === this._previousKeysGuid)
      return;

    this._keys = keys;
    this._previousKeysGuid = this._keys.guid;
    this.invalidateCache(CacheInvalidationProps.full());
  }

  /** Information about selection event that results in content change */
  public get selectionInfo() { return this._selectionInfo; }
  public set selectionInfo(info: SelectionInfo | undefined) {
    if (this._selectionInfo === info)
      return;

    this._selectionInfo = info;
    this.invalidateCache(CacheInvalidationProps.full());
  }

  /**
   * Invalidates cached content.
   */
  protected invalidateCache(props: CacheInvalidationProps): void {
    if (props.descriptor && this.getDefaultContentDescriptor) {
      this.getDefaultContentDescriptor.cache.keys.length = 0;
      this.getDefaultContentDescriptor.cache.values.length = 0;
    }
    if (props.descriptorConfiguration && this.getContentDescriptor) {
      this.getContentDescriptor.cache.keys.length = 0;
      this.getContentDescriptor.cache.values.length = 0;
    }
    if ((props.content || props.size) && this._getContentAndSize) {
      this._getContentAndSize.cache.keys.length = 0;
      this._getContentAndSize.cache.values.length = 0;
    }
  }

  private createRequestOptions(): RequestOptionsWithRuleset<IModelConnection, RulesetVariable> {
    return {
      imodel: this._imodel,
      rulesetOrId: this._rulesetRegistration.rulesetId,
      ...(this._diagnosticsOptions ? { diagnostics: this._diagnosticsOptions } : undefined),
    };
  }

  /**
   * Called to configure the content descriptor. This is the place where concrete
   * provider implementations can control things like sorting, filtering, hiding fields, etc.
   *
   * The default method implementation takes care of hiding properties. Subclasses
   * should call the base class method to not lose this functionality.
   *
   * @deprecated Derived classes should override [[getDescriptorOverrides]] to customize content
   */
  protected configureContentDescriptor(descriptor: Readonly<Descriptor>): Descriptor {
    const fields = descriptor.fields.slice();
    const fieldsCount = fields.length;
    for (let i = fieldsCount - 1; i >= 0; --i) {
      const field = fields[i];
      // eslint-disable-next-line deprecation/deprecation
      if (this.shouldExcludeFromDescriptor(field))
        fields.splice(i, 1);
    }
    return new Descriptor({ ...descriptor, fields });
  }

  /**
   * Called to check whether the content descriptor needs advanced configuration. If yes,
   * descriptor is requested from the backend and `configureContentDescriptor()` is called
   * to configure it before requesting content. If not, the provider calls
   * `getDescriptorOverrides()` to get basic configuration and immediately requests
   * content - that saves a trip to the backend.
   *
   * @deprecated Derived classes should override [[getDescriptorOverrides]] to customize content
   */
  protected shouldConfigureContentDescriptor(): boolean { return true; }

  /**
   * Called to check if content should be requested even when `keys` is empty. If this
   * method returns `false`, then content is not requested and this saves a trip
   * to the backend.
   */
  protected shouldRequestContentForEmptyKeyset(): boolean { return false; }

  /**
   * Called to check whether the field should be excluded from the descriptor.
   * @deprecated Derived classes should override [[getDescriptorOverrides]] to customize content
   */
  protected shouldExcludeFromDescriptor(field: Field): boolean {
    // eslint-disable-next-line deprecation/deprecation
    return this.isFieldHidden(field);
  }

  /**
   * Called to check whether the field should be hidden.
   * @deprecated Derived classes should override [[getDescriptorOverrides]] to customize content
   */
  protected isFieldHidden(_field: Field): boolean { return false; }

  /**
   * Get the content descriptor overrides.
   *
   * **Note:** The method is only called if `shouldConfigureContentDescriptor()` returns `false` -
   * in that case when requesting content we skip requesting descriptor and instead just pass
   * overrides.
   */
  protected getDescriptorOverrides(): DescriptorOverrides {
    return { displayType: this.displayType };
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private getDefaultContentDescriptor = memoize(async (): Promise<Descriptor | undefined> => {
    // istanbul ignore if
    if (this.keys.size > DEFAULT_KEYS_BATCH_SIZE) {
      const msg = `ContentDataProvider.getContentDescriptor requesting descriptor with ${this.keys.size} keys which
        exceeds the suggested size of ${DEFAULT_KEYS_BATCH_SIZE}. Possible "HTTP 413 Payload Too Large" error.`;
      Logger.logWarning(PresentationComponentsLoggerCategory.Content, msg);
    }
    return Presentation.presentation.getContentDescriptor({
      ...this.createRequestOptions(),
      displayType: this._displayType,
      keys: this.keys,
      selection: this.selectionInfo,
    });
  });

  /**
   * Get the content descriptor.
   */
  public getContentDescriptor = memoize(async (): Promise<Descriptor | undefined> => {
    if (!this.shouldRequestContentForEmptyKeyset() && this.keys.isEmpty)
      return undefined;

    const descriptor = await this.getDefaultContentDescriptor();
    if (!descriptor)
      return undefined;

    // eslint-disable-next-line deprecation/deprecation
    return this.configureContentDescriptor(descriptor);
  });

  /**
   * Get the number of content records.
   */
  public async getContentSetSize(): Promise<number> {
    const paging = undefined !== this.pagingSize ? { start: 0, size: this.pagingSize } : undefined;
    const contentAndSize = await this._getContentAndSize(paging);
    return contentAndSize?.size ?? 0;
  }

  /**
   * Get the content.
   * @param pageOptions Paging options.
   */
  public async getContent(pageOptions?: PageOptions): Promise<Content | undefined> {
    if (undefined !== pageOptions && pageOptions.size !== this.pagingSize) {
      const msg = `ContentDataProvider.pagingSize doesn't match pageOptions in ContentDataProvider.getContent call.
        Make sure you set provider's pagingSize to avoid excessive backend requests.`;
      Logger.logWarning(PresentationComponentsLoggerCategory.Content, msg);
    }
    const contentAndSize = await this._getContentAndSize(pageOptions);
    return contentAndSize?.content;
  }

  /**
   * Get field using PropertyRecord.
   */
  public async getFieldByPropertyRecord(propertyRecord: PropertyRecord): Promise<Field | undefined> {
    const descriptor = await this.getContentDescriptor();
    return descriptor ? findField(descriptor, propertyRecord.property.name) : undefined;
  }

  private _getContentAndSize = memoize(async (pageOptions?: PageOptions): Promise<{ content: Content, size: number } | undefined> => {
    if (!this.shouldRequestContentForEmptyKeyset() && this.keys.isEmpty)
      return undefined;

    let descriptorOverrides: DescriptorOverrides;
    if (this.shouldConfigureContentDescriptor()) { // eslint-disable-line deprecation/deprecation
      const descriptor = await this.getContentDescriptor();
      if (!descriptor)
        return undefined;
      descriptorOverrides = descriptor.createDescriptorOverrides();
    } else {
      descriptorOverrides = this.getDescriptorOverrides();
    }

    // istanbul ignore if
    if (this.keys.size > DEFAULT_KEYS_BATCH_SIZE) {
      const msg = `ContentDataProvider.getContent requesting with ${this.keys.size} keys which
        exceeds the suggested size of ${DEFAULT_KEYS_BATCH_SIZE}. Possible "HTTP 413 Payload Too Large" error.`;
      Logger.logWarning(PresentationComponentsLoggerCategory.Content, msg);
    }

    const requestSize = undefined !== pageOptions && 0 === pageOptions.start && undefined !== pageOptions.size;
    const options = {
      ...this.createRequestOptions(),
      descriptor: descriptorOverrides,
      keys: this.keys,
      paging: pageOptions,
    };

    if (requestSize)
      return Presentation.presentation.getContentAndSize(options);

    const content = await Presentation.presentation.getContent(options);
    return content ? { content, size: content.contentSet.length } : undefined;
  }, { isMatchingKey: MemoizationHelpers.areContentRequestsEqual as any });

  private onContentUpdate() {
    // note: subclasses are expected to override `invalidateCache` and notify components about
    // the changed content so components know to reload
    this.invalidateCache(CacheInvalidationProps.full());
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onIModelContentChanged = (args: IModelContentChangeEventArgs) => {
    if (args.rulesetId === this.rulesetId && args.imodelKey === this.imodel.key)
      this.onContentUpdate();
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onRulesetModified = (curr: RegisteredRuleset) => {
    if (curr.id === this.rulesetId)
      this.onContentUpdate();
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onRulesetVariableChanged = () => {
    this.onContentUpdate();
  };

}

class MemoizationHelpers {
  public static areContentRequestsEqual(lhsArgs: [PageOptions?], rhsArgs: [PageOptions?]): boolean {
    // istanbul ignore next
    if ((lhsArgs[0]?.start ?? 0) !== (rhsArgs[0]?.start ?? 0))
      return false;
    // istanbul ignore next
    if ((lhsArgs[0]?.size ?? 0) !== (rhsArgs[0]?.size ?? 0))
      return false;
    return true;
  }
}
