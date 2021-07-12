# Change Log - @bentley/ui-framework

This log was last generated on Tue, 06 Jul 2021 22:08:34 GMT and should not be manually modified.

## 2.17.1
Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0
Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Add ability to "pop-out" a widget to a child window.
- Export EmphasizeElementProps from common, deprecate from frontend.
- Add ability to maintain tab state even if UiItemsProvider that added the tab is not loaded. This allow preference size to be maintained.
- Add 100ms wait during unit test for open window processing to be triggered.
- Add getters to retrieve the list of category and model overrides & make update category/model overrides functions public
- publish in-use APIs
- Refactor SolarTimeline and ScheduleAnimationProvider to use new TimelineComponent iteration.

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

- Clean up styling in StatusBar.css
- Set overflow hidden on content Panes used when stage has multiple content views.
- Adding ability to override isActive property for BackstageItem
- Add support for child popup windows.
- Replace deprecated ViewManager.forEachViewport() with iterator.
- Update to latest classnames package

## 2.15.6
Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5
Thu, 20 May 2021 15:06:26 GMT

### Updates

- Remove framework version condition from floatWidget and dockWidget. This was causing problems in the sample showcase.

## 2.15.4
Tue, 18 May 2021 21:59:07 GMT

_Version update only_

## 2.15.3
Mon, 17 May 2021 13:31:38 GMT

### Updates

- Clean up styling in StatusBar.css

## 2.15.2
Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1
Wed, 05 May 2021 13:18:31 GMT

_Version update only_

## 2.15.0
Fri, 30 Apr 2021 12:36:58 GMT

### Updates

- Add UiSettingsPage, AppUiSettings, and ability to register UserSettingsProvider to provide default settings from UsSettingsStorage.
- Properly declare changeSetId variables as string.
- Adding ability to open Message Center on demand
- Cache element ids when determining visbility in ModelsTree
- Fix compatibility issue when multiple versions of `rxjs` are in use.
- Publish APIs used bu iTwinViewer.

## 2.14.4
Thu, 22 Apr 2021 21:07:34 GMT

### Updates

- Update to get activeViewPort by monitoring ContentViewManager.onActiveContentChangedEvent this elimates issue where ViewManager active viewport changes occur before all UI components are mounted and listening.

## 2.14.3
Thu, 15 Apr 2021 15:13:16 GMT

### Updates

- Cleanup statusbar styling to ensure items are centered and do not overflow area.

## 2.14.2
Thu, 08 Apr 2021 14:30:09 GMT

### Updates

- Avoid getting into infinite render loop in CategoriesTree

## 2.14.1
Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0
Fri, 02 Apr 2021 13:18:42 GMT

### Updates

- Add Standard Modal Settings Stage for displaying App Settings.
- Add api to float and dock widgets in UI2.0.
- Filter out history key-in that are no longer available in key-in palette.
- Move Quantity Formatting settings page from ui-test-app to ui-framework and add ability to set Presentation Unit System.
- Adding sectionToolGroupWithPanel definition in CoreTools
- Support for AccuDraw Ui Settings
- Support for Bump Tool Settings
- Better support for Escape key to Home position
- Support for Focus into Tool Settings
- Initialize tool settings React components from the record in UiLayoutDataProvider to prevent reinitializing the value when the items move into the overflow popup.
- Fix ViewSelector so it reloads list of views when iModel prop is updated.

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Add functions to clear the Hide/Isolate for Models and Categories
- Upgrade react-resize-detector to avoid lodash security vulnerability
-  Fix solar timeline component so that sunTime is properly set for project location.
- Document uiSettings in ToolAssistanceField
- Fix stateFunction for clear hide/isolate/emphasize tool that is used in UI 1.0.
- Updated to use TypeScript 4.1
- AccuDraw show Z field only for 3d views
- AccuDraw default keyboard shortcuts
- Added AccuDraw notifications for rotation & compass mode
- Added AccuDraw widget
- Support for conditionally disabling/hiding keyboard shortcuts
- Fixed local file support in Electron ui-test-app
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

- Changed ModelsTree visibility handler behavior to fully change visibility of node if it matches applied filter
- Updated ModelsTree rulesets to better handle updates.
- AccuDraw bi-directional value updates
- Correctly add and remove widgets provided by UiItemsProviders."
- ModelsTree: Fix getting display status of element nodes
- WidgetDef show and expand will correctly activate the tab.
- Preventing cursor prompt lag
- Provide dynamic widgets for every section type.
- Update remaining syncEventId checks to be case insensitive.

## 2.11.2
Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1
Thu, 04 Feb 2021 17:22:41 GMT

### Updates

- Updated ModelsTree rulesets to better handle updates.

## 2.11.0
Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Update components that support providing refs via React.forwardRef to work better with document generation.
- Fix backstage not updating when props.items are updated.
- Propagate isDisabled MenuItem property to ContextMenuItem disabled property
- Added partially visible instances support to VisibilityHandler
- Initial implementation of AccuDraw UI
- Prevent unnecessary 1.0 Toolbar rerenders in ToolbarComposer.
- Updated UI Learning docs
- Set active viewport to match active content view when overlay is clicked.
- Add ability to control panel size and state from StagePanelDef.
- Update to latest react-dnd version.

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

