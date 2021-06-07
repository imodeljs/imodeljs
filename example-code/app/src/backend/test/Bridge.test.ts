/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
// __PUBLISH_EXTRACT_START__ Bridge.imports.example-code
import { Id64String } from "@bentley/bentleyjs-core";
import { ContextRegistryClient, Project } from "@bentley/context-registry-client";
import { Angle, AngleProps, Point3d, Range3d, XYZProps } from "@bentley/geometry-core";
import { HubIModel } from "@bentley/imodelhub-client";
import {
  BriefcaseDb, BriefcaseManager, CategorySelector, ConcurrencyControl, DefinitionModel, DisplayStyle3d, IModelDb, IModelHost, IModelHubBackend, ModelSelector,
  OrthographicViewDefinition, PhysicalModel, SpatialCategory, Subject,
} from "@bentley/imodeljs-backend";
import { ColorByName, IModel } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { Barrier } from "../BarrierElement";
import { Robot } from "../RobotElement";
import { RobotWorldEngine } from "../RobotWorldEngine";
import { KnownTestLocations } from "./KnownTestLocations";

// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Bridge.source-data.example-code
interface BarrierProps {
  location: XYZProps;
  angle: AngleProps;
  length: number;
}

interface RobotProps {
  location: XYZProps;
  name: string;
}

interface RobotWorldProps {
  barriers: BarrierProps[];
  robots: RobotProps[];
}

// In this simple example, the source format is assumed to be JSON. It could be anything that the bridge
// can read. In this simple example, the conversion does not involve any alignment transformations. In general,
// the bridge's logic would perform non-trivial alignment of the source data into a BIS industry domain schema.
function convertToBis(briefcase: IModelDb, modelId: Id64String, data: RobotWorldProps) {
  for (const barrier of data.barriers) {
    RobotWorldEngine.insertBarrier(briefcase, modelId, Point3d.fromJSON(barrier.location), Angle.fromJSON(barrier.angle), barrier.length);
  }
  for (const robot of data.robots) {
    RobotWorldEngine.insertRobot(briefcase, modelId, robot.name, Point3d.fromJSON(robot.location));
  }
}

// __PUBLISH_EXTRACT_END__

async function queryProjectIdByName(requestContext: AuthorizedClientRequestContext, projectName: string): Promise<Project> {
  return (new ContextRegistryClient()).getProject(requestContext, {
    $select: "*",
    $filter: `Name+eq+'${projectName}'`,
  });
}

async function createIModel(requestContext: AuthorizedClientRequestContext, contextId: string, iModelName: string, seedFile: string) {
  try {
    const iModelId = await IModelHost.hubAccess.queryIModelByName({ requestContext, contextId, iModelName });
    if (iModelId !== undefined)
      await IModelHost.hubAccess.deleteIModel({ requestContext, contextId, iModelId });
  } catch (_err) {
  }
  // __PUBLISH_EXTRACT_START__ Bridge.create-imodel.example-code
  const imodelRepository: HubIModel = await IModelHubBackend.iModelClient.iModels.create(requestContext, contextId, iModelName, { path: seedFile });
  // __PUBLISH_EXTRACT_END__
  return imodelRepository;
}

