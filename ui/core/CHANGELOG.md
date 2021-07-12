# Change Log - @bentley/ui-core

This log was last generated on Tue, 06 Jul 2021 22:08:34 GMT and should not be manually modified.

## 2.17.1
Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0
Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Update use of resize observer to be compatible with using it in a child/popup window.
- Update scss to remove use of slash for division to avoid SASS deprecation warnings.
- Publish in-use APIs

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

- Wrap resizeObserver in a windows animation frame to prevent loop limit exceeded error.
- Add support for child popup windows.
- Improved Multi-Value column filtering in the Table component
- Update to latest classnames package
- Fix GlobalContextMenu layout issue in presentation-test-app by setting display:none on anchoring div.

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

### Updates

- Wrap resizeObserver in a windows animation frame to prevent loop limit exceeded error.

## 2.15.2
Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1
Wed, 05 May 2021 13:18:31 GMT

_Version update only_

## 2.15.0
Fri, 30 Apr 2021 12:36:58 GMT

### Updates

- Add more descriptive UiSettingsStorage, LocalSettingsStorage, and SessionSettingsStorage and deprecate badly name beta classes.

## 2.14.4
Thu, 22 Apr 2021 21:07:34 GMT

_Version update only_

## 2.14.3
Thu, 15 Apr 2021 15:13:16 GMT

### Updates

- Fix z-index of statusbar overflow panel to show footer popups.

## 2.14.2
Thu, 08 Apr 2021 14:30:09 GMT

_Version update only_

## 2.14.1
Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0
Fri, 02 Apr 2021 13:18:42 GMT

### Updates

- Add SettingsManager and SettingsContainer for displaying app settings UI.
- fix height in number control.
- Fix for listbox not rerendering when selectedVaue prop is changed.
- Add option to show/hide settings category header text.
- Improved ui-components test coverage to 100%
- Support for Focus into Tool Settings

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Keep hideIconContainer prop from bleeding into div.
- Add right mouse click on TreeNode
- Updated to use TypeScript 4.1
- Floating widget opacity for UI 2.0. Slider formatMin, formatMax props.
- Support for conditionally disabling/hiding keyboard shortcuts
- Add margin and padding top labeled-themed-select.
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

- Allow target _blank in Message boxes if secure relationships exist on the element
- AccuDraw bi-directional value updates
- Wrap the props.valueChanged call in the SearchBox to prevent a state change when the value has not really changed. This generally only happens when a valueChangedDelay is specified.

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
- Add option to use a 'x-small' webfont icon.
- Add nested popup support to components that use HOC withOnOutsideClick.
- Fix bug processing zero value in Select options.
- Fix calling of onClick and onSelect calls when ContextMenuItem is disabled
- Lock react-select to 3.1.0 and @types/react-select to 3.0.26 until we can fi
- updated `ExpandableBlock` component to be able to take in title as JSX.Element and a tooltip, in which title string property can be passed
- updated `ExpandableBlock` component to be able to take in title as JSX.Element and a tooltip, in which title string property can be passed
- Add partial checkbox handling to TreeNode
- Initial implementation of AccuDraw UI
- Added ui-core learning docs content and added Notification.md, Style.md & Tooltip.md ui-core learning doc files.
- Added support to ExpandableList for updating the active block programmatically
- Fix controlled/uncontrolled react warning in Select component.
- Added disabled support to Select component options

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

- By default format slider tooltip with same number of decimal places as step specification.
- Change warning/success/error colors for labeledInput to themed variables .
- Add ability for Popup to avoid outside click processing when clicking on element in nested Popup.
- Add new NumberInput control to replace NumericInput which wrapped react-numeric-input.
- Clear FocusTrap timeout on unmount.
- Popup - added onContextMenu & closeOnContextMenu props
- Added 'closeOnWheel' and 'onWheel' Popup props
- Unified UI typography systems

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

### Updates

- Clear FocusTrap timeout on unmount.

## 2.9.3
Mon, 23 Nov 2020 20:57:56 GMT

_Version update only_

## 2.9.2
Mon, 23 Nov 2020 15:33:50 GMT