- Rename 'VisibilityHandler' to 'ModelsVisibilityHandler' and allow subclasses to acces more methods.
- Avoid throwing exception in ModelsTree VisibilityHandler if RulesetDrivenIdsProvider got undefined content
- Correctly handler visibility changes in ModelsTree when filter is applied
- Refactor DialogItem and Property interfaces to make them easier to use.
- Add a 'hasChildren' hint for categories in ModelsTree. We know that categories always have nodes under them. Tell that with a `hasChildren: "Always"` hint to improve categories' loading performance
- Disable pointer events in overlay of default view overlay.

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

- Revert width change to EnumEditor component instead set width to auto only for docked tool settings.

## 2.9.0
Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Change ComponentGenerator to remove need for setImmediate call.
- Update test snapshot file due to change to support ForwardRef of Input controls.
- Rename ToolUiManager to ToolSettingsManager
- Add support for reloading enum choices or reloading all components constructed from UiDataProvider data.
- Changed AutoSuggest getSuggestions prop to async and removed @deprecated tag
- Added FrameworkUiAdmin.showReactCard
- Update 2.0 status bar background color.
- Change Editor components to process native keyboard events instead of synthe
- Added MessagePopup - Displays Toast & Sticky messages without a StatusBar
- Respect WidgetState.Hidden when rendering widget tabs.

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

### Updates

- ModelsTree: Handle GraphicalPartition3d similar to PhysicalPartition - it should not be displayed if there's a 'GraphicalPartition3d.Model.Content' attribute in JsonProperties
- Added jsdoc ESLint rule for UI packages
- Upgraded react-split-pane to 0.1.92

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

- Update to limit size of keyin stored in keyin history.
- Added Table cell editor activation via keyboard when using row selection. Added Tree cell editor activation via keyboard.
- Table cell editing via keyboard
- Added useCachedNineZoneState in widget-panels Frontstage
- Do not render empty stage panel when frontstage changes.
- ModelsTree: Add a prop for enabling auto-update
- ModelsTree: Group similar category nodes to avoid duplication
- Add telemetry to ui-framework.

## 2.6.5
Sat, 26 Sep 2020 16:06:34 GMT

_Version update only_

## 2.6.4
Tue, 22 Sep 2020 17:40:07 GMT

### Updates

- Do not render empty stage panel when frontstage changes.

## 2.6.3
Mon, 21 Sep 2020 14:47:10 GMT

_Version update only_

## 2.6.2
Mon, 21 Sep 2020 13:07:45 GMT

_Version update only_

## 2.6.1
Fri, 18 Sep 2020 13:15:09 GMT

_Version update only_

## 2.6.0
Thu, 17 Sep 2020 13:16:12 GMT

### Updates

- Add support for a feature flag to control the display of the keyin palette.
- BadgeType support for Backstage items
- add itemschanged handler so that items provided can be conditionally hidden
- Lower case syncEventIds prior to comparison
- Added PopupContextMenu component. Added 'iconRight' support to menu items.
- Moved ESLint configuration to a plugin
- Exported ActivityMessage. Added ActivityMessagePopup component.
- react to creation of telemetry client
- Addressed ESLint warnings in UI packages. Fixed react-set-state-usage rule. Allowing PascalCase for functions in UI packages for React function component names.
- Add support for opening a key-in palette to run key-ins.
- ModelsTree: Fix search hierarchy
- Avoid exception during keyin palette test.
- Render only visible stage panel widgets.
- Prevent useWidgetDirection from crashing in 1.0 UI.
- Enable stage panel resizable prop for 2.0.
- Add pinned flag to StagePanelProps.
- Add system preferred theme as default theme.
- Deny tool settings tab from docking to top panel target.

## 2.5.5
Wed, 02 Sep 2020 17:42:23 GMT

### Updates

- Update rxjs dependency version to `^6.6.2`

## 2.5.4
Fri, 28 Aug 2020 15:34:16 GMT

### Updates

- Show duplicate target partitions in ModelsTree

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
- Toolbar overflow styling.
- Update calculation of StageUsage to pass to UiItemsProviders
- Added eslint-plugin-jsx-a11y devDependency and made first pass at adding a11y roles
- Added react-axe and resolved some a11y issues
- Moved SpecialKey & FunctionKey enums to ui-abstract & started using them throughout UI packages
- lock down @types/react version at 16.9.43 to prevent build error from csstype dependency
- Added Table component keyboard row selection. Miscellaneous a11y fixes.
- Switch to ESLint
- Add drop shadow to statusbar overflow popup.
- Ability to fit content of panel widgets.
- Added Home focus support to ui-abstract
- Update to @bentley/react-scripts@3.4.2

## 2.4.2
Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1
Fri, 07 Aug 2020 19:57:43 GMT

### Updates

- add missing rbac-client dep

## 2.4.0
Tue, 28 Jul 2020 16:26:24 GMT

### Updates

- Fixed size of Checkbox & cursor for ViewAttributes checkboxes
- Map Layer UX
- Update 2.0 fronstage logic to monitor extensions and refresh widgets.
- Changed toolbar opacity processing to affect all components in widget.
- Fix stage panel initialization when defaultState is Off.
- Address LGTM warnings in UI code.
- Remove not found widget tabs when restoring layout.

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

