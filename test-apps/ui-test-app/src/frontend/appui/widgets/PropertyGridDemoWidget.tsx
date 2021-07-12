/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames } from "@bentley/ui-abstract";
import { PropertyCategory, PropertyGrid, PropertyUpdatedArgs, SimplePropertyDataProvider } from "@bentley/ui-components";
import { Orientation } from "@bentley/ui-core";
import { ConfigurableCreateInfo, ConfigurableUiManager, ContentControl, WidgetControl } from "@bentley/ui-framework";
import { HorizontalAnchor, WidgetContent } from "@bentley/ui-ninezone";

class SamplePropertyRecord extends PropertyRecord {
  constructor(name: string, index: number, value: any, typename: string = StandardTypeNames.String, editor?: string) {
    const v = {
      valueFormat: PropertyValueFormat.Primitive,
      value,
      displayValue: value.toString(),
    } as PrimitiveValue;
    const p = {
      name: name + index,
      displayLabel: name,
      typename,
    } as PropertyDescription;
    if (editor)
      p.editor = { name: editor, params: [] };
    super(v, p);

    this.description = `${name} - description`;
    this.isReadonly = false;
  }
}

class SamplePropertyDataProvider extends SimplePropertyDataProvider {

  constructor() {
    super();

    this.addCategory({ name: "Group_1", label: "Group 1", expand: true });
    this.addCategory({ name: "Group_2", label: "Miscellaneous", expand: false });
    this.addCategory({ name: "Geometry", label: "Geometry", expand: true });

    const categoryCount = this.categories.length;

    for (let i = 0; i < categoryCount; i++) {
      for (let iVolume = 0; iVolume < 10; iVolume++) {

        const enumPropertyRecord = new SamplePropertyRecord("Enum", iVolume, 0, StandardTypeNames.Enum);
        enumPropertyRecord.property.enum = { choices: [], isStrict: false };
        enumPropertyRecord.property.enum.choices = [
          { label: "Yellow", value: 0 },
          { label: "Red", value: 1 },
          { label: "Green", value: 2 },
          { label: "Blue", value: 3 },
        ];

        const booleanPropertyRecord = new SamplePropertyRecord("Boolean", iVolume, true, StandardTypeNames.Boolean, iVolume % 2 ? StandardEditorNames.Toggle : undefined);
        // booleanPropertyRecord.editorLabel = "Optional CheckBox Label";

        const propData = [
          [
            new SamplePropertyRecord("CADID", iVolume, "0000 0005 00E0 02D8"),
            new SamplePropertyRecord("ID_Attribute", iVolume, "34B72774-E885-4FB7-B031-64D040E37322"),
            new SamplePropertyRecord("Name", iVolume, "DT1002"),
            enumPropertyRecord,
            booleanPropertyRecord,
          ],
          [
            new SamplePropertyRecord("ID", iVolume, "34B72774-E885-4FB7-B031-64D040E37322", ""),
            new SamplePropertyRecord("Model", iVolume, "Default"),
            new SamplePropertyRecord("Level", iVolume, "Default"),
          ],
          [
            new SamplePropertyRecord("Area", iVolume, "6.1875", "ft2"),
            new SamplePropertyRecord("Height", iVolume, "1.375", "ft"),
            new SamplePropertyRecord("Width", iVolume, "4.5", "ft"),
            new SamplePropertyRecord("Integer", iVolume, "5", "", StandardTypeNames.Int),
            new SamplePropertyRecord("Float", iVolume, "7.0", "", StandardTypeNames.Float),
          ],
        ];

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let j = 0; j < propData[i].length; j++) {
          this.addProperty(propData[i][j], i);
        }
      }
    }
  }
}

export class VerticalPropertyGridWidgetControl extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    super.reactNode = <VerticalPropertyGridWidget />;
  }
}

class VerticalPropertyGridWidget extends React.Component {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: PropertyValue): PropertyRecord {
    return record.copyWithNewValue(newValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  };

  public override render() {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Vertical} isPropertySelectionEnabled={true}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} />
    );
  }
}

ConfigurableUiManager.registerControl("VerticalPropertyGridDemoWidget", VerticalPropertyGridWidgetControl);

export class HorizontalPropertyGridWidgetControl extends WidgetControl {
  private _ref = React.createRef<WidgetContent>();

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = (
      <WidgetContent
        anchor={HorizontalAnchor.Right}
        content={
          <HorizontalPropertyGridWidget style={{ overflow: "unset" }} />
        }
        ref={this._ref}
      />
    );
  }

  public override restoreTransientState() {
    this._ref.current && this._ref.current.forceUpdate();
    return true;
  }
}

export class HorizontalPropertyGridWidgetControl2 extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = (
      <HorizontalPropertyGridWidget style={{ overflow: "unset" }} />
    );
  }
}

class HorizontalPropertyGridWidget extends React.Component<{ style?: React.CSSProperties }> {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: PropertyValue): PropertyRecord {
    return record.copyWithNewValue(newValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  };

  public override render() {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Horizontal}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} style={this.props.style} />
    );
  }
}

ConfigurableUiManager.registerControl("HorizontalPropertyGridDemoWidget", HorizontalPropertyGridWidgetControl);

export class HorizontalPropertyGridContentControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <HorizontalPropertyGridContent />;
  }
}

class HorizontalPropertyGridContent extends React.Component {
  private _dataProvider: SamplePropertyDataProvider;

  constructor(props: any) {
    super(props);

    this._dataProvider = new SamplePropertyDataProvider();
  }

  private _updatePropertyRecord(record: PropertyRecord, newValue: PropertyValue): PropertyRecord {
    return record.copyWithNewValue(newValue);
  }

  private _handlePropertyUpdated = async (args: PropertyUpdatedArgs, category: PropertyCategory): Promise<boolean> => {
    let updated = false;

    if (args.propertyRecord) {
      const newRecord = this._updatePropertyRecord(args.propertyRecord, args.newValue);
      const catIdx = this._dataProvider.findCategoryIndex(category);
      if (catIdx >= 0)
        this._dataProvider.replaceProperty(args.propertyRecord, catIdx, newRecord);
      updated = true;
    }

    return updated;
  };

  public override render(): React.ReactNode {
    return (
      <PropertyGrid dataProvider={this._dataProvider} orientation={Orientation.Horizontal} isPropertySelectionEnabled={true}
        isPropertyEditingEnabled={true} onPropertyUpdated={this._handlePropertyUpdated} />
    );
  }
}

ConfigurableUiManager.registerControl("HorizontalPropertyGridDemoContent", HorizontalPropertyGridContentControl);
