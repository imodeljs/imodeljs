/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { ClientRequestContext, DbResult, Id64String } from "@bentley/bentleyjs-core";
import { Angle, Point3d, YawPitchRollAngles } from "@bentley/geometry-core";
import { BriefcaseDb, ECSqlStatement, Element, IModelDb, IModelHost, IModelHostConfiguration } from "@bentley/imodeljs-backend";
import {
  Code, FeatureGates, IModelReadRpcInterface, IModelWriteRpcInterface, RpcInterfaceDefinition, RpcManager, TestRpcManager,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { RobotWorldReadRpcInterface, RobotWorldWriteRpcInterface } from "../common/RobotWorldRpcInterface";
import { Barrier } from "./BarrierElement";
import { Robot } from "./RobotElement";
import { RobotWorldReadRpcImpl, RobotWorldWriteRpcImpl } from "./RobotWorldRpcImpl";
import { RobotWorld } from "./RobotWorldSchema";

// An example of how to implement a service.
// This example manages a fictional domain called "robot world",
// where robots move around on a grid, and they bump into each obstacles,
// including other robots and fixed barriers.
// The service exposes APIs to manage robots and barriers and to query their state.
// In particular, the service does collision detection between robots and obstacles.
export class RobotWorldEngine {

  private static _features = new FeatureGates();

  public static countRobotsInArray(iModelDb: IModelDb, elemIds: Id64String[]): number {
    let robotCount: number = 0;
    for (const elemId of elemIds) {
      const elem: Element = iModelDb.elements.getElement(elemId);
      if (elem.classFullName === RobotWorld.Class.Robot)
        ++robotCount;
    }
    return robotCount;
  }

  public static countRobots(iModelDb: IModelDb): number {
    return iModelDb.withPreparedStatement(`SELECT COUNT(*) from ${RobotWorld.Class.Robot}`, (stmt: ECSqlStatement): number => {
      if (stmt.step() !== DbResult.BE_SQLITE_ROW)
        return 0;
      return stmt.getValue(0).getInteger();
    });
  }

  // __PUBLISH_EXTRACT_START__ ECSqlStatement.spatialQuery
  public static queryObstaclesHitByRobot(iModelDb: IModelDb, rid: Id64String): Id64String[] {
    const robot1 = iModelDb.elements.getElement<Robot>(rid);

    const selStmt =
      `SELECT rt.ECInstanceId FROM BisCore.SpatialIndex rt WHERE rt.ECInstanceId MATCH iModel_spatial_overlap_aabb(:bbox) AND rt.ECInstanceId <> :thisRobot`;

    return iModelDb.withPreparedStatement(selStmt, (stmt: ECSqlStatement) => {
      stmt.bindRange3d("bbox", robot1.placement.calculateRange());
      stmt.bindId("thisRobot", rid);
      const hits: Id64String[] = [];
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        hits.push(stmt.getValue(0).getId());
      }
      return hits;
    });
  }
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ ECSqlStatement.spatialQuery
  public static queryBarriersHitByRobot(iModelDb: IModelDb, rid: Id64String): Id64String[] {
    const robot1 = iModelDb.elements.getElement<Robot>(rid);

    const selStmt =
      `SELECT rt.ECInstanceId FROM BisCore.SpatialIndex rt WHERE rt.ECInstanceId MATCH iModel_spatial_overlap_aabb(:bbox) AND rt.ECInstanceId <> :thisRobot`;

    return iModelDb.withPreparedStatement(selStmt, (stmt: ECSqlStatement) => {
      stmt.bindRange3d("bbox", robot1.placement.calculateRange());
      stmt.bindId("thisRobot", rid);
      const hits: Id64String[] = [];
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        hits.push(stmt.getValue(0).getId());
      }
      return hits;
    });
  }
  // __PUBLISH_EXTRACT_END__

  public static moveRobot(iModelDb: IModelDb, id: Id64String, location: Point3d) {
    const r = iModelDb.elements.getElement<Robot>(id);
    r.placement.origin = location;
    iModelDb.elements.updateElement(r);
  }

  // __PUBLISH_EXTRACT_START__ Element.createGeometricElement3d.example-code
  public static insertRobot(iModelDb: IModelDb, modelId: Id64String, name: string, location: Point3d, radius: number = 0.1): Id64String {
    const props = {
      model: modelId,
      code: Code.createEmpty(),
      classFullName: RobotWorld.Class.Robot,      // In this example, I know what class and category to use.
      category: Robot.getCategory(iModelDb).id,
      geom: Robot.generateGeometry(radius),       // In this example, I know how to generate geometry, and I know that the placement is empty.
      placement: { origin: location, angles: new YawPitchRollAngles() },
      userLabel: name,
      radius,                                     // Add extra, Robot-specific properties. Be sure to spell them correctly, as the compiler won't help you here.
    };
    return iModelDb.elements.insertElement(props);
  }
  // __PUBLISH_EXTRACT_END__

  public static insertBarrier(iModelDb: IModelDb, modelId: Id64String, location: Point3d, angle: Angle, length: number): Id64String {
    const props = {      // I know what class and category to use.
      model: modelId,
      code: Code.createEmpty(),
      classFullName: RobotWorld.Class.Barrier,
      category: Barrier.getCategory(iModelDb).id,
      geom: Barrier.generateGeometry(length),
      placement: { origin: location, angles: new YawPitchRollAngles(angle, Angle.zero(), Angle.zero()) },
      length,
    };
    return iModelDb.elements.insertElement(props);
  }

  public static async initialize(_requestContext: ClientRequestContext): Promise<void> {
    const config = new IModelHostConfiguration();
    config.appAssetsDir = path.join(__dirname, "assets");
    await IModelHost.startup(config);

    RpcManager.registerImpl(RobotWorldWriteRpcInterface, RobotWorldWriteRpcImpl); // register impls that we don't want in the doc example
    this.registerImpls();
    const interfaces = this.chooseInterfacesToExpose();
    if (this._features.check("robot.imodel.readwrite"))  // choose additional interfaces that we don't want in the doc example
      interfaces.push(IModelWriteRpcInterface); // eslint-disable-line deprecation/deprecation
    TestRpcManager.initialize(interfaces);

    // __PUBLISH_EXTRACT_START__ Schema.registerSchema
    // Register the TypeScript schema classes that I intend to use.
    RobotWorld.registerSchema();
    // __PUBLISH_EXTRACT_END__

    // __PUBLISH_EXTRACT_START__ Schema.importSchema
    // Make sure the RobotWorld schema is in the iModel.
    BriefcaseDb.onOpened.addListener((requestContext: AuthorizedClientRequestContext | ClientRequestContext, iModel: IModelDb) => {
      RobotWorld.importSchema(requestContext, iModel); // eslint-disable-line @typescript-eslint/no-floating-promises
    });
    // __PUBLISH_EXTRACT_END__
  }

  private static registerImpls() {
    // __PUBLISH_EXTRACT_START__ RpcInterface.registerImpls
    RpcManager.registerImpl(RobotWorldReadRpcInterface, RobotWorldReadRpcImpl);
    // __PUBLISH_EXTRACT_END__
  }

  // __PUBLISH_EXTRACT_START__ RpcInterface.selectInterfacesToExpose
  private static chooseInterfacesToExpose(): RpcInterfaceDefinition[] {
    const interfaces: RpcInterfaceDefinition[] = [IModelReadRpcInterface, RobotWorldReadRpcInterface];

    if (this._features.check("robot.imodel.readwrite")) {
      interfaces.push(RobotWorldWriteRpcInterface);
    }

    return interfaces;
  }
  // __PUBLISH_EXTRACT_END__

  public static async shutdown(): Promise<void> {
    await IModelHost.shutdown();
  }
}