- Provide an immediate tool that will restore the default layout for frontstage.
- Provide ability to support subclassing IModelViewportControl and allow custom overlay component without sub-classing.
- fix styling of docked toolsetting so controls are centered.
- Fix tool settings styling on FireFox.
- Accessibility: Improved focus borders & indicators
- Fix floating widget bug.
- Models Tree: Show sub-model contents under geometric elements
- Enable minSize and maxSize StagePanelProps in 2.0. Allow percentage units to be passed in to maxSize prop.
- Enable WidgetDef.setLabel() in 2.0 mode.

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

### Updates

- Fix setWidgetState edge case where widget stays open w/o active tab.

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Update the IModelApp.features.track calls in HideIsolateEmphasizeManager
- Update uses of StageUsage to use strings.
- Added MessageManager.MaxDisplayedStickyMessages & support for maximum displayed sticky messages
- Added property editors for multi-line text, slider and numeric input/spinner.
- Replace 'Plugin' with 'Extension' in comments and examples.
- Exported ToastMessage & StickyMessage components
- Added support for popup with multiple editors
- Use the DialogGridContainer not the ToolSettingsGridContainer for popup toolsetting since these popup are not in widgets.
- Tracking time spent in frontstages for application telemetry
- Do not save tab labels when saving frontstage layout.
- Set ui-framework test coverage thresholds to 100%
- Move LayoutManager API to FrontstageDef and WidgetDef.
- Introduce an option to group elements by class in `ModelsTree` and `SpatialContainmentTree`. Also allow specifying the option for both trees when creating `VisibilityWidget`.
- Fix bottom/top stage panel tab duplication.
- Added ViewStateProp & support for obtaining ViewState from function in ViewportComponent and IModelViewportControl

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Add missing @bentley/imodeljs-markup peerDependency
- Add commandItemDef to clearHiddenIsolatedEmphasized elements.
- Fix z-index of Modeless dialogs.
- Address React warnings about deprecated methods.
- Make methods in HideIsolateEmphasizeManager static so they can be called by other packages.
- Update Hide, isolate, empahsize callback processing to ensure selection is not cleared until callbacks are processed.
- Added ability for apps to display Favorite properties in Element Tooltip & Card at Cursor
- Add useWidgetDirection hook.
- Ability to restore layout.
- Expose showWidget and expandWidget functionality.
- Generate stable widget def id to fix save/restore layout issue.
- Ability to set stage panel size.
- Visibility Widget Trees: Fix a wrong offset being used for nodes when display state of the node is still unclear
- Update HideIsolateEmphasizeAction enum so entries match FeatureIds used by Design Review.
- Do not display camera tool if 3D view does not support camera.

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- Add support for 2.0 ui Tool and Navigation widgets to react to UiFramework.onUiVisibilityChanged events
- Add support for showing modal stages when using 2.0 UI components.
- Added following zone names to be used in-lieu of old ninezone names: contentManipulationTools, toolSettings, viewNavigationTools, and statusBar.
- Add support for groupPriority for ToolbarItems. If specified then a group separator is shown when the priority changes.
- Improved Tool Settings inline editor group layout when narrow
- Fixed Message Center count for MessageManager.clearMessages()
- Add ConditionStringValue support. Used to define labels and icons.
- Removed @deprecated APIs from ui-framework & ui-core and updated NextVersion.md
- Rename some new widget classes and deprecate classes we don't want user to continue to use.
- Fix to properly initialize enable/disable state of toolsettings editor based on lock property.
- Fix bug where toolbar buttons did not show expand arrow on custom button when not in 'DragInteraction' mode.  Fix display of key-in browser 1.0 UI.
- Call FrontstageDef.setActiveViewFromViewport when viewport is available to ensure activeContent is properly set.
- Ensure ui-abstract is listed as peer dependency and not just a dev dependency.
- Fix type in ToolSettingsGridProps name
- Fix bug 292829 where toolbar border displayed when all items are hidden. Add new camera on/off icons definitions.
- Update test to avoid warnings.
- Fix for setting active Frontstage before FrontstageComposer mount
- Fixed ReactResizeDetector usage after upgrade. Converted Toggle component to function. Hover/pressed styling in 2.0 Toolbar.
- react to renaming of imodeljs-clients
- Moved KeyinBrowser component to @beta for 2.0
- Using center of Messages indicator as target. Added CSS classname overrides to StatusBarComposer for sections. UI 2.0 color tweaks.
- Fixed FrontendAuthorizationClient type guard.
- Update GroupButton definition to use ReadonlyArray for child items.
- Modal Frontstage styling
- Ui 2.0 - Blur the toolbar item background
- Moved the CubeNavigationAid & DrawingNavigationAid to ui-components package
- Renamed OIDC constructs for consistency; Removed SAML support.
- Fixed popup location when passing htmlElement to UiAdmin functions
- Clean up deprecated APIs
- Hide stage panel when panel state is off.
- Added ability to customize selection handling in VisibilityWidget's Models tree
- Made React functional component specifications consistent across UI packages
- Slider component tooltipBelow prop & tooltip styling
- Added API in MessageManager to display either a Toast or Sticky message using React components.
- react to new clients packages from imodeljs-clients
- Remove comment text shown in render function.
-  Updates to remove need for svg-sprite-loader, use defualt CRA svgr loader instead.
- For consistency add reactNode getters/setters and deprecate use of reactElement.
- Revert back to using svg-sprite-loader and sprite resourceQuery.
- Upgrade to Rush 5.23.2
- Cleanups needed to Signin/Signout and related components in UiFramework
- Deprecated UiFramework.oidcClient and added isIOidcFrontendClient to imodeljs-clients
- Fixed className usage in StatusBar section components
- Update StatusBarComposer to support Overflow panel.
- Fixed sizing for string-based SVG in ToolAssistance
- Fixed several Tool Assistance issues
- Ui 2.0 - Toolbar display changes
- Updated Toolbar colors/opacity for Ui 2.0
- Update ToolbarComposer to use new ToolbarWithOverflow.
- Learning docs for UiAdmin & UiItemsArbiter
- Extract base behavior and styling from Models and Categories trees.
- Promoted some @beta to @public in Ui packages & ToolAssistance for 2.0 release.
- Categories Tree should react to display changes from other components
- Changed Categories Tree to take filter info as property and removed searchbox from it
- In source documentation. Some learning docs & API changes.
- Move react to peerDependencies.
- Learning documentation for ui-core
- TOC for UI 2.0 Docs, @alpha to @beta, Components Examples
- Documentation updates and change camera tool to use SVG icons.
- Ability to drag docked tool settings to widget mode.
- Fix mergeWithZone when frontstage is activated before FrontstageComposer mounts.
- Support for floating widget targets.
- Passing on style props from ui-framework Toolbar to ui-ninezone Toolbar
- Started ui-components Learning doc section
- Use panel zones with fallback to frontstage zones to define 2.0 UI.
- Updated ModelTree ruleset to use RelationshipPathSpecification
- Filtering support in Models Tree
- Move redux and react-redux to peerDependencies.
- Removed `UiFramework.getDefaultRulesetId()` and `UiFramework.setDefaultRulesetId()`
- Ability to save and restore frontstage layout.
- UI: Toggle Component - only use animation on value change
- Added custom message to render if filter returns no data in Categories and Models trees
- Fix visibility widget trees styles
- Ability to switch to 9-Zone 2.0
- Refactor to remove duplicate ComponentGenerator instatiation. Rename filea nd components to remove React reference.
- Update auto-generated dialog items to work with the Tool Settings Bar.
- Moved Property classes and interfaces to ui-abstract package. Created a "DefaultDialogGridContainer" to turn specifications from abstract DialogItems UI into React components.
- Refactor DefaultToolSettingsProvider to use DialogItemsManager and remove duplicate code.
- Fix Indicator to properly load SVG icons.
- Refactor DefaultToolSettingsProvider to use the DialogItem interfaces in place of ToolSettings classes.
- Moved Checkbox, Radio, Select, Toggle, Slider & AutoSuggest into their own category
- Defaulting to IModelApp.i18n in UI packages and cascading initialize() calls
- UI: Support for multiple Toast & Sticky messages
- Added UiSetting. Saving/restoring settings in ui-test-app.
- Remove support for the iModel.js module system by no longer delivering modules.
- Hide 3d tools when active view is 2d.
- Add support for Horizontal Tool Settings container

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