_Version update only_

## 2.9.1
Thu, 19 Nov 2020 17:03:42 GMT

### Updates

- Added AutoSuggest props - renderInputComponent, renderSuggestionsContainer, onSuggestionsClearRequested

## 2.9.0
Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Updated Input and TextArea controls to support returning ref to native HTML control. PBI#484911.
- Update DialogButtonType enum.
- Changed AutoSuggest getSuggestions prop to async and removed @deprecated tag
- Change Editor components to process native keyboard events instead of synthe
- Add LabeledThemedSelect component
- Added ProgressSpinner component

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

### Updates

- Move definitions to ui-abstract
- Explicitly set line-height for checkbox to avoid in compatible line-height being inherited from a parent element.
- Revert changes made to limit focus trap to contents only. Use class now to ignore unwanted focus target.
- Add missing semicolons to .scss files.
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

### Updates

- Revert changes made to limit focus trap to contents only. Use class now to ignore unwanted focus target.

## 2.7.0
Fri, 02 Oct 2020 18:03:32 GMT

### Updates

- Add themed color to loading message
- Update styles for use in DatePicker
- Fix FocusTrap to only restore focus when it unmounts.
- Added Table cell editor activation via keyboard when using row selection. Added Tree cell editor activation via keyboard.
- Added 'jam3/no-sanitizer-with-danger' ESLint rule for UI React packages
- Updated react-autosuggest to V10.0
- Table cell editing via keyboard
- Styling fixes for ThemedSelect and Input with Icon.
- Minor styling fixes to ThemedSelect.

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

- Added PopupContextMenu component. Added 'iconRight' support to menu items.
- Moved ESLint configuration to a plugin
- Added ability to collapse all ExpandableList blocks when using singleExpandOnly
- Hide the icon container if no icon is passed to fix alignment issues
- Addressed ESLint warnings in UI packages. Fixed react-set-state-usage rule. Allowing PascalCase for functions in UI packages for React function component names.
- Added Indeterminate Progress Indicator
- Add component to highlight matching filter text.
- Sanitizing HTMLElement before using React rendering
- SplitButton popupPosition & buttonType props support
- Add prefers-color-scheme media query for SYSTEM_PREFERRED theme.
- Add ThemedEnumEditor for DialogItems and ToolSettings, using the ThemedSelect component.

## 2.5.5
Wed, 02 Sep 2020 17:42:23 GMT

_Version update only_

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
- Add new variable to define drop shadow color for popups.
- Logging error when UiCore.translate called without UiCore.initialize being called beforehand
- Colorpicker updates
- Added eslint-plugin-jsx-a11y devDependency and made first pass at adding a11y roles
- Added react-axe and resolved some a11y issues
- Moved SpecialKey & FunctionKey enums to ui-abstract & started using them throughout UI packages
- lock down @types/react version at 16.9.43 to prevent build error from csstype dependency
- Added Table component keyboard row selection. Miscellaneous a11y fixes.
- Switch to ESLint
- Tree keyboard node selection & expansion
- Update to @bentley/react-scripts@3.4.2

## 2.4.2
Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1
Fri, 07 Aug 2020 19:57:43 GMT

_Version update only_

## 2.4.0
Tue, 28 Jul 2020 16:26:24 GMT

### Updates

- Add support for a basic single selection aria compliant listbox.
- Checkboxes in lists & trees are out of place
- Disabled component styling. Fixed Dialog focus problems.
- Map Layer UX
- Allowing Input component user to override the type
- Fix ThemeSelect formatOptionLabel prop to return React.ReactNode.
- Added Arrow key navigation in Tabs components. Added ItemKeyboardNavigator.
- Add aria props into ThemedSelectProps for accessibility. addclassName prop to ThemedSelectProps as requested for styling purposes.
- Changed toolbar opacity processing to affect all components in widget.
- Add border prop to ImageCheckBox
- Replace slider specific Tooltip with generic Tooltip.

## 2.3.3
Thu, 23 Jul 2020 12:57:15 GMT

_Version update only_

## 2.3.2
Tue, 14 Jul 2020 23:50:36 GMT

