/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GroupInformationElement, IModelDb, PhysicalElement, SpatialCategory } from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, Code, CodeScopeProps, CodeSpec, ElementProps, IModelError, PhysicalElementProps, Placement3d, Placement3dProps } from "@bentley/imodeljs-common";
import { Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { TestConnectorLoggerCategory } from "./TestConnectorLoggerCategory";
import { Point3d, XYZProps, YawPitchRollAngles, YawPitchRollProps } from "@bentley/geometry-core";
import { EquilateralTriangleTileBuilder, IsoscelesTriangleTileBuilder, LargeSquareTileBuilder, RectangleTileBuilder, RightTriangleTileBuilder, SmallSquareTileBuilder, TileBuilder } from "./TestConnectorGeometry";

export enum CodeSpecs {
  Group = "TestConnector:Group",
}

export enum Categories {
  Category = "TestConnector",
  Casing = "Casing",
  Magnet = "Magnet",
}

export enum GeometryParts {
  SmallSquareCasing = "SmallSquareCasing",
  LargeSquareCasing = "LargeSquareCasing",
  RectangleCasing = "RectangleCasing",
  EquilateralTriangleCasing = "EquilateralTriangleCasing",
  IsoscelesTriangleCasing = "IsoscelesTriangleCasing",
  RightTriangleCasing = "RightTriangleCasing",
  CircularMagnet = "CircularMagnet",
  RectangularMagnet = "RectangularMagnet",
}

export enum Materials {
  ColoredPlastic = "ColoredPlastic",
  MagnetizedFerrite = "MagnetizedFerrite",
}

const loggerCategory: string = TestConnectorLoggerCategory.Connector;

export class TestConnectorPhysicalElement extends PhysicalElement implements TestConnectorPhysicalProps {
  /** @internal */
  public static get className(): string { return "TestConnectorPhysicalElement"; }

  public condition?: string;

  public constructor(props: TestConnectorPhysicalProps, iModel: IModelDb) {
    super(props, iModel);
    this.condition = props.condition;
  }
  /** @internal */
  public toJSON(): TestConnectorPhysicalProps {
    const val = super.toJSON() as TestConnectorPhysicalProps;
    val.condition = this.condition;
    return val;
  }

  protected static createElement(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any, tileBuilder: TileBuilder, classFullName: string): PhysicalElement {
    const code = TestConnectorGroup.createCode(imodel, physicalModelId, tile.guid);
    const categoryId = SpatialCategory.queryCategoryIdByName(imodel, definitionModelId, Categories.Category);
    if (undefined === categoryId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find category id for TestConnector category");
    }
    const stream = tileBuilder.createGeometry(categoryId, tile);
    let origin: XYZProps;
    let angles: YawPitchRollProps;

    if (tile.hasOwnProperty("Placement") && tile.Placement.hasOwnProperty("Origin")) {
      const xyz: XYZProps = {
        x: tile.Placement.Origin.x,
        y: tile.Placement.Origin.y,
        z: tile.Placement.Origin.z,
      };
      origin = xyz;
    } else {
      origin = new Point3d();
    }

    if (tile.hasOwnProperty("Placement") && tile.Placement.hasOwnProperty("Angles")) {
      const yawp: YawPitchRollProps = {
        yaw: tile.Placement.Angles.yaw,
        pitch: tile.Placement.Angles.pitch,
        roll: tile.Placement.Angles.roll,
      };
      angles = yawp;
    } else {
      angles = new YawPitchRollAngles();
    }

    // WIP - connector may be requested to apply an additional transform to spatial data
    // placement.TryApplyTransform(GetSpatialDataTransform());

    const placement: Placement3dProps = {
      origin,
      angles,
    };
    const targetPlacement: Placement3d = Placement3d.fromJSON(placement);

    const targetExtents: AxisAlignedBox3d = targetPlacement.calculateRange();
    if (!targetExtents.isNull && !imodel.projectExtents.containsRange(targetExtents)) {
      Logger.logTrace(loggerCategory, "Auto-extending projectExtents");
      targetExtents.extendRange(imodel.projectExtents);
      imodel.updateProjectExtents(targetExtents);
    }

    const props: TestConnectorPhysicalProps = {
      code,
      category: categoryId,
      model: physicalModelId,
      classFullName,
      geom: stream,
      condition: tile.condition,
      placement,
    };
    return imodel.elements.createElement(props);
  }

}

export namespace TestConnectorPhysicalElement { // eslint-disable-line no-redeclare
  export enum CasingMaterialType {
    Invalid,
    RedPlastic,
    GreenPlastic,
    BluePlastic,
    OrangePlastic,
    PurplePlastic,
    YellowPlastic,
  }
}

export class SmallSquareTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "SmallSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new SmallSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class LargeSquareTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "LargeSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new LargeSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RectangleTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "RectangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RectangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class EquilateralTriangleTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "EquilateralTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new EquilateralTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RightTriangleTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "RightTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RightTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class IsoscelesTriangleTile extends TestConnectorPhysicalElement {
  public static get className(): string { return "IsoscelesTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new IsoscelesTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class TestConnectorGroup extends GroupInformationElement implements TestConnectorGroupProps {
  public static get className(): string { return "TestConnectorGroup"; }
  public groupType?: string;
  public manufactureLocation?: string;
  public manufactureDate?: Date;

  public constructor(props: TestConnectorGroupProps, iModel: IModelDb) {
    super(props, iModel);
    this.groupType = props.groupType;
    this.manufactureLocation = props.manufactureLocation;
    this.manufactureDate = props.manufactureDate;
  }

  public toJSON(): TestConnectorGroupProps {
    const val = super.toJSON() as TestConnectorGroupProps;
    val.groupType = this.groupType;
    val.manufactureDate = this.manufactureDate;
    val.manufactureLocation = this.manufactureLocation;
    return val;
  }

  public static createCode(iModelDb: IModelDb, scope: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModelDb.codeSpecs.getByName(CodeSpecs.Group);
    return new Code({ spec: codeSpec.id, scope, value: codeValue });
  }
}

export interface TestConnectorPhysicalProps extends PhysicalElementProps {
  condition?: string;
}

export interface TestConnectorGroupProps extends ElementProps {
  groupType?: string;
  manufactureLocation?: string;
  manufactureDate?: Date;
}