### Updates

- Models Tree: Fix non-geometric models being used when changing subject's display

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- Added ability to customize selection handling in VisibilityWidget's Models tree
- Passing on style props from ui-framework Toolbar to ui-ninezone Toolbar
- Updated ModelTree ruleset to use RelationshipPathSpecification

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Upgraded icons-generic-webfont to ^1.0.0
- #269173 Nav cube arrow controls will no longer turn model sideways.
- Avoid handling whole tree model when handling model change event
- Added UiAdmin.showHTMLElement to show information & graphics for markers

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Upgrade to TypeScript 3.7.2.
- Made 'show/hide all categories' action be limited by the filter
- Cube navigation aid touch events fix.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Fixed lgtm issues in UI folders
- Ui doc & release tag cleanup
- Update to use new BackstageItemManager and PluginStatusBarManager from ui-abstract package. Update StatusbarComposer to show items from plugins.
- Remove duplicate StatusBarItemManager from ui-framework and only leave the one in ui-abstract.
- Fix for nine-zone sample app not displaying backstage items.

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Add useActiveIModelConnection hook.
- Allow setting App Iconspec.
- Setup OidcDesktopClient for Electron use cases.
- Fix styling of footer Indicator to work with Themes.
- Disallow plugins from adding tools anywhere but the end of a toolbar.
- [ModelsTree] Merge same-label Subject nodes to avoid duplication
- No longer accessing this.state or this.props in setState updater - flagged by lgtm report
- Changed SignIn & SignOut buttons to large. Fixed Dialog component resizing. Reduced default minimum size of Dialog component.
- Update sinon version.
- Added support for NotifyMessageDetails.displayTime for Toast messages
- Reduce active tab index when tab is removed.
- Ability to determine available tool settings width.
- Fix code analysis report issues.
- Adjusted Categories and Models trees according changes to ControlledTree events
- Added VisibilityWigdet implementation using ControlledTree and ability to switch to it
- Remove content node when WidgetContentRenderer unmounts.
- Update overflow GroupItem click action to open the panel.
- Prevent frontstage composer rerender on pointer events.
- Use exhaustive-deps linter rule.
- Ability to opt-in to toolbar drag interaction.
- Prevent unnecessary resubscribe in useActiveViewport hook.
- Visibility Widget: Treat dictionary model as never private in Categories tree.
- Ability to specify initialWidth for Zone component.
- Removed unused React state variables. Removed unsupported setState calls from render() methods.
- Code cleanup based on code analysis report from lgtm. Updated status field fade-in/out animation.
- Update to allow Sections statusfield to hide/show depending on active view clip.
- Added ConditionalField and FooterModeField components. StatusBar responsive changes.

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Add support for Hide, Isolate, emphasize tools and status bar item to UiFramework.
- Fix bug where ToolSettings title was not reset after view undo/redo tool usage.
- Initializing OidcBrowserClient before setting it in UiFramework
- Responsive logic in Property Grid to switch to Vertical orientation when too narrow
- Tablet responsive UI
- Added StatusBarComposer, StatusBarItem, StatusBarManager and StatusBarItemsManager
- Added StatusBarItemsManager.setIsVisible & StatusBarItem.isVisible
- Support multiple status bars in the StatusBarManager
- Added tslint-react-hooks to UI packages
- Ensure item uniqueness in BackstageItemsManager and StatusBarItemsManager.
- Remove unsupported fit-content CSS value.
- Expose stage panel minSize and maxSize props.
- Do not show widget resize indicator when widget can not be resized.
- Remove history trays.
- Open tool panel via drag interaction.
- Update TileRendering StatusField width.

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Addressed AccessToken, OidcClient and Backstage issues in ui-framework
- UiAdmin methods for AccuDraw Ui: MenuButton, Calculator, Angle, Length, Height
- Provide a DefaultNavigationWidget that can be used by Apps and Plugins and can be extended by Plugins.
- Fixed issues with use of OIDC AuthCode workflow in Electron and Single Page Applications.
- Minor Backstage cleanup & unit tests
- Update DefaultToolSettingsProvide to create responsive UI.
- Added badge support to context menu items. Moved some Plugin Ui definitions to ui-abstract.
- Added support for English key-ins in addition to translated key-ins
- Flatten group in DefaultNavigationWidget
- Update order of string enums to try to avoid extract-api issues
- Added New badge for UI items
- Add basic support for redux connected components.
- Made the Status Bar & Backstage more responsive on smaller screens
- Added initial ui-abstract package setup
- Added UiAdmin with support for displaying Menus and Toolbars at a location
- Refactored BackstageComposer.
- Expand tool zone bounds over unused bottom zones.
- Correctly fill merged zones.
- Update presentation rules of imodel components' hierarchies to hide private models and their content
- Fix defaultState of StagePanel.
- Raise BackstageEvent from BackstageManager.
- Remove CSS class that was adding extra padding to the bottom of editor fields in narrow layout.
- Removed unused package

