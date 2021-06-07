# Change Log - @bentley/presentation-common

This log was last generated on Thu, 03 Jun 2021 18:08:11 GMT and should not be manually modified.

## 2.16.2
Thu, 03 Jun 2021 18:08:11 GMT

_Version update only_

## 2.16.1
Thu, 27 May 2021 20:04:22 GMT

_Version update only_

## 2.16.0
Mon, 24 May 2021 15:58:39 GMT

### Updates

- Add `requiredSchemas` attribute to `Ruleset`
- Add `PropertyCategorySpecification.parentId` attribute` to support custom categories nesting.
- Added `diagnostics` attribute to all presentation requests' props.
- Call given diagnostics handler with diagnostics data whenever response has any.
- Add `propertySource` attribute to `InstanceLabelOverridePropertyValueSpecification` to allow picking property from a related instance.
- Add a new `InstanceLabelOverrideRelatedInstanceLabelSpecification` to allow picking label of a related instance.
- Release tags' review
- Introduce `requiredSchemas` attribute for presentation rules
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

- Change `Field` type guards to return boolean
- Added new HierarchyUpdateRecord type
- Disable hierarchy preloading

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

- Added 'updateHierarchyState' to PresentationIpcInterface
- Added PresentationIpcInterface
- Added an `extendedType` attribute to `PropertyInfo` interface.

## 2.13.0
Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Added HierarchyCompareInfo object that describes hierarchy changes and next step from which comparison should be continued.
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

- Add iModel key to UpdateInfo object.

## 2.11.2
Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1
Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0
Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Include all properties into properties field descriptor to make descriptor match any field that has at least one of those properties
- Updated class names in `KeySet` to be case-insensitive
- Added 'activeFormat' property on 'KindOfQuantityInfo' interface.
- Add class information to navigation properties
- Repeat RPC requests when unknown failures happen

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

- Include actual primary class ids for nested content fields
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

### Updates

- Repeat RPC requests when unknown failures happen

## 2.9.4
Wed, 02 Dec 2020 20:55:40 GMT

### Updates

- Include actual primary class ids for nested content fields

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

- Add `handlePropertiesPolymorphically` attribute to `ContentInstancesOfSpecificClasses` specification.
- Support getting distinct values for x-to-many related properties

## 2.8.1
Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0
Fri, 23 Oct 2020 17:04:02 GMT

### Updates

- Add diagnostics-related types
- Add `KeySet.some` method
- Do not hide grouping nodes when `hideNodesInHierarchy` is specified in hierarchy specification
- Do not duplicate nodes when traversing from node that merges multiple instances from the 'many' side of relationship
- Add support for specifying "*" and property overrides in `RelatedPropertiesSpecification.properties`
- Ruleset creation fails for (0, 0) 2D point

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

### Updates

- Ruleset creation fails for (0, 0) 2D point

## 2.7.0
Fri, 02 Oct 2020 18:03:32 GMT

### Updates

- Added a new `DefaultPropertyCategoryOverride` rule
- Separate polymorphism of relationship and target class
- Allow requesting distinct content values with `DescriptorOverrides` rather than descriptor itself
- Changes to `DescriptorOverrides`: deprecated `sortingFieldName` and `sortDirection` in favor of `sorting` attribute, deprecated `hiddenFieldNames` in favor of `fieldsSelector`. The latter now also allows exclusively including fields.
- Made some fields of `Descriptor` and `DescriptorSource` readonly. They were never intended to be changed, so now we make that clear.

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

- Add ability to compare hierarchies based on ruleset variables.
- Made it clear that property grouping nodes might be grouping by multiple raw values.
- Switch to ESLint

## 2.4.2
Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1
Fri, 07 Aug 2020 19:57:43 GMT

_Version update only_

## 2.4.0
Tue, 28 Jul 2020 16:26:24 GMT

### Updates

- Add `suppressSimilarAncestorsCheck` hierarchy specifications attribute.
- Add RPC methods that enforce maximum page size, deprecate the old ones.

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
-  Add ability to request distinct values in pages using field descriptors
- Deprecate `LoggingNamespaces` enum in favor of package-specific enums.
- Add support for nested property categories

## 2.2.1
Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0
Fri, 19 Jun 2020 14:10:03 GMT

_Version update only_

## 2.1.0
Thu, 28 May 2020 22:48:59 GMT

### Updates

- Fix assets not being found on backend when webpacked

## 2.0.0
Wed, 06 May 2020 13:17:49 GMT

### Updates

- Clean up deprecated APIs
- Use label definitions instead of plain string in Nodes and Content Items
- Move some @beta APIs to @public
- Added doNotHideOtherPropertiesOnDisplayOverride flag which controls display override behavior for hiding other properties
- Make sure localization files are included in the package
- Fix release tags of various JSON types
- Separate tests from source
- Add ability to set active units system for property values formatting
- Add RPC interface for comparing hierarchies
- Upgrade to Rush 5.23.2
- Remove support for the iModel.js module system by no longer delivering modules.

## 1.14.1
Wed, 22 Apr 2020 19:04:00 GMT

### Updates

- Documentation

## 1.14.0
Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0
Wed, 04 Mar 2020 16:16:31 GMT

_Version update only_

## 1.12.0
Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Fix broken links
- Make `KeySetJSON` and related types public
- Add multi-step relationship path's support in presentation rules.
- Implement multi-step relationship paths support for find similar ruleset

## 1.11.0
Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Added LabelDefinition and changed Node label property type to LabelDefinition
- Include missing assets directory into package
- Rename `ContentInstancesOfSpecificClassesSpecification.arePolymorphic` to `handleInstancesPolymorphically` to remove ambiguity
- Upgrade to TypeScript 3.7.2.

## 1.10.0
Tue, 07 Jan 2020 19:44:01 GMT

_Version update only_

## 1.9.0
Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Fix double quotes not being properly escaped when creating 'find similar' ruleset.
- Add support for multi-ECInstance nodes
- Add a way to group same-label ECInstance nodes at post-processing stage
- Add `NestedContentField.getFieldByName`
- Update sinon version.

## 1.8.0
Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Add property overrides' rule
- Deprecate `PropertiesDisplaySpecification` in favor of `PropertyOverrides`
- Deprecate `PropertyEditorsSpecification` in favor of `PropertyOverrides`

## 1.7.0
Fri, 01 Nov 2019 13:28:37 GMT

_Version update only_

## 1.6.0
Wed, 09 Oct 2019 20:28:42 GMT

_Version update only_

## 1.5.0
Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- Add `PresentationStatus.Canceled` member
- Add ability to force-load all hierarchy with the given imodel and ruleset
- Added autoExpand property to RelatedPropertiesSpecification and NestedContentField
- Add module descriptions
- Added Ruleset and Ruleset variables to request options to support stateless presentation backend
- Store navigation property classes separate from related property paths
- Upgrade to TypeScript 3.6.2

## 1.4.0
Tue, 10 Sep 2019 12:09:49 GMT

### Updates

- Escape double quotes when creating intance filter for 'find similar' ruleset
- Add NodeArtifacts presentation rule
- Add `hideExpression` attribute to node specifications

## 1.3.0
Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Add special handling for double values when creating 'similar instances' presentantation ruleset
- Add special handling for point values when creating 'similar instances' presentation ruleset
- Add special handling for DateTime values when creating 'similar instances' presentation ruleset

## 1.2.0
Wed, 24 Jul 2019 11:47:26 GMT

_Version update only_

## 1.1.0
Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Reorganize docs script output
- Add functions `KeySet.forEach` and `KeySet.forEachBatch`
- Downgrade json-schema-faker dependency to version `0.5.0-rc16` as `rc17` causes some tests to crash
- Add "String" value specification for `InstanceLabelOverride` rule
- Update to TypeScript 3.5

## 1.0.0
Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- RPC system now accepts only basic values (primitives, "interface" objects, and binary).
- Add optional predicate parameter to `KeySet.add` to filter added keys
- Add a new presentation rule `ExtendedDataRule` for injecting custom data into presentation objects.
- Refactor InstanceLabelOverride rule for more flexibility
- Added handling for timeouted backend responses with request repeating
- Add release tags
- Cleanup API
- Refactor RPC interface to use pure JSON objects
- Fix content descriptor deserialization

## 0.191.0
Mon, 13 May 2019 15:52:05 GMT

### Updates

- Adds parameter for api-extractor to validate missing release tags
- Fix broken links
- Put sourcemap in npm package.
- Fix creating a KeySet from EntityProps which have a `type` property
- Fix marshaling class instances through RPC by removing use of Readonly
- Add APIs to retrieve instance labels
- Changed `PresentationRpcInterface.computeSelection` to take `Id64String[]` instead of `EntityProps[]`
- Allow sending content descriptor overrides instead of descriptor when requesting content. This allows to competely avoid a descriptor request when content customization requirements are the same for all kinds of content
- Upgrade TypeDoc dependency to 0.14.2

## 0.190.0
Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Documentation fixes
- Fix test scripts for unix systems

## 0.189.0
Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Changes package.json to include api-extractor and adds api-extractor.json
- Added RpcResponse and PresentationRpcResponse interfaces and changed PresentationRpcInterface to return PresentationRpcResponses instead of raw values.
- Use new buildIModelJsBuild script
- Remove unneeded typedoc plugin dependency
- Create RulesetFactory API for creating presentation rulesets targeted towards specific cases, like 'find similar', etc.
- Save BUILD_SEMVER to globally accessible map
- Change `RulesetsFactory.createSimilarInstancesRuleset` return type from a `Ruleset` to `{ ruleset: Ruleset, description: string }`
- Fix RPC requests handler to re-request data if frontend got out-of-sync while syncing with the backed.
- Add selection scopes -related RPC handlers
- RPC Interface changes to optimize getting first page of nodes/content
- Expose node key type guards through index
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

### Updates

- Introduce `groupedInstancesCount` property for grouping node keys
- Add `KeySet.instanceKeysCount` and `KeySet.nodeKeysCount` which are faster versions of `KeySet.instanceKeys.size` and `KeySet.nodeKeys.size`
- Add helper functions to identify type of node key
- Add `getInstancesCount` function to calculate total number of instances included in a `KeySet`

## 0.184.0
Thu, 10 Jan 2019 22:46:17 GMT

_Version update only_

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

- Invert `isSelectable` property to `isSelectionDisabled` so in the most common case (selectable = true) we don't have to send the value

## 0.178.0
Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0
Wed, 12 Dec 2018 17:21:31 GMT

_Version update only_

## 0.176.0
Mon, 10 Dec 2018 21:19:45 GMT

### Updates

- React to signature change for RpcInterface.forward

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

_Version update only_

## 0.170.0
Mon, 26 Nov 2018 19:38:42 GMT

_Version update only_

## 0.169.0
Tue, 20 Nov 2018 16:17:15 GMT

_Version update only_

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

- Add KeySet.hasAll and KeySet.hasAny to check set contents
- Add KeySet.guid to check if keys have changed

## 0.164.0
Thu, 08 Nov 2018 17:59:20 GMT

### Updates

- Updated to TypeScript 3.1

## 0.163.0
Wed, 31 Oct 2018 20:55:37 GMT

_Version update only_

## 0.162.0
Wed, 24 Oct 2018 19:20:06 GMT

### Updates

- Fix value deserialization when values were not set (null vs undefined)
- Hide internal types from declarations and docs

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