### Updates

- Fixed Checkbox sizing/rendering & Dialog focus problems

## 2.3.1
Mon, 13 Jul 2020 18:50:14 GMT

_Version update only_

## 2.3.0
Fri, 10 Jul 2020 17:23:14 GMT

### Updates

- Improved ui-core unit test coverage to 100%
- Support for CSS units in Dialog min/max sizes
- Accessibility: Improved focus borders & indicators
- Increase popup position tolerance to 3 pixels to avoid endless set state calls.
- Styled RadioButton. Restyled Checkbox. Fixed FocusTrap pointer events.
- Fixed default size of Toggle button
- Support for indeterminate state in Checkbox component

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Qualified the CSS class names for the face names in Cube Navigation Aid
- Fixed size & padding for hollow button
- Added property editors for multi-line text, slider and numeric input/spinner.
- No longer calling onOutsideClick from ContextMenu when closed
- Replace 'Plugin' with 'Extension' in comments and examples.
- Fixed minimum size of Toggle component
- Added support for popup with multiple editors
- Unify size of hollow and blue buttons.
- Specify the props that can passed to ThemedSelect instead of just allowing all the react-select props.

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Address React warnings about deprecated methods.
- Element Separator updated with new style and group resize logic.
- Throttled ElementSeparator to call onRatioChanged a maximum of once every 16ms
- Fixed breaking change regarding ElementSeparator onRatioChanged
- Fixed Table filter renderers after react-select version upgrade
- Support for striped rows in Table
- Added ability for apps to display Favorite properties in Element Tooltip & Card at Cursor
- Add ThemedSelect, a react-select component that uses iModel.js UI theming.

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- [For Dialog component, support dialogs that disable the default header and want to implement custom move logic by updating the x and y props. This was fixed by only handling the pointer move events when a resize or move operation starts instead of on mount. Also now we only update the relevant state in the pointer move event handler based on if we are moving or resizing]
- Qualified .label & .message CSS classes. Removed .cell CSS class usage. Fixed cell editor sizes.
- Removed @deprecated APIs from ui-framework & ui-core and updated NextVersion.md
- Changes to WebFontIcon to support custom font-family icons.
- Ensure ui-abstract is listed as peer dependency and not just a dev dependency.
- Fix bug 292829 where toolbar border displayed when all items are hidden.
- Convert FocusTrap to internal FunctionComponent and ensure no focus processing is done when the trap is not active.
- Fixed ReactResizeDetector usage after upgrade. Converted Toggle component to function. Hover/pressed styling in 2.0 Toolbar.
- Make resize-observer-polyfill a full dependency
- Fixed Messages window blinking when you tap on it on iOS
- Ui 2.0 - Blur the toolbar item background
- Add a tolerance to check position between render cycles.
- Made React functional component specifications consistent across UI packages
- Slider component tooltipBelow prop & tooltip styling
- Added API in MessageManager to display either a Toast or Sticky message using React components.
-  Updates to remove need for svg-sprite-loader, use defualt CRA svgr loader instead.
- Revert back to using svg-sprite-loader and sprite resourceQuery.
- Upgrade to Rush 5.23.2
- Fixed Safari browser issues
- Copied filter renderers from react-data-grid-addons to ui-components to prevent security error
- Fixed several Tool Assistance issues
- Ui 2.0 - Toolbar display changes
- Updated Toolbar colors/opacity for Ui 2.0
- Move common use hooks from ui-ninezone.
- Learning docs for UiAdmin & UiItemsArbiter
- Promoted some @beta to @public in Ui packages & ToolAssistance for 2.0 release.
- Fixes to Toggle onBlur handling & ControlledTree error message position
- In source documentation. Some learning docs & API changes.
- Move react to peerDependencies.
- Learning documentation for ui-core
- TOC for UI 2.0 Docs, @alpha to @beta, Components Examples
- Fix popup position calculation.
- Started ui-components Learning doc section
- Make UiSettings asynchronous.
- UI: Toggle Component - only use animation on value change
- Add `useOptionalDisposable` hook
- Update auto-generated dialog items to work with the Tool Settings Bar.
- Moved Checkbox, Radio, Select, Toggle, Slider & AutoSuggest into their own category
- Defaulting to IModelApp.i18n in UI packages and cascading initialize() calls
- UI: Support for multiple Toast & Sticky messages
- Added UiSetting. Saving/restoring settings in ui-test-app.
- Remove support for the iModel.js module system by no longer delivering modules.
- Update Select control to allow placeholder text to be re-displayed by setting value to undefined.
- set z-index on toolsettings overflow panel

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

