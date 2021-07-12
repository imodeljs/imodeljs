# Change Log - @bentley/presentation-components

This log was last generated on Tue, 06 Jul 2021 22:08:34 GMT and should not be manually modified.

## 2.17.1
Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0
Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Move `immer` from `devDependencies` into `dependencies`.
- `usePresentationTreeNodeLoader`: Fix change in props not being properly reflected when hierarchy auto-update is enabled.
- Updated table/DataProvider so that it would find sameInstance nested properties and extract their values/fields when needed.
- `usePropertyDataProviderWithUnifiedSelection`: Add selected element count to the return value.

## 2.16.9
Tue, 06 Jul 2021 22:08:34 GMT

_Version update only_

## 2.16.8
Fri, 02 Jul 2021 17:40:46 GMT

_Version update only_

## 2.16.7
Mon, 28 Jun 2021 18:13:04 GMT

_Version update only_

## 2.16.6
Mon, 28 Jun 2021 13:12:55 GMT

_Version update only_

## 2.16.5
Fri, 25 Jun 2021 16:03:01 GMT

_Version update only_

## 2.16.4
Wed, 23 Jun 2021 17:09:07 GMT

_Version update only_

## 2.16.3
Wed, 16 Jun 2021 20:29:32 GMT

_Version update only_

## 2.16.2
Thu, 03 Jun 2021 18:08:11 GMT

_Version update only_

## 2.16.1
Thu, 27 May 2021 20:04:22 GMT

_Version update only_

## 2.16.0
Mon, 24 May 2021 15:58:39 GMT

### Updates

- Added ability to get diagnostics data when using presentation data providers (tree, property grid, table).
- Fix wrong colors being assigned to objects created using presentation rules
- Fix `PresentationPropertyDataProvider` not working after Presentation re-initialization
- Drop lodash dependency
- Fix nested fields' enum info not being carried to PropertyRecords
- Add `PresentationPropertyDataProvider.getPropertyRecordInstanceKeys` function to find keys of instance that is the source of given `PropertyRecord`.
- Sort categories and fields in table and property data providers based on priority and label rather than name.
- Release tags' review
- Set renderer and editor for deeply nested `PropertyRecord` instances.
- Add support for custom property category renderers.

## 2.15.6
Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5
Thu, 20 May 2021 15:06:26 GMT

_Version update only_

## 2.15.4
Tue, 18 May 2021 21:59:07 GMT

_Version update only_

## 2.15.3
Mon, 17 May 2021 13:31:38 GMT

_Version update only_

## 2.15.2
Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1
Wed, 05 May 2021 13:18:31 GMT

_Version update only_

## 2.15.0
Fri, 30 Apr 2021 12:36:58 GMT

### Updates

- Refactor the way presentation type of content is mapped to UI type of content. This is a more flexible approach and allowed to fix invalid properties display when an element had multiple aspects with categorized properties.
- Change hierarchy auto updating after iModel data changes to reload only nodes visible in the tree
- Disable hierarchy preloading
- Fix compatibility issue when multiple versions of `rxjs` are in use.

## 2.14.4
Thu, 22 Apr 2021 21:07:33 GMT

_Version update only_

## 2.14.3
Thu, 15 Apr 2021 15:13:16 GMT

_Version update only_

## 2.14.2
Thu, 08 Apr 2021 14:30:09 GMT

_Version update only_

## 2.14.1
Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0
Fri, 02 Apr 2021 13:18:42 GMT

### Updates

- Apply unified selection on newly created viewports
- Added expanded nodes tracking in trees using usePresentationTreeNodeLoader with enabled hierarchy auto update
- Changed `PresentationManager` to **not** set link information on created `PropertyRecords`. Default behavior should be handled by UI components. Custom behavior can be injected by overriding data providers that return the records.
- Always set `PropertyDescription.typename` to lowercase when creating content.
-  Handle partial hierarchy updates without loosing tree state.

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Fixed broken double angle bracket link syntax
- Updated to use TypeScript 4.1
- begin rename project from iModel.js to iTwin.js

## 2.12.3
Mon, 08 Mar 2021 15:32:00 GMT

_Version update only_

## 2.12.2
Wed, 03 Mar 2021 18:48:53 GMT

_Version update only_

## 2.12.1
Tue, 23 Feb 2021 20:54:45 GMT

_Version update only_