## 1.6.0
Wed, 09 Oct 2019 20:28:43 GMT

### Updates

- Add support for CursorMenu
- Clear internal row/column selection data when number or rows change in Table. Add definitions for platform MeasureTools.
- Fix Tool Settings label to ensure it stays in sync with active tool.
- Added AutoSuggest component and improved KeyinBrowser component
- Close tool group panel on toolbar item click.
- Ability to drag and resize tool settings widget.
- Ignore widgetDef state in WidgetContentRenderer of tool settings.

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- AccuDraw Popup Editors. Improved editor sizes. Editor Params improvements.
- Initial Accudraw Ui components - Buttons, ContextMenus, Calculator, Editors. IconInput in ui-core.
- Backport Sections and ViewAttributes Status Fields from Design Review for use with plugins.
- Cursor Prompt no longer displays as small blank popup when Tool Assistance instruction is blank
- Fixed Frontstage resizing problem exposed by Chrome update
- Don't try to correct clip plane handle location when plane has been moved outside project extents. Updated image for two finger drag svg.
- Changed ToolWidget, NavigatonWidget, and Toolbar render method to only render items in state and to not generate them during render.
- Add support for panelLabel property for a GoupButton. This is the title that is shown when the group is opened.
- Added FrontstageProvider.initializeDef param for FrontstageDef
- Correct ViewClipByPlaneTool icon.
- UiDataProvider class, work on PluginUiProvider
- Change BackstageItemSpec to use localized strings not keys to be localized due to the way Plugins provide localization.
- Create a common IModelViewPort control that supports Design Review and ui-test-app.
- Add ability to pre-load hierarchies in Visibility Widget
- Tool Assistance changes per UX Design
- Support for Modifier key + wide SVG
- Tool Assistance for Ctrl+Z and other chars
- Fixed ToolAssistanceField pin problem
- Tool assistance: Measure tools, view clip tools, and touch cursor inputs.
- Added touch entries to ToolAssistanceImage
- Update the tree (empty data) be more descriptive and generic.
- In the Model/Category/Spatial trees, center the error message
- Upgrade to TypeScript 3.6.2
- Ability to collapse stage panel using StagePanelDef.
- Stage panel header.
- Make components aware of safe area insets.

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

### Updates

