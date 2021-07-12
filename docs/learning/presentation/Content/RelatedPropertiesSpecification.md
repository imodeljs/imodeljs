# RelatedProperties Content Modifier

> Based on [RelatedPropertiesSpecification]($presentation-common) interface.

This content modifier allows including related instance properties into the selected instance content.

## Attributes

Name | Required? | Type | Default | Meaning
-|-|-|-|-
`propertiesSource` | Yes | `RelationshipPathSpecification` | | [Specification of the relationship path](../RelationshipPathSpecification.md) to follow when looking for related properties.
`handleTargetClassPolymorphically` | No | `boolean` | `false` | Should the target class specified in `propertiesSource` be handled polymorphically. This means properties of not only the target class, but also all its subclasses are loaded.
`relationshipMeaning` | No | `"SameInstance" \| "RelatedInstance"` | `"RelatedInstance"` | Meaning of the relationship. See [below](#relationship-meaning-attribute) for more details.
`properties` | No | `Array<string \| PropertySpecification> \| "_none_" \| "*"` | All properties in target class | List of names or definitions of related class properties that should be included in the content. `_none_` means none of the properties should be picked up. `*` means all properties should be picked up and is also allowed to be specified as a member item - see [examples](#examples) section.
`autoExpand` | No | `boolean` | `false` | Should field containing related properties be automatically expanded. Only takes effect when related properties are displayed as a struct.
`skipIfDuplicate` | No | `boolean` | `false` | Should this related properties specification be ignored if it duplicates another higher priority specification for the same relationship.

### Relationship Meaning Attribute

The attribute tells the presentation rules engine what the related properties mean to the instance whose properties are displayed. There are two possible options:

- `RelatedInstance` means that the properties should be distinguished from properties of the [primary instance](./Terminology.md#primary-instance) and shown separately to make it clear they belong to another instance.

- `SameInstance` means that the properties should be displayed as if they belonged to the [primary instance](./Terminology.md#primary-instance).

In general, when properties are displayed in a property grid, this attribute provides a way to control how properties are categorized. See [property categorization page](./PropertyCategorization.md) page for more details.

## Examples

Pick "MyProperty1" and "MyProperty2" properties from all related aspects that have them:

```JSON
{
  "propertiesSource": {
    "relationship": {"schemaName": "BisCore", "className": "ElementOwnsUniqueAspect"},
    "direction": "Forward",
    "targetClass": {"schemaName": "BisCore", "className": "ElementUniqueAspect"}
  },
  "handleTargetClassPolymorphically": true,
  "relationshipMeaning": "SameInstance",
  "properties": ["MyProperty1", {"name": "MyProperty2"}]
}
```

Pick all properties from related model and override label of "UserLabel" property:

```JSON
{
  "propertiesSource": {
    "relationship": {"schemaName": "BisCore", "className": "ModelContainsElements"},
    "direction": "Backward",
    "targetClass": {"schemaName": "BisCore", "className": "Model"}
  },
  "relationshipMeaning": "RelatedInstance",
  "properties": ["*", {
    "name": "UserLabel",
    "labelOverride": "My Custom Related Property Label"
  }]
}
```