### Updates

- Documentation

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- Placeholder text not supported by Select component

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Upgraded icons-generic-webfont to ^1.0.0
- Added useDisposable hook

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Fixed useEffectSkipFirst hook to cleanup properly
- Upgrade to TypeScript 3.7.2.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Fixed lgtm issues in UI folders

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- No longer accessing this.state or this.props in setState updater - flagged by lgtm report
- Changed SignIn & SignOut buttons to large. Fixed Dialog component resizing. Reduced default minimum size of Dialog component.
- Update sinon version.
- Use exhaustive-deps linter rule.
- Removed unused React state variables. Removed unsupported setState calls from render() methods.
- Code cleanup based on code analysis report from lgtm.
- Added ConditionalField and FooterModeField components. StatusBar responsive changes.

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Update Icon package version
- Fixed Dialog position after moving or resizing. Fixed sizing on Firefox for different alignments.
- Implemented more efficient CSS animation for Spinner component
- Added slight delay before spinner animation. LoadingSpinnner tests in SpinnerTestDialog.
- Tablet responsive UI
- Added StatusBarComposer, StatusBarItem, StatusBarManager and StatusBarItemsManager
- Added tslint-react-hooks to UI packages
- Add useEffectSkipFirst custom hook
- Update Statusbar index scss file.

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Provide a generic Form component to replace the one in Design Review Saftibase and Risk Manangement stages.
- Added badge support to context menu items. Moved some Plugin Ui definitions to ui-abstract.
- Added support for English key-ins in addition to translated key-ins
- Fix centering and sizing of dialogs in FireFox.
- Made the Status Bar & Backstage more responsive on smaller screens
- Added initial ui-abstract package setup
- Added UiAdmin with support for displaying Menus and Toolbars at a location
- Fixed SVG support in ui-core
- Added useLifecycleLogging hook to help debugging react functional components

## 1.6.0
Wed, 09 Oct 2019 20:28:42 GMT

### Updates

- Added AutoSuggest component and improved KeyinBrowser component

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- AccuDraw Popup Editors. Improved editor sizes. Editor Params improvements.
- Initial Accudraw Ui components - Buttons, ContextMenus, Calculator, Editors. IconInput in ui-core.
- Added hideHeader and header props and support for titleStyle prop
- Added initial (default) value to Search Box.
- Tool Assistance changes per UX Design
- Upgrade to TypeScript 3.6.2

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

### Updates

- Using Checkbox component in BooleanEditor. Cleaned up cell editor positioning.
- Updated inputs and button padding for iModel.js. Fixed Popup colors & z-index.
- Added support for content view minSize properties
- Addressed some warnings introduced with React 16.9
- Listening for onSelectedViewportChanged to set active content view for viewports
- Fixed new lint issue in getDisplayName
- Allow an app to specify touch-specific instructions in tool assistance.
- Add a `ScrollPositionMaintainer` helper to recursively save and restore scroll position
- Added VerticalTabs component to ui-core

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Update to use latest icon library
- Add missing 'uicore-' prefix to step color values.
- Added CursorPrompt, improved Pointer messages
- Fixed Dialog component height on different browsers
- Make icon specification on Tile component optional.
- Added icons to markup/redline
- Moved Point, PointProps, Rectangle, RectangleProps, Size and SizeProps to ui-core from ui-ninezone
- Copied Tiles over from BWC to ui-core
- Update to latest icon package version.

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

### Updates

