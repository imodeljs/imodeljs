/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as path from "path";
import { Guid, OpenMode, ProcessDetector } from "@bentley/bentleyjs-core";
import { IModelJson, LineSegment3d, Point3d, Transform, YawPitchRollAngles } from "@bentley/geometry-core";
import { Code, IModelWriteRpcInterface } from "@bentley/imodeljs-common";
import {
  BriefcaseConnection, EditingFunctions, ElementEditor3d, IpcApp,
} from "@bentley/imodeljs-frontend";
import { ElectronApp } from "@bentley/electron-manager/lib/ElectronFrontend";

describe("BriefcaseTxns", () => {
  if (ProcessDetector.isElectronAppFrontend) {
    let imodel: BriefcaseConnection;

    before(async () => {
      await ElectronApp.startup();
    });

    after(async () => {
      await ElectronApp.shutdown();
    });

    beforeEach(async () => {
      const filePath = path.join(process.env.IMODELJS_CORE_DIRNAME!, "core/backend/lib/test/assets/planprojection.bim");
      imodel = await BriefcaseConnection.openStandalone(filePath, OpenMode.ReadWrite);
    });

    afterEach(async () => {
      await imodel.close();
    });

    it("receives events from TxnManager", async () => {
      type TxnEvent = "onElementsChanged" | "onModelsChanged" | "onModelGeometryChanged" | "onCommit" | "onCommitted" | "onChangesApplied" | "onBeforeUndoRedo" | "onAfterUndoRedo";
      const received: TxnEvent[] = [];
      const txnEventNames: TxnEvent[] = ["onElementsChanged", "onModelsChanged", "onModelGeometryChanged", "onCommit", "onCommitted", "onChangesApplied", "onBeforeUndoRedo", "onAfterUndoRedo"];
      for (const event of txnEventNames) {
        imodel.txns[event].addListener(() => {
          received.push(event);
        });
      }

      const expected: TxnEvent[] = [];
      const expectEvents = async (additionalEvents: TxnEvent[]): Promise<void> => {
        // The backend sends the events synchronously but the frontend receives them asynchronously relative to this test.
        // So we must wait until all expected events are received. If our expectations are wrong, we may end up waiting forever.
        for (const additionalEvent of additionalEvents)
          expected.push(additionalEvent);

        const wait = async (): Promise<void> => {
          if (received.length >= expected.length)
            return;

          await new Promise<void>((resolve: any) => setTimeout(resolve, 100));
          return wait();
        };

        await wait();
        expect(received).to.deep.equal(expected);
      };

      const expectCommit = async (evts: TxnEvent[]) => expectEvents(["onCommit", ...evts, "onCommitted"]);

      const editor = await ElementEditor3d.start(imodel);
      const editing = new EditingFunctions(imodel);

      const dictModelId = await imodel.models.getDictionaryModel();
      const category = await editing.categories.createAndInsertSpatialCategory(dictModelId, Guid.createValue(), { color: 0 });
      await imodel.saveChanges();
      await expectCommit(["onElementsChanged"]);

      const model = await editing.models.createAndInsertPhysicalModel(await editing.codes.makeModelCode(imodel.models.repositoryModelId, Guid.createValue()));
      await imodel.saveChanges();
      await expectCommit(["onElementsChanged", "onModelsChanged"]);

      const insertLine = async () => {
        const segment = LineSegment3d.create(new Point3d(0, 0, 0), new Point3d(1, 1, 1));
        const geom = IModelJson.Writer.toIModelJson(segment);
        const props = { classFullName: "Generic:PhysicalObject", model, category, code: Code.createEmpty() };
        await editor.createElement(props, segment.point0Ref, new YawPitchRollAngles(), geom);
        const ret = await editor.writeReturningProps();
        expect(Array.isArray(ret)).to.be.true;
        expect(ret.length).to.equal(1);
        expect(ret[0].id).not.to.be.undefined;
        return ret[0].id!;
      };

      // NB: onCommit is produced *after* we process all changes. onModelGeometryChanged is produced *during* change processing.
      const elem1 = await insertLine();
      await imodel.saveChanges();
      await expectEvents(["onModelGeometryChanged", "onCommit", "onElementsChanged", "onCommitted"]);

      await editor.startModifyingElements([elem1]);
      await editor.applyTransform(Transform.createTranslationXYZ(1, 0, 0).toJSON());
      await editor.write();
      await imodel.saveChanges();
      await expectEvents(["onModelGeometryChanged", "onCommit", "onElementsChanged", "onCommitted"]);

      await IModelWriteRpcInterface.getClientForRouting(imodel.routingContext.token).deleteElements(imodel.getRpcProps(), [elem1]);
      await imodel.saveChanges();
      await expectEvents(["onModelGeometryChanged", "onCommit", "onElementsChanged", "onCommitted"]);

      const undo = async () => IpcApp.callIpcHost("reverseSingleTxn", imodel.key);
      const expectUndoRedo = async (evts: TxnEvent[]) => expectEvents(["onBeforeUndoRedo", ...evts, "onAfterUndoRedo"]);

      // NB: Reversing or reinstating a txn calls SaveChanges.
      // SaveChanges only produces onCommit if there are actual data changes. It always produces onCommitted.
      await undo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
      await undo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
      await undo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
      await undo();
      await expectUndoRedo(["onElementsChanged", "onModelsChanged", "onChangesApplied", "onCommitted"]);
      await undo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted"]);

      const redo = async () => IpcApp.callIpcHost("reinstateTxn", imodel.key);
      await redo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted"]);
      await redo();
      await expectUndoRedo(["onElementsChanged", "onModelsChanged", "onChangesApplied", "onCommitted"]);
      await redo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
      await redo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
      await redo();
      await expectUndoRedo(["onElementsChanged", "onChangesApplied", "onCommitted", "onModelGeometryChanged"]);
    });
  }
});
