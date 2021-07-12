# Change Log - @bentley/ui-components

This log was last generated on Tue, 06 Jul 2021 22:08:34 GMT and should not be manually modified.

## 2.17.1
Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0
Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Allow style to be passed to weight picker.
- Fix array and struct property contents not being rendered in property grid when the properties have `hideCompositePropertyLabel` flag.
- Added `mergedCellsCount` property to `CellItem`. It is used for determining width of the cell.
- Added `overflow` property for `react-grid-Cell__value` element. `zIndex` is set in `TableCellContent` style property. These updates are necessary for rendering merged cells in `Table` component.
- Updated `Table` component so that it would be possible to merge cells in it
- Update scss to remove use of slash for division to avoid SASS deprecation warnings.
- Publis in-use APIs
- Refactor TimelineComponent to remove experimental milestones feature.
- `TreeRenderer`: Fix tree nodes being loaded repeatedly in some cases.
- `VirtualizedPropertyGrid`: Remove top and bottom padding.
- `VirtualizedPropertyGridWithDataProvider`: Fix loading animation overflowing its parent container.

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

- Add support for child popup windows.
- Add ability to not render array/struct property label in virtualized property grid
- Add support for custom property category renderers.
- Improved Multi-Value column filtering in the Table component
- Move `VirtualizedPropertyGrid` related types from @alpha to @beta.
- Fixed getting distinct values when Table rows are updated
- Update to latest classnames package

## 2.15.6
Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5
Thu, 20 May 2021 15:06:26 GMT

### Updates

- Fixed getting distinct values when Table rows are updated

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

- Update to use UiSettingsStorage.
- Fix color picker hue display in DR by removing webkit prefix. Adjust max slider value.
- 'TreeModel': Fixed 'changeNodeId' to set new id on TreeModelNode
- 'TreeNodeLoader': Changed nodes loading to avoid removing subtrees of existing expanded nodes
- Added ability to track rendered nodes in ControlledTree
- Fix number editor so it can process Enter key and call OnCommit processing.
- Fix compatibility issue when multiple versions of `rxjs` are in use.
- Fix a crash when clicking on a `ControlledTree` node when the tree contains placeholder nodes and using `SelectionMode.Multiple`

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

- Lower coverage to 99.98 to avoid CI breaks.
- Added handling for windows which don't open.
- Added `UrlPropertyValueRenderer` renders values for properties of `StandardTypeNames.URL` type as URLs without looking at the value
- Deprecated `onPropertyLinkClick` prop used by `VirtualizedPropertyGridWithDataProvider` and `PropertyGrid`. Behavior of clicks on `PropertyRecord` links should be customized by assigning the `links` attribute.
- update FormatPanel to ensure state was not set on unmounted component.
- Fix bug in TimelineComponent's componentDidUpdate method that caused and infinite loop.
- Support for AccuDraw Ui Settings
- `TreeModelSource`: Fix `onModelChanged` event sometimes listing same node id multiple times.
- Improved ui-components test coverage to 100%
- `TreeModel`: Expose `getChildOffset` method.
- `MutableTreeModel`: Add `moveNode` method.
- Better support for Escape key to Home position

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Updates to use new QuantityParserResult
- Upgrade react-resize-detector to avoid lodash security vulnerability
- Fixed broken double angle bracket link syntax
- Fix solar timeline component so that sunTime is properly set for project location.
- Add ui-components for displaying and editing FormatProps that are used to Format and Parse Quantities.
- Updated to use TypeScript 4.1
- Add a captureClicks prop to ColorPickerPopup that will stop propagation of click events from the popup.
- `MutableTreeModel`: Add `changeNodeId` method.
- `MutableTreeModel`: Allow `undefined` child count in `setNumChildren`.
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

- UI 'pickers' that use Popup component with fixed content should set closeOnNestedPopupOutsideClick prop.
- Consider string values starting with `pw:\` or `pw://` to be URLs without checking the rest of the string.
- `ControlledTree`: Fix calling `scrollToNode` too early triggering an assertion error.
- Update TimelineComponent.tsx to properly respond to changed props.

