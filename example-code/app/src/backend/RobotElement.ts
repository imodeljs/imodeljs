/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Arc3d, Point3d } from "@bentley/geometry-core";
// __PUBLISH_EXTRACT_START__ Element.subclass
import { IModelDb, SpatialCategory, SpatialLocationElement } from "@bentley/imodeljs-backend";
import { GeometryStreamBuilder, GeometryStreamProps } from "@bentley/imodeljs-common";
import { RobotWorld } from "./RobotWorldSchema";

/**
 * An example of defining a subclass of SpatialLocationElement.
 * Normally, you would start writing a class like this by generating the TypeScript class
 * definition from the schema. Then, you would then hand-edit it to add methods.
 * In this example, a "robot" is represented as a circle in the X-Y plane.
 */
export class Robot extends SpatialLocationElement {
  public static override get className(): string { return "Robot"; }
  //  Define the properties added by this subclass
  public radius: number = 0.1;                     // The girth of the robot

  // Note: Do not redefine the constructor. You must not interfere with the constructor that is
  // already defined by the base Element class.

  // You can provide handy methods for creating new Robots
  public static generateGeometry(radius: number = 0.1): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();  // I know what graphics represent a robot.
    const circle = Arc3d.createXY(Point3d.createZero(), radius);
    builder.appendGeometry(circle);
    return builder.geometryStream;
  }

  public static getCategory(iModel: IModelDb): SpatialCategory {
    return RobotWorld.getCategory(iModel, RobotWorld.Class.Robot);
  }

  // You can write methods to implement business logic that apps can call.
  public someBusinessLogic(): void {
    if (this.radius < 12.34) {
      // ... do something ...
    }
  }
}
// __PUBLISH_EXTRACT_END__
