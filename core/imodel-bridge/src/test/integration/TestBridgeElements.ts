/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GroupInformationElement, IModelDb, PhysicalElement, SpatialCategory } from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, Code, CodeScopeProps, CodeSpec, ElementProps, IModelError, PhysicalElementProps, Placement3d, Placement3dProps } from "@bentley/imodeljs-common";
import { Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { TestBridgeLoggerCategory } from "./TestBridgeLoggerCategory";
import { Point3d, XYZProps, YawPitchRollAngles, YawPitchRollProps } from "@bentley/geometry-core";
import { EquilateralTriangleTileBuilder, IsoscelesTriangleTileBuilder, LargeSquareTileBuilder, RectangleTileBuilder, RightTriangleTileBuilder, SmallSquareTileBuilder, TileBuilder } from "./TestBridgeGeometry";

export enum CodeSpecs {
  Group = "TestBridge:Group",
}

export enum Categories {
  Category = "TestBridge",
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

const loggerCategory: string = TestBridgeLoggerCategory.Bridge;

export class TestBridgePhysicalElement extends PhysicalElement implements TestBridgePhysicalProps {
  /** @internal */
  public static override get className(): string { return "TestBridgePhysicalElement"; }

  public condition?: string;

  public constructor(props: TestBridgePhysicalProps, iModel: IModelDb) {
    super(props, iModel);
    this.condition = props.condition;
  }
  /** @internal */
  public override toJSON(): TestBridgePhysicalProps {
    const val = super.toJSON() as TestBridgePhysicalProps;
    val.condition = this.condition;
    return val;
  }

  protected static createElement(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any, tileBuilder: TileBuilder, classFullName: string): PhysicalElement {
    const code = TestBridgeGroup.createCode(imodel, physicalModelId, tile.guid);
    const categoryId = SpatialCategory.queryCategoryIdByName(imodel, definitionModelId, Categories.Category);
    if (undefined === categoryId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find category id for TestBridge category");
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

    // WIP - Bridge may be requested to apply an additional transform to spatial data
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

    const props: TestBridgePhysicalProps = {
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

export namespace TestBridgePhysicalElement { // eslint-disable-line no-redeclare
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

export class SmallSquareTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "SmallSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new SmallSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class LargeSquareTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "LargeSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new LargeSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RectangleTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "RectangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RectangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class EquilateralTriangleTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "EquilateralTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new EquilateralTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RightTriangleTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "RightTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RightTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class IsoscelesTriangleTile extends TestBridgePhysicalElement {
  public static override get className(): string { return "IsoscelesTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new IsoscelesTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class TestBridgeGroup extends GroupInformationElement implements TestBridgeGroupProps {
  public static override get className(): string { return "TestBridgeGroup"; }
  public groupType?: string;
  public manufactureLocation?: string;
  public manufactureDate?: Date;

  public constructor(props: TestBridgeGroupProps, iModel: IModelDb) {
    super(props, iModel);
    this.groupType = props.groupType;
    this.manufactureLocation = props.manufactureLocation;
    this.manufactureDate = props.manufactureDate;
  }

  public override toJSON(): TestBridgeGroupProps {
    const val = super.toJSON() as TestBridgeGroupProps;
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

export interface TestBridgePhysicalProps extends PhysicalElementProps {
  condition?: string;
}

export interface TestBridgeGroupProps extends ElementProps {
  groupType?: string;
  manufactureLocation?: string;
  manufactureDate?: Date;
}
