/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
/* eslint-disable no-console, comma-dangle, quote-props */
// Requires for grabbing json object from external file
import * as fs from "fs";
import { Arc3d } from "../../curve/Arc3d";
import { CoordinateXYZ } from "../../curve/CoordinateXYZ";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { DeepCompare } from "../../serialization/DeepCompare";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";
import { IndexedPolyface } from "../../polyface/Polyface";
// cspell:word geomlibs
// cspell:word BSIJSON
// directory containing imjs files produced by native geomlibs tests:
const iModelJsonNativeSamplesDirectory = "./src/test/iModelJsonSamples/fromNative/";
// directory containing imjs files produced by prior executions of this test file:
const iModelJsonSamplesDirectory = "./src/test/iModelJsonSamples/fromGC/";

function deepAlmostEqual(g0: any, g1: any): boolean {
  if (Array.isArray(g0) && Array.isArray(g1)) {
    if (g0.length !== g1.length)
      return false;
    for (let i = 0; i < g0.length; i++) {
      if (!deepAlmostEqual(g0[i], g1[i]))
        return false;
    }
    return true;
  } else if (g0 instanceof GeometryQuery && g1 instanceof GeometryQuery) {
    return g0.isAlmostEqual(g1);
  }
  return false;
}
// Output folder typically not tracked by git... make directory if not there
if (!fs.existsSync(GeometryCoreTestIO.outputRootDirectory))
  fs.mkdirSync(GeometryCoreTestIO.outputRootDirectory);
GeometryCoreTestIO.outputRootDirectory = `${GeometryCoreTestIO.outputRootDirectory}/`;
const iModelJsonOutputFolderPath = `${GeometryCoreTestIO.outputRootDirectory}iModelJsonSamples`;
if (!fs.existsSync(GeometryCoreTestIO.outputRootDirectory))
  fs.mkdirSync(GeometryCoreTestIO.outputRootDirectory);
if (!fs.existsSync(iModelJsonOutputFolderPath))
  fs.mkdirSync(iModelJsonOutputFolderPath);

/** For each property P of the json value:  save the value as a new member of the array counter.P
 */
function saveJson(jsv: object, counter: { [key: string]: any }) {
  if (typeof jsv === "object" && typeof jsv !== "function" && !Array.isArray(jsv)) {
    for (const property in jsv) {
      if (jsv.hasOwnProperty(property)) {
        // const key = "sampleData_" + property;
        const key = property;
        // Add property to counter if not already there
        if (!counter.hasOwnProperty(key))
          counter[key] = [];
        counter[key].push(jsv);
      }
    }
  }
}
/** For each property of data:  save the value in a file name `prefix + propertyName + ".json"` */
function savePropertiesAsSeparateFiles(folderPath: string, prefix: string, data: { [key: string]: any }) {
  for (const property in data) {
    if (data.hasOwnProperty(property)) {
      const filename = `${folderPath}/${prefix}${property}.imjs`;
      fs.writeFileSync(filename, JSON.stringify(data[property])); // prettyPrint(data[property]));
    }
  }
}

const allIModelJsonSamples: { [key: string]: any } = {};
// if geometry, apply dx,dy,dz.
// If array, apply dy and multiple of x shift to each member
function applyShifts(g: any, dx: number, dy: number): any {
  if (Array.isArray(g)) {
    let i = 0;
    for (const g1 of g) {
      applyShifts(g1, i * dx, dy);
      i++;
    }
    return g;
  }

  if (g instanceof GeometryQuery) {
    g.tryTranslateInPlace(dx, dy, 0);
  }
  return g;
}
function exerciseIModelJSon(ck: Checker, g: any, doParse: boolean = false, noisy: boolean = false) {
  if (Array.isArray(g)) {
    for (const g1 of g)
      exerciseIModelJSon(ck, g1, doParse, noisy);
    return;
  }

  if (g instanceof GeometryQuery) {
    const imData = IModelJson.Writer.toIModelJson(g);
    saveJson(imData, allIModelJsonSamples);
    if (noisy)
      console.log(prettyPrint(imData));
    if (doParse) {
      const g1 = IModelJson.Reader.parse(imData) as GeometryQuery;
      if (!g1 || !g.isAlmostEqual(g1)) {
        ck.announceError("IModelJson round trip error", g, prettyPrint(imData), prettyPrint(g1));
        IModelJson.Reader.parse(imData);
        console.log("*********** round trip data *********");
        console.log(prettyPrint(g));
        console.log(prettyPrint(imData));
        console.log(prettyPrint(g1));
        g.isAlmostEqual(g1);
        console.log("=====================================");

        const imData1 = IModelJson.Writer.toIModelJson(g);
        const g2 = IModelJson.Reader.parse(imData1) as GeometryQuery;
        g.isAlmostEqual(g2);
      }
      if (noisy)
        console.log("Round Trip", prettyPrint(g1));
    }
    return;
  }

}