## 2.12.0
Thu, 18 Feb 2021 22:10:13 GMT

### Updates

- Ignore update records for unrelated iModels.
- Added IFilteredPresentationTreeDataProvider interface

## 2.11.2
Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1
Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0
Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Minimaly changed `FavoritePropertiesDataFilterer` interface, to match new `PropertyDataFiltererBase`, added some more `FavoritePropertiesDataFilterer` testing
- Add `InstanceKeyValueRenderer`.
- Updated PresentationLabelsProvider to send requests in batches
- Add class information to navigation properties
- Add `UnifiedSelectionContext`.

## 2.10.3
Fri, 08 Jan 2021 18:34:03 GMT

_Version update only_

## 2.10.2
Fri, 08 Jan 2021 14:52:02 GMT

_Version update only_

## 2.10.1
Tue, 22 Dec 2020 00:53:38 GMT

_Version update only_

## 2.10.0
Fri, 18 Dec 2020 18:24:01 GMT

### Updates

- Add support for custom property value renderers

## 2.9.9
Sun, 13 Dec 2020 19:00:03 GMT

_Version update only_

## 2.9.8
Fri, 11 Dec 2020 02:57:36 GMT

_Version update only_

## 2.9.7
Wed, 09 Dec 2020 20:58:23 GMT

_Version update only_

## 2.9.6
Mon, 07 Dec 2020 18:40:48 GMT

_Version update only_

## 2.9.5
Sat, 05 Dec 2020 01:55:56 GMT

_Version update only_

## 2.9.4
Wed, 02 Dec 2020 20:55:40 GMT

_Version update only_

## 2.9.3
Mon, 23 Nov 2020 20:57:56 GMT

_Version update only_

## 2.9.2
Mon, 23 Nov 2020 15:33:50 GMT

_Version update only_

## 2.9.1
Thu, 19 Nov 2020 17:03:42 GMT

_Version update only_

## 2.9.0
Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Fix property data provider including member-less structs and arrays into content

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

_Version update only_

## 2.7.6
Wed, 11 Nov 2020 16:28:23 GMT

_Version update only_

## 2.7.5
Fri, 23 Oct 2020 16:23:50 GMT

_Version update only_

## 2.7.4
Mon, 19 Oct 2020 17:57:02 GMT

_Version update only_

## 2.7.3
Wed, 14 Oct 2020 17:00:59 GMT

_Version update only_

## 2.7.2
Tue, 13 Oct 2020 18:20:39 GMT

_Version update only_

## 2.7.1
Thu, 08 Oct 2020 13:04:35 GMT

_Version update only_

## 2.7.0
Fri, 02 Oct 2020 18:03:32 GMT

### Updates

- Export `DEFAULT_PROPERTY_GRID_RULESET` as @beta
- Added filtering exports
- `ContentDataProvider` implementations now always use `DescriptorOverrides` when requesting content rather than switching between `DescriptorOverrides` and `Descriptor`. Simplifies the logic and makes the requests more efficient.

## 2.6.5
Sat, 26 Sep 2020 16:06:34 GMT

_Version update only_

## 2.6.4
Tue, 22 Sep 2020 17:40:07 GMT

_Version update only_

## 2.6.3
Mon, 21 Sep 2020 14:47:10 GMT

_Version update only_

## 2.6.2
Mon, 21 Sep 2020 13:07:44 GMT

_Version update only_

## 2.6.1
Fri, 18 Sep 2020 13:15:09 GMT

_Version update only_

## 2.6.0
Thu, 17 Sep 2020 13:16:12 GMT

### Updates

- Moved ESLint configuration to a plugin
- Addressed ESLint warnings in UI packages. Fixed react-set-state-usage rule. Allowing PascalCase for functions in UI packages for React function component names.
- Implemented favorite property filter.
- Added usePropertyDataProviderWithUnifiedSelection Hook

## 2.5.5
Wed, 02 Sep 2020 17:42:23 GMT

### Updates

- Update rxjs dependency version to `^6.6.2`

## 2.5.4
Fri, 28 Aug 2020 15:34:15 GMT

_Version update only_

## 2.5.3
Wed, 26 Aug 2020 11:46:00 GMT

_Version update only_

## 2.5.2
Tue, 25 Aug 2020 22:09:08 GMT

_Version update only_