## 2.11.2
Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1
Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0
Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Update components that support providing refs via React.forwardRef to work better with document generation.
- Add 'showCaret' prop to ColorPickers that show a popup. The caret icon will face up or down depending of popup state.
- Updates due to quantity unit system changes.
- Lock react-select to 3.1.0 and @types/react-select to 3.0.26 until we can fi
- Created new `CategoryPropertyDataFilterer` which allows us to filter `PropertyCategory` and get matches count.
- Updated FilteringDataProvider, now it filters not only PropertyRecords, but PropertyCategories also.
- Updated `VirtualizedPropertyGrid` to pass through `HighlightedPropertyProps` and highlight `PropertyCategory` matches.
- Implemented `CategoryPropertyDataFilterer` in `presentation-test-app` -> `PropertiesWidget`
- Updated filterers to return type of the filtered item, so now `VirtualizedPropertyGrid` can distinguish what types of items need to be highlighted. This feature was implemented in `presentation-test-app` -> `PropertiesWidget`
- Update `NavigationPropertyTypeConverter` to handle navigation properties represented by `InstanceKey`
- Added ui-core learning docs content and added Notification.md, Style.md & Tooltip.md ui-core learning doc files.
- Fix test warnings.
- Update to latest react-dnd version.
- Always clone the ViewState for a ViewportComponent to avoid attaching the same ViewState to multiple viewports.

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

- Add support for onClose function in ColorPickerPopupProps. This allows color value from popup to be used by caller.
- Added matchesCount attribute to [[PropertyDataFilterResult]] to optionally tell how many matches there were in a [[PropertyRecord]]. Matches in label and value are separated.
- Added match counting functionality to [[FilteringPropertyDataProvider]]. The returned [[FilteredPropertyData]] now has total matches count and a function get information about a match at specific index.
- Added highlightedRecordProps to [[VirtualizedPropertyGridProps]] to allow highlighting specific parts of rendered PropertyRecords.
- Updated [[FilteringInput]] component. Component's `filteringInProgress` prop was deprecated and new `status` property was introduced. This allows rendering the component in any state, including `filtering finished`, without having to cycle through other states first.
- fix but in ParsedInput control where formatted text was not updating if underlying parsed value did not change.
- Refactor DialogItem and Property interfaces to make them eaiser to use.
- Added support for decimal point in Table numeric filter
- Enable pointer events in Toolbar items container."
- Fix issue where entries in ButtonGroup would not properly disable/enable.

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

### Updates

- Fix calendar logic to avoid duplicate day numbers when day light saving ends, producing a 25hr day.
- Revert width change to EnumEditor component instead set width to auto only for docked tool settings.

## 2.9.0
Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Added ParsedInput and QuantityInput controls used to parse and format numeric values.
- remove bogus "code" entries.
- Fix styling issue.
- Added FrameworkUiAdmin.showReactCard
- Change Editor components to process native keyboard events instead of synthetic ones.
- Added MessagePopup - Displays Toast & Sticky messages without a StatusBar
- Update EditorContainer tests in attempt to fix sporadic test failures.

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

### Updates

- Add Date/Time TypeEditor
- Fixed initial processing of scrollToRow in Table component
- Preventing setState call warning in TimelineComponent unit test
- Update all editors to be controlled components.
- PropertyGrid: Fix component not updating on data provider change
- Added jsdoc ESLint rule for UI packages

## 2.7.6
Wed, 11 Nov 2020 16:28:23 GMT

_Version update only_

## 2.7.5
Fri, 23 Oct 2020 16:23:51 GMT

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

- Update boolean type editors to allow component to be disabled.
- Add support for a DatePicker control.
- Update editor to use fixed focus trap.
-  Added Table cell editor activation via keyboard when using row selection. Added Tree cell editor activation via keyboard.
- Fixed react-axe initialization. Improved ui-components test coverage.
- Table cell editing via keyboard
- Add multiline text property support to property grid.
- TreeRenderer: Add ability to scroll to a specific node

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
- Implemented filtering property data provider and display value, label, composite filters.
- Added new alpha VirtualizedPropertyGrid component which virtualizes rendering of properties for better performance and gives more customizability and control.
- SplitButton popupPosition & buttonType props support
- Add event processing for apps to send messages to the UI components.
- Add ThemedEnumEditor for DialogItems and ToolSettings, using the ThemedSelect component.

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