- Checkbox: added theming
- Remove flex-grow from dialog containers - not supported by Firefox
- Removed flex-grow from dialogs
- Add missing space in scss files.
- Update styles on Select and Input components.
- Added CursorInformation and CursorPopup
- Added ToolAssistance support and Tool.iconSpec
- Fixed Toolbar resizing, ContextMenu className and $buic-row-hover & $buic-row-selection
- Checkbox: Fix `onClick` event so that it can be used to stop event propagation
- Remove excessive z-index CSS rule.
- Update light and dark theme colors.

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- It is not possible to turn on/off checkbox by clicking on label
- Added prefixes to Dialog & ContextMenu to CSS classes for positioning
- Copied source from react-numeric-input and converted to TypeScript for internal control
- Modified regex for NumericInput
- Allow CSS selector string to specify item in FocusTrap to receive focus.
- Reverted ContextMenuDirection and DialogAlignment breaking changes
- Update to TypeScript 3.5
- ui-component unit tests. NumericInput strict=true default.

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Added UI Logger & UiError usage & improved i18n calls
- Change FrontStage to Frontstage
- Moved NoChildrenProps, OmitChildrenProp and flattenChildren to ui-core from ui-ninezone
- Release tag cleanup and ui-framework unit tests
- Updated UI package release tags for 1.0 release.
- Fixed release tag warnings in UI packages
- Add ability to save property only for current session.
- Added NumericInput component to ui-core. Added dependency on react-numeric-input.
- Update popup position when component updates.
- Remove unused z-index layers and move backstage to the end (since zones no longer create a stacking context).

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Update to latest version of icon library.
- @beta tags for Toolbar. More React.PureComponent usage. Added constructors to prevent deprecated warnings. Coverage minimum thresholds.
- Added CommonProps to many component Props in ui-core & ui-components
- Added tools/build/tslint-docs.json. Added SvgPath & SvgSprite to ui-core.
- Added missing package prefix to some CSS class names in ui-core, ui-components & ui-framework
- Reverted CubeNavigationAid changes
- Added 100% coverage to getDisplayName and shallowDiffers
- Show/Hide UI enhancements. Widget Opacity enhancements.
- Added local snapshot support to ui-test-app. Added specialized div components to ui-core.
- Fix broken links
- Small tweak to Popup class.
- Put sourcemap in npm package.
- Added SignIn presentational component to ui-components. Removed --ignoreMissingTags extract-api option.
- Require React & React-dom 16.8
- Setup a generic context for tracking client requests, and made various related enhancements to logging, usage tracking and authorization.
- Added ViewportDialog in ui-test-app, ui-core/ContributeGuidelines.md. TSLint rules in ui-core for no-default-export & completed-docs. @beta release tags.
- Update icons-generic-webfont version to latest available.
- Added TableProp to hide header and supporting style changes
- Fixed _scrollbar.scss include
- Modify GlobalContextMenu to better follow UX guidelines
- Added release tags to ui-framework, ui-components and ui-core.
- UI documentation - added to Learning section
- Fix tree placeholder styling (set correct background and offset)
- Added ModelessDialog & ModelessDialogManager
- Add onOutsideClick prop to Popup.
- Add ability to set tooltips on tree node checkboxes
- Unit tests and fixed ColorEditor alignment
- Upgrade TypeDoc dependency to 0.14.2

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Added 'uifw-' to ContentLayout CSS class names and others. Fixed Status Bar separators.
- Added 'uifw-' prefix to most ui-framework CSS class names
- Cleaned up index.scss for variables & mixins in ui-core and added classes.scss that generates CSS
- Restructure `Node` component to allow more flexible layout

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Renamed CSS files to SCSS
- UI documentation fixes
- Added ToggleEditor. Support for defaultTool in Frontstage. Fixed BooleanEditor sizing.
- Added testing props to SplitButton
- Added tilde-prefixed hotkey support to ContextMenu
- Use new buildIModelJsBuild script
- Changed Checkbox container from <label> to <span>, because the former caused weird visual glitch when clicked on.
- Color tweaks
- Fixed submenus, added default autoselect for hotkeys
- Added tests for Dialog and Context Menu
- Remove unneeded typedoc plugin dependency
- Minor UI Color Theme changes
- Support for including CSS files in published UI packages
- Added styling capability to messages
- Removed dependency on BWC. Parts of BWC copied into ui-core in preparation for theming support.
- Save BUILD_SEMVER to globally accessible map
- Added UnderlinedButton
- Cleanup of DefaultToolSetting provider and EnumButtonGroup editor
- Move property definitions to imodeljs-frontend so they could be used by tools to define properties for tool settings.
- Added Image component.
- Renamed core-tree-tree to core-tree.
- Removed Div component.
- Renamed icon container class in tree node to core-tree-node-icon.
- Made tree node checkbox container background transparent.
- Tree node checkbox css fix
- Tree node now accepts one checkbox prop object instead of multiple props.
- Changed tree node styling.
- Added support for UI color themes
- Add a way to specify custom Node checkbox renderer
- Keyboard Shortcut keys in context menu. ui-core unit test branches.
- Update to use newer generic-icons-webfont package.
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

