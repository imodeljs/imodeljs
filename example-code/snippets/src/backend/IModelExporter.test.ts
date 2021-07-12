/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// __PUBLISH_EXTRACT_START__ IModelExporter_CodeExporter.code

import { Code, CodeSpec } from "@bentley/imodeljs-common";
import { Element, IModelJsFs as fs, IModelDb, IModelExporter, IModelExportHandler, SnapshotDb } from "@bentley/imodeljs-backend";

/** CodeExporter creates a CSV output file containing all Codes from the specified iModel. */
class CodeExporter extends IModelExportHandler {
  public outputFileName: string;

  /** Initiate the export of codes. */
  public static async exportCodes(iModelDb: IModelDb, outputFileName: string): Promise<void> {
    const exporter = new IModelExporter(iModelDb);
    const exportHandler = new CodeExporter(outputFileName);
    exporter.registerHandler(exportHandler);
    await exporter.exportAll();
  }

  /** Construct a new CodeExporter */
  private constructor(outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
  }

  /** Override of IModelExportHandler.onExportElement that outputs a line of a CSV file when the Element has a Code. */
  protected override onExportElement(element: Element, isUpdate: boolean | undefined): void {
    if (!Code.isEmpty(element.code)) { // only output when Element has a Code
      const codeSpec: CodeSpec = element.iModel.codeSpecs.getById(element.code.spec);
      fs.appendFileSync(this.outputFileName, `${element.id}, ${codeSpec.name}, ${element.code.value}\n`);
    }
    super.onExportElement(element, isUpdate);
  }
}

// __PUBLISH_EXTRACT_END__
import * as path from "path";
import { IModelTestUtils } from "./IModelTestUtils";

describe("IModelExporter", () => {
  let iModelDb: SnapshotDb;
  before(() => { iModelDb = IModelTestUtils.openSnapshotFromSeed("test.bim"); });
  after(() => { iModelDb.close(); });

  it("call CodeExporter example code", async () => {
    const outputDirName = path.join(__dirname, "output");
    const outputFileName = path.join(outputDirName, "test.bim.codes.csv");
    if (!fs.existsSync(outputDirName)) {
      fs.mkdirSync(outputDirName);
    }
    if (fs.existsSync(outputFileName)) {
      fs.removeSync(outputFileName);
    }
    await CodeExporter.exportCodes(iModelDb, outputFileName);
  });
});