## 2.5.1
Mon, 24 Aug 2020 18:13:04 GMT

_Version update only_

## 2.5.0
Thu, 20 Aug 2020 20:57:10 GMT

### Updates

- WIP: Update components' UI when rulesets, ruleset variables or iModel data changes.
- lock down @types/react version at 16.9.43 to prevent build error from csstype dependency
- Switch to ESLint
- Tree keyboard node selection & expansion

## 2.4.2
Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1
Fri, 07 Aug 2020 19:57:43 GMT

_Version update only_

## 2.4.0
Tue, 28 Jul 2020 16:26:24 GMT

_Version update only_

## 2.3.3
Thu, 23 Jul 2020 12:57:15 GMT

_Version update only_

## 2.3.2
Tue, 14 Jul 2020 23:50:36 GMT

_Version update only_

## 2.3.1
Mon, 13 Jul 2020 18:50:14 GMT

_Version update only_

## 2.3.0
Fri, 10 Jul 2020 17:23:14 GMT

### Updates

- geometry clip containment
- Fix useControlledTreeFiltering hook to react to dataProvider changes.
- Expose logger categories similar to how it's done in core
- Add ability to swap data source used by `PresentationTreeDataProvider`
- Add support for nested property categories. Can be enabled by setting `PresentationPropertyDataProvider.isNestedPropertyCategoryGroupingEnabled = true`

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Set paging size for ContentDataProvider to avoid requesting whole content on first request
- BREAKING CHANGE: Change `PresentationTreeNodeLoaderProps` to derive from `PresentationTreeDataProviderProps`. This changes paging attribute name from `pageSize` to `pagingSize`.

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Add ability to append grouping node children counts to their label
- Remove memoized values in TreeDataProvider when Ruleset variables changes
- Added ability for apps to display Favorite properties in Element Tooltip & Card at Cursor

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- Clean up deprecated APIs
- Change argument lists to props object
- Make all IPresentationDataProviders extend IDisposable
- Memoize just the last request instead of everything in presentation data providers
- Register localization namespace during Presentation frontend initialization
- PresentationPropertyDataProvider provides data having sorted favorite properties using FavoritePropertiesManager
- Separate tests from source
- Refatored UnifiedSelectionTreeEventHandler to use inheritance instead of composition
- Apply unified selection for modified tree nodes
- Made React functional component specifications consistent across UI packages
- Upgrade to Rush 5.23.2
- Moved Property classes and interfaces to ui-abstract package.
- Remove support for the iModel.js module system by no longer delivering modules.

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- Refatored UnifiedSelectionTreeEventHandler to use inheritance instead of composition

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Fix nested content records being duplicated if all nested fields have their own category definitions
- PresentationTableDataProvider should create column for display label when display type is 'List'
- Ignore barrel file on docs processing
- Added nodeLoadHandler to usePresentationNodeLoader props
- Avoid handling whole tree model when handling model change event in UnifiedSelectionTreeEventHandler
- Set label and labelDefinition when creating PropertyData and TreeNodeItem

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Create PropertyRecord to represent TreeNodeItem label if node's LabelDefinition is provided
- Upgrade to TypeScript 3.7.2.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Apply unified selection in ControlledTree after selection event is handled.

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Exposed UnifiedSelectionTreeEventHandler and made it more customizable
- Handle newly introduced multi-ECInstance nodes
- Added a favorite property data provider.
- Make `rulesetId` for PropertyGridDataProvider optional
- Avoid duplicate `PropertyRecord` names when content has multiple `Field`s with the same name nested under different parent fields.
- No longer accessing this.state or this.props in setState updater - flagged by lgtm report
- Changed ControlledTree specific hooks and HOCs release tags to beta
- Adjusted UnifiedSelectionTreeEventHandler according changes to ControlledTree events
- Added useRulesetRegistration hook and refactores usePresentationNodeLoader hook

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Fix property data provider failing to create data when content includes empty nested content values
- Tablet responsive UI
- Add usePresentationNodeLoader custom hook
- Added custom hook and HOC that adds filtering support to ControlledTree

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Added logic to set the scope of Favorite Properties in DataProvider.
- Disable filtering of table columns created by PresentationTableDataProvider until the provider supports filtering
- Added useUnifiedSelection hook to enabled unified selection in ControlledTree

## 1.6.0
Wed, 09 Oct 2019 20:28:42 GMT

