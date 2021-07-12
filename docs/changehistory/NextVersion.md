---
publish: false
---
# NextVersion

## Decoration graphics enhancements

### Visible edges

Graphics produced by a [GraphicBuilder]($frontend) can now produce edges for surfaces. By default, edges are only produced for graphics of type [GraphicType.Scene]($frontend), and only if the [Viewport]($frontend)'s [ViewFlags]($common) specify that edges should be displayed. To generate edges for other types of graphics, or to prevent them from being generated, override [GraphicBuilderOptions.generateEdges]($frontend) or [GraphicBuilder.wantEdges]($frontend) when creating the graphic. Note that surfaces will z-fight with their edges to a degree unless the graphic is also pickable - see [GraphicBuilderOptions.pickable]($frontend).

### Solid primitives in decorations

Decoration graphics can now be produced from [SolidPrimitive]($geometry-core)s - e.g., spheres, cones, slabs, swept surfaces, and so on - using [GraphicBuilder.addSolidPrimitive]($frontend).

## Presentation changes

Added [RelatedPropertiesSpecificationNew.skipIfDuplicate]($presentation-common) attribute to allow specification to be overriden by specifications from higher priority content modifiers. Set this attribute to all related properties' specifications in the default BisCore ruleset.

## Dictionary enhancements

[Dictionary.keys]($bentleyjs-core) and [Dictionary.values]($bentleyjs-core) enable iteration of the dictionary's keys and values in the same manner as a standard Map.

[Dictionary.findOrInsert]($bentleyjs-core) returns the existing value associated with a key, or - if none yet exists - inserts a new value with that key. It also returns a flag indicating whether or not a new value was inserted. This allows the following code that requires two lookups of the key:

```ts
let value = dictionary.get(key);
let inserted = undefined !== value;
if (undefined === value)
  inserted = dictionary.insert(key, value = newValue);

alert(`${value} was ${inserted ? "inserted" : "already present"}`);
```

To be replaced with a more efficient version that requires only one lookup:

```ts
const result = dictionary.findOrInsert(key, value);
alert(`${result.value} was ${result.inserted ? "inserted" : "already present"}`);
```