- Ensure unique relative file paths.

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

- Added tests for Dialog and Context Menu
- Changed the updateThreshold in ElementSeparator to be 3px instead of size percentage.
- TreeNode checkbox fixes

## 0.179.0
Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Use arrow cursor on tree nodes

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0
Wed, 12 Dec 2018 17:21:32 GMT

### Updates

- Updated TreeNodes to manage checkboxes
- Fix tree Node checkbox-related props

## 0.176.0
Mon, 10 Dec 2018 21:19:45 GMT

_Version update only_

## 0.175.0
Mon, 10 Dec 2018 17:08:55 GMT

_Version update only_

## 0.174.0
Mon, 10 Dec 2018 13:24:09 GMT

_Version update only_

## 0.173.0
Thu, 06 Dec 2018 22:03:29 GMT

### Updates

- Fixed initial & return layout of Frontstage. Styling of scrollbar in Chrome.
- Custom imodelJs noDirectImport lint rule implemented, noDuplicateImport lint rule turned on.

## 0.172.0
Tue, 04 Dec 2018 17:24:39 GMT

### Updates

- Changed index file name to match package name, eliminate subdirectory index files, decrease usage of default exports, change imports to use other packages' index file.

## 0.171.0
Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- Fixed Dialog modal backdrop show/hide
- Reduced the amount of unneded event calls in Dialog component and changed it to use Pointer events instead of Mouse+Touch.
- Added a vertical/horizontal line that is visible when hovered on ElementSeparator component.
- Renamed expandable block css class from core-property-block to core-expandable-block.
- Added a way to put Popups in fixed position and cleand up the refs.
- Added Omit type definition to Utils.
- Removed ConfigurableUiManager.addFrontstageDef and other unused/old methods and components
- Add Placeholder that can be displayed instead of tree node while it's being loaded

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- Reduced the amount of unneded event calls in Dialog component and changed it to use Pointer events instead of Mouse+Touch.
- Added a vertical/horizontal line that is visible when hovered on ElementSeparator component.
- Renamed expandable block css class from core-property-block to core-expandable-block.
- Added a way to put Popups in fixed position and cleand up the refs.
- Added Omit type definition to Utils.

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- Base Tree component improvements to allow virtualization

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

_Version update only_

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

### Updates

- Fixed some content control sizing issues
- Fixed Dialog movable prop and ContextMenu autoFlip.
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

- PropertyGrid property editing and unit tests
- Updated to TypeScript 3.1
- ui-core unit tests. Fixed backstage open issue.
- Make Tree-related components pure.
- Zone & Widget initial state, more ui-core unit tests, cleaned up ui-framework index.ts files.

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- Added JSX specification for Frontstage, Zone & Widget

## 0.162.0
Wed, 24 Oct 2018 19:20:07 GMT

### Updates

- Tooltips, ToolAdmin.activeToolChanged support, SheetNavigationAid/SheetsModalFrontstage improvements.
- Ui Documentation
- Vertical PropertyGrid layout improvements. PropertyGrid background color. Setting the widget state.
- Added an ElementSeparator component which allows resizing ratio between left/right column or upper/lower row.

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