### Updates

- Fix broken `IPresentationTreeDataProvider` API by making `loadHierarchy` optional.
- Handle categorized fields inside nested content

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- Implemented favorite properties logic in PresentationPropertyDataProvider
- Add a helper method `IPresentationTreeDataProvider.loadHierarchy()`
- Added autoExpand property to RelatedPropertiesSpecification and NestedContentField
- Add module descriptions
- Upgrade to TypeScript 3.6.2

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

_Version update only_

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Fix invalid double display values in similar instances provider description
- Use the new `RulesetsFactory.createSimilarInstancesRulesetAsync` to produce 'similar instances' ruleset. Use type converters to calculate display values used in 'similar instances' provider description.
- Added test for ContentBuilder to verify that links property is set for nested PropertyRecord.
- Added checking for links in the ContentBuilder with tests for it.

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

_Version update only_

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Reorganize docs script output
- Include !lib/**/*.*css in .npmignore for presentation-components to includes css files in lib/module/prod
- `treeWithFilteringSupport` HOC now sends the filtered data provider as the second parameter to `onFilterApplied` prop callback
- Moved the part that determines hilite set out of `presentation-components` to `presentation-frontend` and expose it as a public API.
- Clear tool selection set when models or categories are selected. Replace tool selection set with new selection when elements are selected.
- Always clear tool selection set when applying unified selection. If there're elements in logical selection, they're added to selection set afterwards.
- Do not clear selection set before replacing it - this causes unnecessary onChanged events
- Implement hiliting for selected subjects, models and categories
- Update to TypeScript 3.5
- Fix `autoExpand` flag not being set for `TreeNodeItem`s

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Add transient element IDs from selection into hilite list when syncing
- Disable default hilite list syncing with tool selection set when using unified selection
- Set extended data when creating UI objects
- Change the way `TreeNodeItem` key is stored inside the object. Instead of using `extendedData`, now we use an undefined property on the `TreeNodeItem` itself. This should help us avoid the key being overwritten in the `extendedData` and makes `extendedData` usable for other purposes, e.g. storing some user's data.
- Add release tags
- Mark `ViewWithUnifiedSelectionProps.ruleset` as @alpha
- Improve warnings about unset `pagingSize` property

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Added ViewportSelectionHandler to the barrel file
- Adds parameter for api-extractor to validate missing release tags
- Fix broken links
- Put sourcemap in npm package.
- Forward React.Ref from TreeWithUnifiedSelection HOC
- Fix marshaling class instances through RPC by removing use of Readonly
- Add APIs to retrieve instance labels
- Avoid making a backend request when we know there will be no content
- Do not load property grid data if more than 100 (configurable) elements are selected
- Fix a warning in `propertyGridWithUnifiedSelection` due to state being set after unmounting component
- Add `IPresentationTableDataProvider.getRowKey` method
- `viewWithUnifiedSelection` was refactored to only do 1 way synchronization: logical selection -> iModel hilite list
- Supply default presentation ruleset for the viewports hilite list when using the `viewWithUnifiedSelection` HOC
- Avoid making a descriptor request when requesting content for property grid and hilite list
- Require React & React-dom 16.8
- Remove IModelApp subclasses
- Temporarily disable hiliting model and category elements until a more performant way to do that exists
- Upgrade TypeDoc dependency to 0.14.2

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Fix test scripts for unix systems
- Set `TreeNodeItem.icon` when initializing it from presentation `Node` object

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Changes package.json to include api-extractor and adds api-extractor.json
- Use new buildIModelJsBuild script
- Exported ContentBuilder and ContentDataProvider
- Remove unneeded typedoc plugin dependency
- Expose presentation-specific content request methods through IContentDataProvider so they're available for provider consumers
- Save BUILD_SEMVER to globally accessible map
- Change `DataProvidersFactory.createSimilarInstancesTableDataProvider` to return data provider that also has a description
- Add DataProvidersFactory API for creating presentation data providers targeted towards specific use cases
- (breaking) Change PresentationTableDataProvider's constructor to accept a props object instead of multiple arguments
- Make all content data providers IDisposable. **Important:** providers must be disposed after use.
- Changed the way `0` selection level is handled in unified selection tables. Previously we used to reload table data when selection changed with level below boundary __or level `0`__. Now the __underlined__ part is removed and we only reload data if selection changes with level below boundary (set through props).
- RPC Interface changes to optimize getting first page of nodes/content
- Move property definitions to imodeljs-frontend so they could be used by tools to define properties for tool settings.
- Upgrade to TypeScript 3.2.2