- Fixed updating focus when Tabs activeIndex updated. More a11y issues.
- Fix styling of toolbar overflow popup.
- Update EnumerationChoicesInfo to use Promise so enum choices can be defined asynchronously.
- Add ColorPickerPopup and ColorPickerPanel and test for them.
- Added eslint-plugin-jsx-a11y devDependency and made first pass at adding a11y roles
- Added react-axe and resolved some a11y issues
- Moved SpecialKey & FunctionKey enums to ui-abstract & started using them throughout UI packages
- lock down @types/react version at 16.9.43 to prevent build error from csstype dependency
- Added Table component keyboard row selection. Miscellaneous a11y fixes.
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

### Updates

- Map Layer UX
- Add color picker dialog.
- Changed toolbar opacity processing to affect all components in widget.
- Add ImageCheckBoxEditor.
- Set border prop on ImageCheckBox when use in the editor
- Use 'Double' type converter for point components. Also add possibility to supply custom components' converter for `Point2dTypeConverter` and `Point3dTypeConverter`.
- Use Tooltip and Popup for timeline and toolbars.

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
- Fix ToolbarWithOverflow to honor ToolbarOpacitySetting.Defaults
- Accessibility: Improved focus borders & indicators
- Use DelayedSpinned in ControlledTree.
- Add support for nested property categories
- Show tooltips for property values when rendering PropertyRecords
- Changing SelectableContent component to use ThemedSelect in place of a pure HTML select element

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Qualified the CSS class names for the face names in Cube Navigation Aid
- Hiding viewport logo and acsTriad in DrawingNavigationAid viewport
- Added property editors for multi-line text, slider and numeric input/spinner.
- Added support for popup with multiple editors
- Specify the props that can be passed to ThemedSelect instead of just allowing all of the react-select props.
- Added ViewStateProp & support for obtaining ViewState from function in ViewportComponent and IModelViewportControl

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Fix toolbar overflow panel display.
- Update to only show group separators if toolbar is not transparent.
- Fix toolbar error when scaling up UI.
- Property grid horizontal layout updated according to UX requirements.
- Fixed Table filter renderers after react-select version upgrade
- Support for striped rows in Table
- Added ability for apps to display Favorite properties in Element Tooltip & Card at Cursor
- Darken node descriptions in controlled tree
- Center align ControlledTree error message
- ControlledTree: Grow virtualized nodes' container width to fit the widest node and do not shrink it to avoid horinzontal scrollbar appearing/disappearing
- Update version of react-select for ThemedSelect in ui-core.
- ControlledTree: Fix horizontal scrollbar appearing when tree component size changes even though nodes don't exceed width of the tree
- Only show badges on toolbar buttons if toolbar background is not transparent.

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- Prefer panelNode over buttonNode when using customToolbarItem.
- Add support for groupPriority for ToolbarItems. If specified then a group separator is shown when the priority changes.
- Add tilde to sass imports
- Qualified .label & .message CSS classes. Removed .cell CSS class usage. Fixed cell editor sizes.
- Fixed Navigation cube jagged edges on iOS
- Added new type of ImageSourceType "webfont-icon" which allows to load custom font-family icons by providing {className}:{iconName} format image value. It defaults to core-icon if value does not match this format.
- Fix parsing of 0 (zero) value in CustomNumberEditor
- Fix bug where toolbar buttons did not show expand arrow on custom button when not in 'DragInteraction' mode.  Fix display of key-in browser 1.0 UI.
- Fix ordering of button items in overflow in Navigation Widget.
- Ensure ui-abstract is listed as peer dependency and not just a dev dependency.
- Fix documentation tag
- Fix issue where resizing toolbar too small would make it disappear and it would not return even when window was resized.
- Fix bug 292829 where toolbar border displayed when all items are hidden.
- Fixed ReactResizeDetector usage after upgrade. Converted Toggle component to function. Hover/pressed styling in 2.0 Toolbar.
- Update GroupButton definition to use ReadonlyArray for child items.
- Ui 2.0 - Blur the toolbar item background
- Moved the CubeNavigationAid & DrawingNavigationAid to ui-components package
- Increased size of Navigation cube arrow touch targets for mobile
- Clean up deprecated APIs
- Clean up some ControlledTree-related APIs
- Clone TreeNodeItem when creating TreeModelNode to avoid immer freezing it
- Made React functional component specifications consistent across UI packages
- For consistency add reactNode getters/setters and deprecate use of reactElement.
- Upgrade to Rush 5.23.2
- Copied filter renderers from react-data-grid-addons to ui-components to prevent security error
- Fixed Table column filtering when backspacing to empty
- Ui 2.0 - Toolbar display changes
- Updated Toolbar colors/opacity for Ui 2.0
- Add ToolbarWithOverflow.
- Promoted some @beta to @public in Ui packages & ToolAssistance for 2.0 release.
- Fixes to Toggle onBlur handling & ControlledTree error message position
- Change `TreeNodeItem` and `PropertyData` labels to be PropertyRecords
- In source documentation. Some learning docs & API changes.
- PropertyGrid, Table, Tree & Viewport Learning docs for ui-components
- Fixed ControlledTree TreeModel clearing. Fixed TreeRenderer to rerender list when size callback changes.
- Update CustomNumberEditor to handle onBlur. This will update the value when the user clicks in another field in the dialog and the field loses focus.
- Move react to peerDependencies.
- Learning documentation for ui-core
- TOC for UI 2.0 Docs, @alpha to @beta, Components Examples
- Started ui-components Learning doc section
- Fixed children node loading from TreeDataProviderRaw and TreeDataProviderPromise
- Add a new `SelectableContent` component
- Changed IPropertyValueRenderer.render() to be synchronous
- UI: Toggle Component - only use animation on value change
- Fix iOS Safari high CPU of enum button group.
- Fix nodes loading to correctly handle and load ImmediatelyLoadedTreeNodeItem
- Fix SparseArray, SparseTree and MutableTreeModel to be properly modified by immer
- Update auto-generated dialog items to work with the Tool Settings Bar.
- Moved Property classes and interfaces to ui-abstract package.
- Moved Checkbox, Radio, Select, Toggle, Slider & AutoSuggest into their own category
- Update to ensure tooltip for timeline uses z-index for tooltips.
- Update to ensure tooltip for timeline uses z-index for tooltips.
- Defaulting to IModelApp.i18n in UI packages and cascading initialize() calls
- Minor styling changes
- Remove support for the iModel.js module system by no longer delivering modules.
- iModel write API development

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- Fix iOS Safari high CPU of enum button group.

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- iModel write API development
- Upgraded icons-generic-webfont to ^1.0.0
- Added type converter for composite primitive value
- Changed onNodeLoaded event to nodeLoadHandler in NodeLoader. Fixed node loading scheduling to avoid making multiple requests at the same time
- Pass tree model changes to onModelChange event
- Separate label and labelDefinition in PropertyData and TreeNodeItem
- Property grid border fix.

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Remove the @types/linkify-it as a real dependency and make it a devDependency.
- Allow TreeNodeItem and PropertyData label to be represented as PropertyRecord
- Upgrade to TypeScript 3.7.2.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Fix styling issue in property grid when actionButtonRenders are not defined.
- Fixed lgtm issues in UI folders
- Update code to up code coverage to avoid CI failures on Linux machines.
- Added Action Buttons for properties
- Attempt to fix sporadic failing solartimeline test.
- Fix bug in timeline component when view only has an analysis animation without dates.
- Update timeline test to use fake timers to see if that resolved sporadic failures on CI builds.

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Update sunrise/sunset calculation
- Update solar timeline test
- Made detecting links have stricter rules. Links have to start with a schema or `www.`.
- Fix solar timeline timezone bug.
- Added a tooltip component.
- No longer accessing this.state or this.props in setState updater - flagged by lgtm report
- Changed SignIn & SignOut buttons to large. Fixed Dialog component resizing. Reduced default minimum size of Dialog component.
- Update sinon version.
- Added documentation to ControlledTree API and changes release tags to beta
- Added node editing support in ControlledTree
- Changes ControlledTree events to pass TreeNodeItem instead of nodeId
- Added 'removeChild', 'insertChild', 'getChildOffset' methods to MutableTreeModel
- Moved ControlledTree node highlighting to TreeRenderer
- Use exhaustive-deps linter rule.
- Truncate property grid group title.
- Rename array length property label to be less ambiguous
- Solar timeline date/time offset fix.
- Start arrays at `1` when rendering array property items
- Removed unused React state variables. Removed unsupported setState calls from render() methods.
- Code cleanup based on code analysis report from lgtm.

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Update Icon package version
- Responsive logic in Property Grid to switch to Vertical orientation when too narrow
- Added StatusBarComposer, StatusBarItem, StatusBarManager and StatusBarItemsManager
- Added Table cell context menu support
- Added Tree Node.tsx export to ui-components package
- Added tslint-react-hooks to UI packages
- Change componentDidUpdate to call _setDuration instead of setState directly. This will make sure the onChange handler is called.
- Refactor ControlledTree custom hooks to use useEffectSkipFirst
- Separated TreeModelSource and TreeNodeLoader. Added highlighting support to ControlledTree.
- Added node icon rendering to ControlledTree
- Fix node content sometimes not being re-rendered when editor state changed very quickly
- Add componentDidUpdate() to the TimelineComponent, updating currentDuration after the app changes the state of initialDuration.

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Add ability to have Table provide top visible row feedback
- Made PropertyGrid categories keep the collapsed state when data is refreshed.
- Added New badge for UI items
- Added Table column filtering support
- Added initial ui-abstract package setup
- Added UiAdmin with support for displaying Menus and Toolbars at a location
- Added DataProvider getter on TreeModelSource
- Fix tree attempting to highlight empty text in nodes
- Fix tree no re-rendering delay loaded nodes after reload
- Added initial implementation of ControlledTree