- Using Checkbox component in BooleanEditor. Cleaned up cell editor positioning.
- Updated inputs and button padding for iModel.js. Fixed Popup colors & z-index.
- Added support for content view minSize properties
- Fixed SplitPane pane 2 size. Upgraded react-split-pane to 0.1.87.
- Addressed some warnings introduced with React 16.9
- Listening for onSelectedViewportChanged to set active content view for viewports
- Had to back up to react-split-pane 0.1.77
- Allow an app to specify touch-specific instructions in tool assistance.
- Visibility Component: Preserve active tree state by saving and restoring scroll position

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Add markupTool definitions. Update to use latest icon library
- Add support for BackstageComposer so Plugins can add backstage items.
- Fix dragged widget offset.
- Widget with isToolSettings honors defaultState
- Move MarkupTool definitions to their own class.
- Fixed location of ContentLayout within 9-zone area and Stage Panels
- Added CursorPopupRenderer to render multiple CursorPopups per RelativePosition.
- Added CursorPrompt, improved Pointer messages
- Added @bentley/icons-generic to dependencies which was wrongly set in devDependencies.
- Fixed Group Button history is overlapping a Popup Button panel when hovering over the Group button
- Allow enter key in arguments field of keyin browser to trigger command execution. Select text on focus in to allow easy argument replacement
- Added icons to markup/redline
- Fixed Zone mergeWithZone processing
- Port RealityData widget from Design Review.
- Added icon for redline text tool
- Update FilteringInput to use updated search box design from UX. Also updated ModelSelectorTree to work with changes and marked ModelSelector as deprecated.
- Add tool assistance for SelectTool.
- Update SelectTool to display tool setting by default.
- Moved Point, PointProps, Rectangle, RectangleProps, Size and SizeProps to ui-core from ui-ninezone
- Improved ToolAssistance item spacing. ViewSelector shows current view.
- Made Tool Settings tab tooltip more concise & clearer
- Close ListPicker popup when clicking the button.
- Initialize stage panel size from size prop.
- VisibilityTree: Fix not all models' visibility being changed when changing visibility of parent subject
- Visibility Tree: Handle `Viewport.isAlwaysDrawnExclusive` flag when determining and handling Element display states
- Backport Visibility Widget from Design Review
- Update to latest icon package version.

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

### Updates