## 0.188.0
Wed, 16 Jan 2019 16:36:09 GMT

_Version update only_

## 0.187.0
Tue, 15 Jan 2019 15:18:59 GMT

_Version update only_

## 0.186.0
Mon, 14 Jan 2019 23:09:10 GMT

_Version update only_

## 0.185.0
Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0
Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Do not set optional TreeNodeItem properties if values match defaults
- Added interfaces for Property Pane and Table data providers.
- Changed 'connection' property name to 'imodel' in IPropertyDataProvider.
- Removed default exports in presentation-components.

## 0.183.0
Mon, 07 Jan 2019 21:49:21 GMT

_Version update only_

## 0.182.0
Mon, 07 Jan 2019 13:31:34 GMT

_Version update only_

## 0.181.0
Fri, 04 Jan 2019 13:02:40 GMT

_Version update only_

## 0.180.0
Wed, 02 Jan 2019 15:18:23 GMT

_Version update only_

## 0.179.0
Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Throttling for withUnifiedSelection(Viewport) - avoid handling intermediate selection changes
- Fix linter warnings

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0
Wed, 12 Dec 2018 17:21:31 GMT

### Updates

- Remove `selectionTarget` prop from `withUnifiedSelection(Tree)` - `SelectionTarget.Node` turned out to make no sense, so it got removed. Now the tree always works in `SelectionTarget.Instance` mode.
- Remove `selectedNodes` prop from `withUnifiedSelection(Tree)` - it makes no sense to allow specify selected nodes for a unified selection tree.
- Fix `withUnifiedSelection(Tree)` reloading on selection change to avoid `forceRefresh()` call.
- React to checkbox-related prop renames in ui-components

## 0.176.0
Mon, 10 Dec 2018 21:19:45 GMT

_Version update only_

## 0.175.0
Mon, 10 Dec 2018 17:08:55 GMT

_Version update only_

## 0.174.0
Mon, 10 Dec 2018 13:24:09 GMT

### Updates

- Remove unused dependencies, add `build:watch` script

## 0.173.0
Thu, 06 Dec 2018 22:03:29 GMT

_Version update only_

## 0.172.0
Tue, 04 Dec 2018 17:24:39 GMT

### Updates

- Changed index file name to match package name, eliminate subdirectory index files, decrease usage of default exports, change imports to use other packages' index file.

## 0.171.0
Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- PropertyRecord of type Array now also returns itemsTypeName under value property.

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- PropertyRecord of type Array now also returns itemsTypeName under value property.

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- Rename withFilteringSupport props: onHighlightedCounted -> onMatchesCounted, activeHighlightedIndex -> activeMatchIndex

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

_Version update only_

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

_Version update only_

## 0.166.0
Mon, 12 Nov 2018 16:42:10 GMT

_Version update only_

## 0.165.0
Mon, 12 Nov 2018 15:47:00 GMT

### Updates

- Unified Selection: Fix selection change events being broadcasted indefinitely when multiple unified selection viewports are used

## 0.164.0
Thu, 08 Nov 2018 17:59:21 GMT

### Updates

- Deprecated dev-cors-proxy-server and use of it.
- Fix filtered tree rendering "0 matches found" when there's no filtering applied and data provider returns 0 nodes
- Updated to TypeScript 3.1
- React to Tree API changes

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

_Version update only_

## 0.162.0
Wed, 24 Oct 2018 19:20:07 GMT

### Updates

- Handle undefined structs and arrays

## 0.161.0
Fri, 19 Oct 2018 13:04:14 GMT

_Version update only_

## 0.160.0
Wed, 17 Oct 2018 18:18:38 GMT

_Version update only_

## 0.159.0
Tue, 16 Oct 2018 14:09:09 GMT

_Version update only_

## 0.158.0
Mon, 15 Oct 2018 19:36:09 GMT

_Version update only_

## 0.157.0
Sun, 14 Oct 2018 17:20:06 GMT

### Updates

- Fixing scripts for linux

## 0.156.0
Fri, 12 Oct 2018 23:00:10 GMT

### Updates

- Initial release