function exerciseIModelJSonArray(ck: Checker, g: any[], doParse: boolean = false, noisy: boolean = false) {
  const writer = new IModelJson.Writer();
  const imData = writer.emit(g);
  saveJson(imData, allIModelJsonSamples);
  if (noisy)
    console.log(prettyPrint(imData));
  if (doParse) {
    const g1 = IModelJson.Reader.parse(imData) as any[];
    if (ck.testTrue(Array.isArray(g1), "[] returns as array", g1)) {
      if (ck.testExactNumber(g.length, g1.length, "Array lengths", g, g1)) {
        for (let i = 0; i < g.length; i++) {
          ck.testTrue(g[i].isAlmostEqual(g1[i]), g[i], g1[i]);
          if (noisy)
            console.log("Round Trip", prettyPrint(g1[i]));
        }
      }
    }
  }
}
//
// IModelJsonSamples workflow:
// * Each execution of it("CreateIModelJsCreateIModelJsonSamplesonSamples") constructs GeometryQuery objects and saves them in the test output
//            path     test/output/IModelJsonSamples
// * a copy of those is saved in path     test/IModelJsonSamples
// * Each execution of it("ReadIModelJson") reads tht saved files in test/IModelJsonSamples, converts to GeometryQuery, converts that back to
//     json and does a deep compare of the before/after json
//