- Update so both Tool and Navigation wigets refresh when PluginUiProvider is loaded.
- Support ToolbarItemInsertSpecs with conditional visibility. Update toolbar processing to better handle situations where number of visible items change.
- Add support for GroupItemInsertSpec, badges, and svg symbolId in ToolbarItemInsertSpecs
- Removed redundant call to OidcClient.initialize in UiFramework.
- Add PluginUiManager class and PluginUiProvider interface that will be used by Plugins to specify UI components to add to an iModeljs application.
- Added CursorInformation and CursorPopup
- Upgraded to Redux 4.0.3 that fixed combineReducers
- Add basic support to display an svg file for an toolbar item image.
- Added ToolAssistance support and Tool.iconSpec
- Fixed Toolbar resizing, ContextMenu className and $buic-row-hover & $buic-row-selection
- Rerender widget tabs when WidgetDef changes.
- Close ListPicker on outside click.
- Ability to close Panel of PopupButton.
- Remove node selection logic from model Tree
- Convert Widget, Zone and StagePanel components to PureComponents.
- Model Picker: Fix presentation ruleset
- VisibilityTree: Update visual styles.
- Visibility Tree: Only show Subject nodes which have child Subjects, PhysicalPartitions or SpatialLocationPartitions.
- React to ui-ninezone changes.

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Added beta badge support to toolbar buttons and widget tabs
- Cleaned up console warnings
- Eliminate need to cache tool setting properties by ensuring active tool is available before activeToolChanged event is fired.
- Added prefixes to Dialog & ContextMenu to CSS classes for positioning
- Removed missing group descriptions
- Added support for 'HTMLElement | string' for message strings
- Fixed Minimum/Maximum window toast message spam
- Fixed ActionButtonItemDef random key unit test
- Removed 4 dangerouslySetInnerHtml usages to help with Security audit; 3 remain on purpose.
- Save & Restore View Layouts
- Force toolsettings to refresh when a tool is started even if new toolId is same as active toolId.
- Added *.svg to .npmignore file
- Fix issue where cached tool settings values in UI would get out of sync with actual values in tool.
- Update to TypeScript 3.5
- Fix model selector view sync problem
- Added MessageManager.addToMessageCenter. ui-framework unit tests.
- Reuse ui-ninezone stage panels.
- Visibility Tree: Auto-expand root node
- Visibility Tree: Fix incorrect category status when category is displayed directly under subject
- Visibility Tree: Use a more fool-proof node type checking
- Visibility Tree: Update subject node icons
- Visibility Tree: Disable subjects and models if active view is not spatial
- Visibility Tree: Avoid re-rendering the tree multiple times when receiving multiple view change notifications in a row
- The VisibilityTree component now ensures displayed models are loaded.
- Added ViewSelector.updateShowSettings to control which view types are displayed

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Switched from iModelHub Project API to Context API
- Disable SyncUi test that occasionally fails on CI job.
- Added UI Logger & UiError usage & improved i18n calls
- Fix spelling error and rename frontstageKey to iModelId since token was used to inform ui when imodel changed.
- Fix setWidgetState(Hidden)
- Support touch move for navigation controls.
- Moved NoChildrenProps, OmitChildrenProp and flattenChildren to ui-core from ui-ninezone
- Added Overflow button support
- InputFieldMessages are now hosted by ConfigurableUiContent control.
- Release tag cleanup and ui-framework unit tests
- Updated UI package release tags for 1.0 release.
- Fixed release tag warnings in UI packages
- Removed use of OidcClientWrapper.
- Remove console log message output by SyncUiEventDispatcher. Add Logging.
- Changed some release tags from @hidden to @internal
- Add alpha level support for solar timeline
- Fix widget content renderer when widget prop changes.
- Prevent configurableui wrapper from creating a stacking context.
- Use the updated onCheckboxClick API inside ModelSelectorTree and VisibilityTree.
- Visibility Tree: Fix reference subjects being hidden even when they have nested subjects
- Visibility Tree: Fix statuses of subjects and elements
- Visibility Tree: Refactor subjects' status checking and elements' category and model ids' retrieval for better performance
- Visibility Tree: Enable all subcategories' display when making category visible
- Add a notification event when a view is chosen in ViewSelector. #124295. ViewSelector incorrectly handles the case when a selected view has not initialized with a viewport.
- Added ViewSelectorChangedEvent

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Update to when active tool properties are cached for toolsettings.
- Fixed NotificationManager.openMessageBox amd OutputMessageAlert.Dialog implementations to support HTML tags
- @beta tags for Toolbar. More React.PureComponent usage. Added constructors to prevent deprecated warnings. Coverage minimum thresholds.
- Fixed AppButton onClick on Firefox and bar color
- Removed Redux from AppState in ui-test-app and made Backstage stateful
- Refactor category/model picker
- CommonProps usage in ui-framework. SvgPath sample in ui-test-app. Added tools/build/tslint-docs.json.
- Added 'Register' link back to SignIn component. Added ExternalIModel test widget. Made AppBackstage in ui-test-app Redux connected again.
- Added missing package prefix to some CSS class names in ui-core, ui-components & ui-framework
- Reverted CubeNavigationAid changes
- Added 2D drawing navigation aid
- Added 100% coverage to DrawingNavigationAid, fixed snapshot leaks for InputField.test.snap
- Show/Hide UI enhancements. Widget Opacity enhancements.
- Added local snapshot support to ui-test-app. Added specialized div components to ui-core.
- Fix broken links
- Fixed Viewport heights & initial navigation aid. Widget transparency.
- Added StagePanel support to the Frontstage
- From hackathon-ui-team: StagePanels, UI Show/Hide, PopupButtons
- Put sourcemap in npm package.
- Correctly align ElementTooltip in subsequent Viewports.
- Render ElementTooltip above ViewportDialog.
- Add unmount component test.
- Move AnalysisAnimation Tool to ui-test-app. To be replaced by new timeline animation component.
- Fixed navigation aid bugs
- Fixes to OidcBrowserClient.
- Added SignIn presentational component to ui-components. Removed --ignoreMissingTags extract-api option.
- Require React & React-dom 16.8
- Remove IModelApp subclasses
- Setup a generic context for tracking client requests, and made various related enhancements to logging, usage tracking and authorization.
- Added ViewportDialog in ui-test-app, ui-core/ContributeGuidelines.md. TSLint rules in ui-core for no-default-export & completed-docs. @beta release tags.
- Minimized serialization/deserialization costs when round tripping SAML based AccessToken-s.
- Rename AppState to SessionState to avoid collision with acutal App's state. Add AvailableSectionScopes to SessionState.
- Move SelectionScope status field from test app to ui-framework. Update icons-generic-webfont version to latest available.
- Remove need to sync SelectionMethod since it is not changed within tool code.
- Move timeline components from ui-test-app to ui-components package
- Tool Settings: removed minimize tab, added min to title bar, styled title
- Auto close popups when clicking outside.
- Return rulset promises in Category/Model picker _initialize()
- Use GlobalContextMenu in category picker and modify to better follow UX standards.
- Added ui-framework release tags and common/api/ui-framework.api.md
- UI documentation - added to Learning section
- Fix hidden tabs issue.
- Added ModelessDialog & ModelessDialogManager
- In Category picker show only categories with elements
- Check for ruleset before removing
- Wait for category/model rulsets to load before creating groups.
- Manage category picker tree nodes via id instead of node
- Fix Model Selector's ruleset. It contained invalid ECExpression for LabelOverride rule which caused labels in some cases to be incorrect and ECExpression parsing errors in our logs.
- Prevent widget content unmount.
- Removed IStatusBar and fixed incorrect Toast animateOuTo prop value.
- Visibility Tree: Use per-model category display overrides
- Visibility Tree: Show tooltips explaining why checkbox status is what it is
- Visibility Tree: Fix some subjects not being displayed in the hierarchy
- Visibility Tree: Do not show nodes for reference subjects with no children
- Visibility Tree: Set correct icons
- Visibility Tree: Update hierarchy to hide specific kinds of nodes
- Visibility Tree: When changing assembly display state, also change its children state
- Visibility Tree: Update checkbox states when activeView prop is changed
- Visibility Tree: Set paging size on the data provider to avoid excessive backend requests
- Update tests for better coverage and move certain components to test app that should not be in framework.
- Unit tests and fixed ColorEditor alignment
- Upgrade TypeDoc dependency to 0.14.2
- Add ListPickerBase test to trigger item expansion.
- Changed props for CubeRotationChangeEvents

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Added 'uifw-' to ContentLayout CSS class names and others. Fixed Status Bar separators.
- Added 'uifw-' prefix to most ui-framework CSS class names
- Fixed .npmignore in ui-framework to include JSON files in lib
- Cleaned up index.scss for variables & mixins in ui-core and added classes.scss that generates CSS
- Add SaturationPicker for use with ColorType editor.
- Made ContentLayoutManager.setActiveLayout callable by apps
- Update ModelSelector when changes are made to ViewState
- Add models visibility tree

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- OIDC changes needed for Angular client
- Renamed CSS files to SCSS
- UI documentation fixes
- Added ToggleEditor. Support for defaultTool in Frontstage. Fixed BooleanEditor sizing.
- Use new buildIModelJsBuild script
- Removed rowHeight function from ModelSelector, because heights changed to default.
- Updated view query in ViewSelector to exclude private views
- Remove unneeded typedoc plugin dependency
- Support for including CSS files in published UI packages
- Include descriptions (if any) in category and model picker
- Added styling capability to messages
- More ui-framework unit tests
- Removed dependency on BWC. Parts of BWC copied into ui-core in preparation for theming support.
- Added ToggleEditor. Support for defaultTool in Frontstage.
- Save BUILD_SEMVER to globally accessible map
- Change setImmediate to setTimeout. Fixed cube rotation issue.
- Cleanup of DefaultToolSetting provider
- Move property definitions to imodeljs-frontend so they could be used by tools to define properties for tool settings.
- Fixed ModelSelector highlighting when hovered or clicked on node.
- Fixed ModelSelector row height.
- Added priority support for pointer messages
- Change 'Categories' ruleset to return either spatial or drawing categories based on ruleset variable
- Changed node style processing in model selector
- Set initial ModelSelector selection based on ViewState
- Load models when selected in picker
- Force scene invalidation when toggling items in model selector
- Render unique filter in model/category widget when changing tabs
- Add spinner to model/category widget
- Cache model/category tree
- Make one call to update viewport
- Enabled descriptions in model selector
- Map model/category nodes to items with unique id
- Show spinner while waiting to load category list
- Added strings for reality data picker
- Added support for UI color themes
- Keyboard Shortcut keys in context menu. ui-core unit test branches.
- Fix dependencies
- Update to use newer generic-icons-webfont package.
- Upgrade to TypeScript 3.2.2
- WIP: ViewportComponent unit tests. Removed imodeljs-clients-backend dependency from ui-framework