## 1.6.0
Wed, 09 Oct 2019 20:28:42 GMT

### Updates

- Clear internal row/column selection data when number or rows change in Table. Add definitions for platform MeasureTools.
- Allow width defined in ColumnDescription to be passed into <Table> component to set initial column width.
- Added AutoSuggest component and improved KeyinBrowser component
- Focus EnumButtonGroupEditor without scrolling.

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- AccuDraw Popup Editors. Improved editor sizes. Editor Params improvements.
- Initial Accudraw Ui components - Buttons, ContextMenus, Calculator, Editors. IconInput in ui-core.
- Added ability to automatically expand non primitive properties
- Ability to Scroll to Table row via scrollToRow Prop
- Add alwaysMinimized prop to TimelineComponent.
- Tool Assistance changes per UX Design
- Update the tree (empty data) be more descriptive and generic.
- In the Model/Category/Spatial trees, center the error message
- Upgrade to TypeScript 3.6.2
- Fixed signature of BreadcrumbTreeUtils.aliasNodeListToTableDataProvider for consistent extract-api treatment
- Tree: Clear page caches when reloading tree data
- this.props.viewportRef(this._vp); callback moved to the end of async componentDidMount(); Additional check if (!this._mounted) after await

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

### Updates

- Using Checkbox component in BooleanEditor. Cleaned up cell editor positioning.
- Updated inputs and button padding for iModel.js. Fixed Popup colors & z-index.
- Color picker had incorrect styling after focus trap added.
- Added support for content view minSize properties
- Added support for ProjectWise Explorer links.
- Added a new component for the Poc, an icon picker.
- Addressed some warnings introduced with React 16.9
- Timeline: added display for times
- Fixed bug in style of the weight picker popup

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Update to use latest icon library
- Added CursorPrompt, improved Pointer messages
- Explicitly set margin for button groups to avoid bleed over from BWC styles.
- After canceling (clearing) search, set focus back to input field.
- Skip failing test until UI team can investigate
- Updated generic icon package
- Fix DateTime type converters
- Improve point type converters to handle points defined as `number[]` or `{x,y}` or `{x,y,z}`
- Change floating point converter to round-off numbers up to 2 decimal places
- Fixed property grid tests.
- Fixed OnPropertyLinkClick event handler assignment for nested properties in PropertyGrid. Fixed OnPropertyLinkClick signature for PropertyGrid.
- Added onPropertyLinkClick handler property for PropertyGrid with default behavior to open url links in the new tab or open email client if it is an email link. Wrote tests for it.
- Update FilteringInput to use updated search box design from UX.
- Added SelectionMode.None to the default SelectionHandler.
- Tree: Fix children not loaded when parent is reloaded due to other page loads after children request
- Update to latest icon package version.

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