describe("CreateIModelJsonSamples", () => {
  it("GeometryQueryToIModelJS", () => {
    const ck = new Checker();
    const numSample = 3;
    ck.testUndefined(IModelJson.Writer.toIModelJson(undefined), "IModelJsonWriter(undefined)");

    exerciseIModelJSon(ck, Sample.createLineStrings(), true, false);
    exerciseIModelJSon(ck, Sample.createSmoothCurvePrimitives(numSample), true, false);
    exerciseIModelJSon(ck, CoordinateXYZ.create(Point3d.create(11, 7, 5)), true, false);

    exerciseIModelJSon(ck, Sample.createSimplePaths(), true, false);
    exerciseIModelJSon(ck, Sample.createSimpleLoops(), true, false);
    exerciseIModelJSon(ck, Sample.createSimpleParityRegions(), true, false);

    exerciseIModelJSon(ck, Sample.createSpheres(), true, false);
    exerciseIModelJSon(ck, Sample.createCones(), true, false);
    exerciseIModelJSon(ck, Sample.createBoxes(), true, false);
    exerciseIModelJSon(ck, Sample.createTorusPipes(), true, false);
    exerciseIModelJSon(ck, Sample.createSimpleLinearSweeps(), true, false);
    exerciseIModelJSon(ck, Sample.createSimpleRotationalSweeps(), true, false);
    exerciseIModelJSon(ck, Sample.createRuledSweeps(), true, false);

    exerciseIModelJSon(ck, applyShifts(Sample.createBsplineCurves(true), 10, 0), true, false);
    exerciseIModelJSon(ck, applyShifts(Sample.createBspline3dHCurves(), 10, 10), true, false);
    exerciseIModelJSon(ck, Sample.createXYGridBsplineSurface(4, 3, 3, 2)!, true, false);
    exerciseIModelJSon(ck, Sample.createWeightedXYGridBsplineSurface(4, 3, 3, 2, 1.0, 1.1, 0.9, 1.0)!, true, false);
    exerciseIModelJSon(ck, Sample.createSimpleIndexedPolyfaces(1), true, false);
    exerciseIModelJSon(ck, Sample.createSimplePointStrings(), true, false);
    exerciseIModelJSon(ck, Sample.createSimpleTransitionSpirals(), true, false);
    // exerciseIModelJSon(ck, Sample.createSimpleIndexedPolyfaces(3), true, true);
    // fs.writeFileSync(outputFolderPath + "sampleIModelJson.json", prettyPrint(allIModelJsonSamples));
    savePropertiesAsSeparateFiles(GeometryCoreTestIO.outputRootDirectory, "iModelJsonSamples/", allIModelJsonSamples);
    exerciseIModelJSonArray(ck, Sample.createSmoothCurvePrimitives(numSample), true, false);

    // console.log(allIModelJsonSamples);
    expect(ck.getNumErrors()).equals(0);

  });
  // exercise the secondary ArcBy3Points property, with various point formats . ..
  it("ArcByStartMiddleEnd", () => {
    const ck = new Checker();
    const json = {
      arc: [[3, 1, 0], Point3d.create(3, 3, 0), { x: 1, y: 3, z: 0 }]
    };
    // exercise variant point from json:
    const point0 = Point3d.fromJSON(json.arc[0]);
    const point1 = Point3d.fromJSON(json.arc[1]);
    const point2 = Point3d.fromJSON(json.arc[2]);
    const arc = IModelJson.Reader.parse(json);
    if (ck.testPointer(arc, "arc by 3 points") && arc instanceof Arc3d) {
      const point10 = arc.fractionToPoint(0.0);
      const point12 = arc.fractionToPoint(1.0);
      ck.testPoint3d(point0, point10, "start point");
      ck.testPoint3d(point2, point12, "end point");
      ck.testCoordinate(arc.center.distance(point0), arc.center.distance(point1));
    }
    expect(ck.getNumErrors()).equals(0);
  });

  // make a mesh with identical normals present redundantly.
  // This was incorrectly compressed by the reader.
  it("MeshWithDuplicateNormals", () => {
    const ck = new Checker();
    const mesh = IndexedPolyface.create(true, false, false, true);
    mesh.data.point.pushXYZ(0, 0, 0);
    mesh.data.point.pushXYZ(1, 0, 0);
    mesh.data.point.pushXYZ(0, 1, 0);
    mesh.data.pointIndex.push(0, 1, 2);
    mesh.data.edgeVisible.push(true, true, true);
    mesh.addNormalXYZ(0, 0, 1);
    mesh.addNormal(Vector3d.create(0, 0, 1));    // in bug state, this reuses the first normal
    mesh.addNormalXYZ(0, 0, 1);
    mesh.addNormalIndex(0);
    mesh.addNormalIndex(1);
    mesh.addNormalIndex(2);
    mesh.terminateFacet();
    ck.testExactNumber(mesh.data.pointIndex.length, 3);
    ck.testExactNumber(mesh.data.point.length, 3);
    ck.testExactNumber(mesh.data.normal!.length, 3);
    ck.testExactNumber(mesh.data.normalIndex!.length, 3);
    mesh.expectedClosure = 1;
    ck.testExactNumber(1, mesh.expectedClosure, "expectedClosure property accessors");
    const meshJson = IModelJson.Writer.toIModelJson(mesh);
    const meshB = IModelJson.Reader.parse(meshJson);
    ck.testTrue(mesh.isAlmostEqual(meshB), "confirm json round trip");
  });
  /* reread the files from several known sources */
  it("ReadIModelJson", () => {
    const ck = new Checker();
    const compareObj = new DeepCompare();
    const skipList = ["xyVectors", "readme", "README"];
    // read imjs files from various places -- some produced by native, some by geometry-core ...
    for (const sourceDirectory of [iModelJsonSamplesDirectory, iModelJsonNativeSamplesDirectory]) {
      const items = fs.readdirSync(sourceDirectory);
      let numItems = 0;
      let numValuePassed = 0;

      for (const i of items) {
        const currFile = sourceDirectory + i;
        // skip known non-round-trip files ...
        let numSkip = 0;
        for (const candidate of skipList) {
          if (currFile.lastIndexOf(candidate) >= 0)
            numSkip++;
        }
        if (numSkip > 0)
          continue;
        Checker.noisy.printJSONFailure = true;
        const data = fs.readFileSync(currFile, "utf8");
        if (Checker.noisy.reportRoundTripFileNames)
          console.log(currFile);
        let jsonObject1;
        if (data.length > 0) {
          jsonObject1 = JSON.parse(data);
        } else {
          continue;
        }
        if (jsonObject1 as object) {
          numItems++;
          const geometryQuery1 = IModelJson.Reader.parse(jsonObject1);
          const jsonObject2 = IModelJson.Writer.toIModelJson(geometryQuery1);
          if (compareObj.compare(jsonObject1, jsonObject2)) {
            if (Checker.noisy.printJSONSuccess) { console.log(`PASS: ${i}`); }
            numValuePassed++;
          } else {
            const jsonObject3 = IModelJson.Writer.toIModelJson(geometryQuery1);
            const geometryQuery3 = IModelJson.Reader.parse(jsonObject3);
            if (deepAlmostEqual(geometryQuery1, geometryQuery3)) {
              console.log(" json round trip warning.  json round trip mismatch but secondary geometry round trip matches ", currFile);
              const match0 = currFile.search("indexedMesh.numPerFace."); // The mesh flips to zero-terminated
              const match1 = currFile.search("cone.imjs");  // cone can change to cylinder
              if (match0 > 0 || match1 > 0) {
                console.log("   (This is expected for this file)");
                } else{
                console.log("jsonObject1:", prettyPrint(jsonObject1));
                console.log("jsonObject3:", prettyPrint(jsonObject3));
              }
            } else {
              ck.announceError("imjs => GeometryQuery =>imjs round trip failure", currFile);
              console.log("jsonObject1:", prettyPrint(jsonObject1));
              console.log("jsonObject2:", prettyPrint(jsonObject2));
              if (Checker.noisy.printJSONFailure) { console.log(`FAIL: ${i}`); console.log(compareObj.errorTracker); }
            }
          }
        }
      }
      if (Checker.noisy.printJSONSuccess) {
        console.log(` imjs => geometry files from ${sourceDirectory}`);
        console.log(`*************** ${numValuePassed} files passed out of ${numItems} checked`);
      }
    }
    ck.checkpoint("BSIJSON.ParseIMJS");
    expect(ck.getNumErrors()).equals(0);
  });

});