## 0.188.0
Wed, 16 Jan 2019 16:36:09 GMT

_Version update only_

## 0.187.0
Tue, 15 Jan 2019 15:18:59 GMT

_Version update only_

## 0.186.0
Mon, 14 Jan 2019 23:09:10 GMT

### Updates

- Added activated, deactivated & ready notification for Frontstages. Added support for nested frontstages.
- Add Status Field to show selection count

## 0.185.0
Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0
Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Improved state management in ModelSelector
- Improve performance for show/hide/invert buttons in model selector
- Clearing content controls on Frontstage deactivate
- Keyboard Shortcut support
- Renamed connection getter to imodel

## 0.183.0
Mon, 07 Jan 2019 21:49:21 GMT

_Version update only_

## 0.182.0
Mon, 07 Jan 2019 13:31:34 GMT

### Updates

- Do not show SubCategory if it has no siblings

## 0.181.0
Fri, 04 Jan 2019 13:02:40 GMT

### Updates

- Add SyncUi support for ConfigurableUi controls.

## 0.180.0
Wed, 02 Jan 2019 15:18:23 GMT

_Version update only_

## 0.179.0
Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Added showDialogInitially support to ActivityMessageDetails
- Synchronizing navigation aids with view definition changes
- Fix model selector to only show non-private spatial models

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

### Updates

- Added StringGetter support to ItemDefBase, ItemProps & ToolButton. Added IModelApp.i18n checks to Tool for unit tests.
- Fix tool panel alignment issue.

## 0.177.0
Wed, 12 Dec 2018 17:21:32 GMT

### Updates

- Moved checkbox responsibility to nodes
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

- Add SignIn and SignOut to the index file

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

- More information logged from BriefcaseManager.\nFixed deletion/cleanup of invalid briefcases.\nAdded OIDC support for simpleviewtest application.
- Removed ConfigurableUiManager.addFrontstageDef and other unused/old methods and components

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- Fix to OIDC browser client.

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- Include presentation rulesets in package

## 0.168.0
Sat, 17 Nov 2018 14:20:11 GMT

### Updates

- Fixed OidcBrowserClient comparision of redirect path.

## 0.167.0
Fri, 16 Nov 2018 21:45:44 GMT

### Updates

- Overhaul category/model picker to use presentation rules
- Fixed some content control sizing issues
- Moved most isHidden logic for toolbar items into ui-ninezone
- Hiding items by rendering them conditionally instead of using a CSS class.
- Tree cell editing unit tests
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

- OIDC related enhancments (WIP).
- Updated to TypeScript 3.1
- ui-core unit tests. Fixed backstage open issue.
- Zone & Widget initial state, more ui-core unit tests, cleaned up ui-framework index.ts files.

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

### Updates

- Added JSX specification for Frontstage, Zone & Widget
- Fixed ui-framework unit test

## 0.162.0
Wed, 24 Oct 2018 19:20:07 GMT

### Updates

- Merge and fix framework test warning
- Tooltips, ToolAdmin.activeToolChanged support, SheetNavigationAid/SheetsModalFrontstage improvements.
- Ui Documentation
- Vertical PropertyGrid layout improvements. PropertyGrid background color. Setting the widget state.
- Added NotificationManager.isToolTipSupported so that we can avoid asking for tooltip message when _showToolTip isn't implemented by application.
- Adding SyncUiEventDispatcher

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