### Updates

- Tree: Add `bulkCheckboxActionsDisabled` prop.
- Tree: Update visual styles.
- Table: Update visual styles.
- PropertyView: Update visual styles.

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Tree: Fix an issue whith multiselection where shift-selecting nodes would not select anything.
- Tree: Add ability to check or uncheck multiple selected nodes' checkboxes all at once.
- BeInspireTree: Fix an issue with calling `updateNodesCheckboxes()` while handling `ModelLoaded` event
- Tree: Correct TreeProps.checkboxInfo documentation.
- Allow Line Weight to be selected via Up/Down arrow keys once popup is open.
- Updated react-data-grid import statement
- Added prefixes to Dialog & ContextMenu positioning CSS classes
- Removed missing group descriptions
- Call filterclear when the user enters an empty search string and clicks Search.
- Added autofocus to the FilteringInput component.
- Remove inner focus outline that is only displayed in Firefox.
- Update WeightPicker.
- Removed 4 dangerouslySetInnerHtml usages to help with Security audit; 3 remain on purpose.
- Save & Restore View Layouts
- Update to TypeScript 3.5
- Temporarily lowered ui-components coverage thresholds
- BeInspireTree: Fix an issue with delay-loaded child nodes sometimes being assigned to expired node objects.
- Tree: Fix child node checkbox events affecting parent node's checkbox state
- ui-component unit tests. NumericInput strict=true default.

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Update to use parse error message from callback.
- Added UI Logger & UiError usage & improved i18n calls
- Added Overflow button support
- Define `extendedData` in `TreeNodeItem` and `RowItem` as a key-value pairs structure. We're about to expose this structure to external consumers and don't want them to set `extendedData` to some primitive value. Instead, consumers should put key-value pairs with keys unique enough to not overwrite others' values.
- Update CustomNumberEditor to show InputFieldMessage when unable to parse quantity.
- Release tag cleanup and ui-framework unit tests
- Updated UI package release tags for 1.0 release.
- Fixed release tag warnings in UI packages
- Add alpha level support for solar timeline
- Added property selection to the property grid component on right click
- Update Tree API. Allow onCheckboxClick callback to receive multiple checkbox state changes.
- Tree: Fix node placeholder offset
- Added ViewSelectorChangedEvent

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Update to latest version of icon library.
- @beta tags for Toolbar. More React.PureComponent usage. Added constructors to prevent deprecated warnings. Coverage minimum thresholds.
- Add support for a view overlay component. This will provide ability to show animation timeline control in viewport.
- Update Timeline interfaces.
- Update CSS for ColorSwatch.
- Add Unit test for ColorEditor and ColorPickerButton
- Added CommonProps to many component Props in ui-core & ui-components
- Added 'Register' link back to SignIn component. Added ExternalIModel test widget. Made AppBackstage in ui-test-app Redux connected again.
- Added missing package prefix to some CSS class names in ui-core, ui-components & ui-framework
- Reverted CubeNavigationAid changes
- Added viewport synchronization for 2d drawing navigation aid
- Added local snapshot support to ui-test-app. Added specialized div components to ui-core.
- Fix broken links
- Fix failing CustomNumberPropertyEditor test
- Add WeightEditor line weight type editor.
- Add components to show and select a line weight.
- Put sourcemap in npm package.
- Locked react-data-grid at 6.0.1 and @types/react-data-grid at 4.0.2
- Improve default rotate point for navigation cube
- Fix to SignIn constructor in ui-components
- Added SignIn presentational component to ui-components. Removed --ignoreMissingTags extract-api option.
- Require React & React-dom 16.8
- remove IModelApp subclasses
- Added ViewportDialog in ui-test-app, ui-core/ContributeGuidelines.md. TSLint rules in ui-core for no-default-export & completed-docs. @beta release tags.
- Update icons-generic-webfont version to latest available.
- Clean up WeightPickerButton test code.
- Introduce timeline animation interfaces.
- Move timeline components from ui-test-app to ui-components package
- Added release tags to ui-framework, ui-components and ui-core.
- Property Grid: Show loading spinner only after half a second delay
- Fix indefinite Tree component rendering when used with `checkboxInfo` prop
- Tree: Fix nodes not being re-rendered in some async workflows
- Fix tree being marked as dirty when selected nodes predicate changes, but returns the same results (actual selection doesn't change)
- Add Tree.getLoadedNode(nodeId) function
- Add ability to set tooltips on tree node checkboxes
- Unit tests and fixed ColorEditor alignment
- Upgrade TypeDoc dependency to 0.14.2
- Added test coverage for ViewportComponent

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Add ColorEditor to list of available Type Editors
- Cleaned up index.scss for variables & mixins in ui-core and added classes.scss that generates CSS
- Add SaturationPicker for use with ColorType editor.
- Add Transparency slider component.

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- UI documentation fixes
- Added ToggleEditor. Support for defaultTool in Frontstage. Fixed BooleanEditor sizing.
- Added 100% test coverage for Breadcrumb/BreadcrumbDetails
- Use new buildIModelJsBuild script
- Remove unneeded typedoc plugin dependency
- Added EnumEditor & BooleanEditor type editors
- Minor UI Color Theme changes
- Support for including CSS files in published UI packages
- Updated type editors to support updated PropertyRecord. Moved setFocus to props in type editors..
- Removed dependency on BWC. Parts of BWC copied into ui-core in preparation for theming support.
- Added ToggleEditor. Support for defaultTool in Frontstage.
- Save BUILD_SEMVER to globally accessible map
- Change setImmediate to setTimeout. Fixed cube rotation issue.
- Added ItemStyle and ItemStyle provider.
- CellItem and TreeNodeItem now have the same style property.
- Added TableCell and TableCellContent React components.
- Changed table css class names.
- Changed CellItem interface property - 'alignment' type to be a restricted string instead of an enum.
- Cleanup of DefaultToolSetting provider and EnumButtonGroup editor
- Add EnumButtonGroupEditor.
- Primitive property value renderers now render links specified in property records.
- Renamed class names that start with "ui-components-" to start with just "components-"
- Added IImageLoader, ImageRenderer and TreeImageLoader.
- Added showIcons and imageLoader props to Tree component.
- Added a property to provide rowHeight value or function that calculates it.
- Tree now accepts one checkbox prop object instead of multiple props.
- Tree now accepts one cell editing prop object instead of multiple props.
- Split tree node label and description rendering into a separate component - TreeNodeContent.
- Added an ability to show node descriptions in the Tree component via showDescriptions property.
- Fix tree failing to load nodes in special cases
- Added support for UI color themes
- Add a way to specify checkbox states asynchronously in Tree component
- Breadcrumb fixes
- Add a way to specify custom Tree checkbox renderer
- Update to use newer generic-icons-webfont package.
- upgrade to TypeScript 3.2.2
- WIP: ViewportComponent unit tests. Removed imodeljs-clients-backend dependency from ui-framework

## 0.188.0
Wed, 16 Jan 2019 16:36:09 GMT

_Version update only_

## 0.187.0
Tue, 15 Jan 2019 15:18:59 GMT

### Updates

- Add a separate PropertyGrid prop to tell if properties should be hoverable
- Add ability to assign context menu for properties in PropertyGrid

## 0.186.0
Mon, 14 Jan 2019 23:09:10 GMT

### Updates

- Property pane does not show struct or array info anymore

## 0.185.0
Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0
Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Renamed PropertyDataProvider to IPropertyDataProvider.
- Add ui-component root to avoid relative file conflicts in bundles.
- Handle custom row and cell item styling in Table component
- Fix double and navigation property value renderers to not append ".0" to values in certain cases

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

### Updates

- Changed property pane css.
- Changed how vertical PropertyPane looks.
- Fix BeInspireTree's render suspension not being consistent in some cases
- Added optional viewState prop to ViewportComponent

## 0.179.0
Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Added Tests, updated Table, fixed breadcrumb mutability issues
- Added DragDrop tests, added component withDragDrop HOC tests
- Synchronizing navigation aids with view definition changes
- Simplified property pane tooltips and improved Property Pane performance.
- Simplified struct and array tooltips in Table component.
- Fix BeInspireTree's event listening functions to handle array inputs
- Fix BeInspireTree's muting events with allowed number of triggers
- Cache BeInspireTree.visible() result for better performance
- Optimize BeInspireTree.selectBetween
- Avoid loading PropertyGrid data for intermediate data changes
- Avoid loading TableView data for intermediate column / row changes
- Allow property converters and renderers to return result either sync or async
- Fix tree node loosing its children when collapsed while children are being loaded
- Fix tree not showing data after changing data provider while another data provider is being loaded
- Show loading spinner in the Tree while root nodes are being loaded

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0
Wed, 12 Dec 2018 17:21:32 GMT

### Updates

- Added a merged property value renderer.
- Set BeInspireTreeNode's payload as possibly `undefined`
- Fix Tree component to handle data provider change before the first update
- Handle shift-selecting not loaded tree nodes
- Fix tree checkbox-related props
- Improved speed & smoothness of CubeNavigationAid. Made class names unique to fix documentation. UI Tree doc fixes.

## 0.176.0
Mon, 10 Dec 2018 21:19:45 GMT

_Version update only_

## 0.175.0
Mon, 10 Dec 2018 17:08:55 GMT

_Version update only_

## 0.174.0
Mon, 10 Dec 2018 13:24:09 GMT

### Updates

- Added Tests, updated Table, fixed breadcrumb mutability issues
- Tree now accepts propertyValueRendererManager as a property.
- PrimitivePropertyValueRenderer now accepts context and can render tree properties.
- TreeNodeItem now accepts an additional optional property - typename.
- TreeNode can now render asynchronously.

## 0.173.0
Thu, 06 Dec 2018 22:03:29 GMT

### Updates

- Added fillZone property to the Widget
- Fixed initial & return layout of Frontstage. Styling of scrollbar in Chrome.
- Custom imodelJs noDirectImport lint rule implemented, noDuplicateImport lint rule turned on.

## 0.172.0
Tue, 04 Dec 2018 17:24:39 GMT

### Updates

- Changed index file name to match package name, eliminate subdirectory index files, decrease usage of default exports, change imports to use other packages' index file.

## 0.171.0
Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- Added tests to Breadcrumb, updated Table and fixed Table Resize issues.
- Added property value renderers for double and navigation primitive types.
- Added specialized property value renderers for nonprimitive types when their container is a table.
- Refactored PropertyRenderer into smaller pieces and added isSelectable and indentation prop
- Changed the way PropertyCategoryBlock looks.
- Enabled table to contain popups and dialog and slightly cleaned up it's CSS.
- Removed ConfigurableUiManager.addFrontstageDef and other unused/old methods and components
- Implement pagination in Tree component

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- Added property value renderers for double and navigation primitive types.
- Added specialized property value renderers for nonprimitive types when their container is a table.
- Refactored PropertyRenderer into smaller pieces and added isSelectable and indentation prop
- Changed the way PropertyCategoryBlock looks.
- Enabled table to contain popups and dialog and slightly cleaned up it's CSS.

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- Virtualized nodes' rendering in the Tree component

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

_Version update only_

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

### Updates

- Fixed some content control sizing issues
- Added Tree cell editing
- Added ShowHide in Common package, implemented ShowHide for Table columns.
- Tree cell editing unit tests
- Fix tree nodes loosing their state when ITreeDataProvider.onTreeNodeChanged is called
- ui-framework unit tests & docs

## 0.166.0
Mon, 12 Nov 2018 16:42:10 GMT

_Version update only_

## 0.165.0
Mon, 12 Nov 2018 15:47:00 GMT

_Version update only_

## 0.164.0
Thu, 08 Nov 2018 17:59:21 GMT

### Updates

- Deprecated dev-cors-proxy-server and use of it.
- Fix: Do not start search if input field is empty
- Use strongly typed enums for identifying keyboard keys
- PropertyGrid property editing and unit tests
- Updated to TypeScript 3.1
- Refactored Tree component to improve its performance
- Refactored Breadcrumb and added tests
- Zone & Widget initial state, more ui-core unit tests, cleaned up ui-framework index.ts files.

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- Fixed breadcrumb component test
- Added JSX specification for Frontstage, Zone & Widget
- Fixed ui-framework unit test

## 0.162.0
Wed, 24 Oct 2018 19:20:07 GMT

### Updates

- Tooltips, ToolAdmin.activeToolChanged support, SheetNavigationAid/SheetsModalFrontstage improvements.
- Ui Documentation
- Vertical PropertyGrid layout improvements. PropertyGrid background color. Setting the widget state.
- Changed Horizontal PropertyGrid css to use grid instead of table display and modified subcomponents accordingly.
- Fixed property selection.
- Added an ability to resize label/value in PropertyRenderer.
- SelectablePropertyBlock now controls label/value ratio for every property in a category.
- Fixed PropertyList to use the right key.
- Updated types from any to more specific one in TypeConverters.
- Primitive property record value now can not be undefined.
- TextEditor now accepts property defined as string instead of PropertyRecord.
- Added a manager that allows registering custom property value renderers.
- Added default renderers for Primitive, Array and Struct properties.
- Custom property value renderer manager can now be provided to Table and Pane. Without it they use default property renderers.

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