// __PUBLISH_EXTRACT_START__ Bridge.firstTime.example-code
async function runBridgeFirstTime(requestContext: AuthorizedClientRequestContext, iModelId: string, projectId: string, assetsDir: string) {
  // Start the IModelHost
  await IModelHost.startup();
  requestContext.enter();

  const props = await BriefcaseManager.downloadBriefcase(requestContext, { contextId: projectId, iModelId });
  requestContext.enter();
  const briefcase = await BriefcaseDb.open(requestContext, { fileName: props.fileName });
  requestContext.enter();

  briefcase.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

  // I. Import the schema.
  await briefcase.importSchemas(requestContext, [path.join(assetsDir, "RobotWorld.ecschema.xml")]);
  //    You must acquire all locks and reserve all Codes used before saving or pushing.
  await briefcase.concurrencyControl.request(requestContext);
  //    You *must* push this to the iModel right now.
  briefcase.saveChanges();
  await briefcase.pullAndMergeChanges(requestContext);
  await briefcase.pushChanges(requestContext, "bridge test");

  // II. Import data

  // 1. Create the bridge's job subject and definition models.
  //    To keep things organized and to avoid name collisions with other bridges and apps,
  //    a bridge should normally create its own unique subject and then scope its models and
  //    definitions under that.
  const jobSubjectId = Subject.insert(briefcase, IModel.rootSubjectId, "RobotWorld"); // Job subject name must be unique among job subjects
  const defModelId = DefinitionModel.insert(briefcase, jobSubjectId, "definitions");

  //  Create the spatial categories that will be used by the Robots and Barriers that will be imported.
  SpatialCategory.insert(briefcase, defModelId, Robot.classFullName, { color: ColorByName.silver });
  SpatialCategory.insert(briefcase, defModelId, Barrier.classFullName, { color: ColorByName.brown });

  // 2. Convert elements, aspects, etc.

  // For this example, we'll put all of the in-coming elements in a single model.
  const spatialModelId = PhysicalModel.insert(briefcase, jobSubjectId, "spatial model 1");

  //  Pretend that I connected to a datasource and read it.
  //  In this simple example, the source format is JSON. It could be anything.
  //  Whatever the format, the bridge must be able to read it.
  const sourceData: RobotWorldProps = {
    barriers: [
      { location: { x: 0, y: 5, z: 0 }, angle: { degrees: 0 }, length: 5 },
    ],
    robots: [
      { location: { x: 0, y: 0, z: 0 }, name: "r1" },
    ],
  };
  convertToBis(briefcase, spatialModelId, sourceData);

  // 3. Create views.
  //    Note that the view definition and helper objects go into the definition model, not the spatial model.
  //    Note how Element IDs are captured as strings.
  const viewName = "Test Robot View";
  const modelSelectorId = ModelSelector.insert(briefcase, defModelId, viewName, [spatialModelId]);
  const spatialCategoryIds = [Robot.getCategory(briefcase).id, Barrier.getCategory(briefcase).id];
  const categorySelectorId = CategorySelector.insert(briefcase, defModelId, viewName, spatialCategoryIds);
  const displayStyleId = DisplayStyle3d.insert(briefcase, defModelId, viewName);
  const viewRange = new Range3d(0, 0, 0, 10, 10, 1); // Note that you could compute the extents from the imported geometry. But real-world assets have known extents.
  OrthographicViewDefinition.insert(briefcase, defModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, viewRange);

  //  III. Push the data changes to iModel Server

  // 1. Acquire Resources
  //    You must acquire all locks and reserve all Codes used before saving or pushing.
  await briefcase.concurrencyControl.request(requestContext);

  // 2. Pull and then push.
  //    Note that you pull and merge first, in case another user has pushed.
  //    Also note that after pushing, all locks will be released.
  briefcase.saveChanges();
  await briefcase.pullAndMergeChanges(requestContext);
  await briefcase.pushChanges(requestContext, "bridge test");
}
// __PUBLISH_EXTRACT_END__

describe.skip("Bridge", async () => {

  let requestContext: AuthorizedClientRequestContext;
  let testProjectId: string;
  let seedPathname: string;
  let imodelRepository: HubIModel;

  before(async () => {
    await IModelHost.startup();
    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.superManager);
    testProjectId = (await queryProjectIdByName(requestContext, "iModelJsIntegrationTest")).wsgId;
    seedPathname = path.join(KnownTestLocations.assetsDir, "empty.bim");
    imodelRepository = await createIModel(requestContext, testProjectId, "BridgeTest", seedPathname);
    await IModelHost.shutdown();
  });

  afterEach(async () => {
    await IModelHost.shutdown();
  });

  it("should run bridge the first time", async () => {
    const assetsDir = path.join(__dirname, "..", "assets");
    await runBridgeFirstTime(requestContext, imodelRepository.wsgId, testProjectId, assetsDir);
  });
});
