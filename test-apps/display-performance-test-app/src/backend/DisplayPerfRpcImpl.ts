/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { ProcessDetector } from "@bentley/bentleyjs-core";
import { IModelHost, IModelJsFs } from "@bentley/imodeljs-backend";
import { RpcManager } from "@bentley/imodeljs-common";
import { Reporter } from "@bentley/perf-tools/lib/Reporter";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import { addColumnsToCsvFile, addDataToCsvFile, addEndOfTestToCsvFile, createFilePath, createNewCsvFile } from "./CsvWriter";

/** The backend implementation of DisplayPerfRpcImpl. */
export default class DisplayPerfRpcImpl extends DisplayPerfRpcInterface {
  private _reporter = new Reporter();
  public override async getDefaultConfigs(): Promise<string> {
    let jsonStr = "";
    let defaultJsonFile;
    if (ProcessDetector.isMobileAppBackend && process.env.DOCS) {
      defaultJsonFile = path.join(process.env.DOCS, "MobilePerformanceConfig.json");
    } else {
      defaultJsonFile = "./src/backend/DefaultConfig.json";
    }
    if (IModelJsFs.existsSync(DisplayPerfRpcInterface.jsonFilePath)) {
      jsonStr = IModelJsFs.readFileSync(DisplayPerfRpcInterface.jsonFilePath).toString();
    } else if (IModelJsFs.existsSync(defaultJsonFile)) {
      jsonStr = IModelJsFs.readFileSync(defaultJsonFile).toString();
    }
    let argOutputPath: string | undefined;
    process.argv.forEach((arg, index) => {
      if (index >= 2 && arg !== "chrome" && arg !== "edge" && arg !== "firefox" && arg !== "safari" && arg !== "headless" && arg !== "no_debug" && arg.split(".").pop() !== "json") {
        while (arg.endsWith("\\") || arg.endsWith("\/"))
          arg = arg.slice(0, -1);
        argOutputPath = `"argOutputPath": "${arg}",`;
      }
    });

    if (argOutputPath) {
      const firstBraceIndex = jsonStr.indexOf("{") + 1;
      jsonStr = jsonStr.slice(0, firstBraceIndex) + argOutputPath + jsonStr.slice(firstBraceIndex);
    }
    return jsonStr;
  }

  public override async writeExternalFile(outputPath: string, outputName: string, append: boolean, content: string): Promise<void> {
    const fileName = this.createFullFilePath(outputPath, outputName);
    if (undefined === fileName)
      return;

    const filePath = this.getFilePath(fileName);
    if (!fs.existsSync(filePath))
      this.createFilePath(filePath);

    if (!append && fs.existsSync(fileName))
      fs.unlinkSync(fileName);

    if (append)
      fs.appendFileSync(fileName, content);
    else
      fs.writeFileSync(fileName, content);
  }

  private createFilePath(filePath: string) {
    const files = filePath.split(/\/|\\/); // /\.[^/.]+$/ // /\/[^\/]+$/
    let curFile = "";
    for (const file of files) {
      if (file === "")
        break;

      curFile += `${file}\\`;
      if (!fs.existsSync(curFile))
        fs.mkdirSync(curFile);
    }
  }

  public override async consoleLog(content: string): Promise<void> {
    console.log(content); // eslint-disable-line no-console
  }

  public override async saveCsv(outputPath: string, outputName: string, rowDataJson: string, csvFormat?: string): Promise<void> {
    const rowData = new Map<string, number | string>(JSON.parse(rowDataJson));
    const testName = rowData.get("Test Name") as string;
    rowData.delete("Test Name");
    if (csvFormat === "original") {
      rowData.delete("Browser");
      if (outputPath !== undefined && outputName !== undefined) {
        if (ProcessDetector.isMobileAppBackend && process.env.DOCS)
          outputPath = process.env.DOCS;
        let outputFile = this.createFullFilePath(outputPath, outputName);
        outputFile = outputFile ? outputFile : "";
        if (IModelJsFs.existsSync(outputFile)) {
          addColumnsToCsvFile(outputFile, rowData);
        } else {
          createNewCsvFile(outputPath, outputName, rowData);
        }
        addDataToCsvFile(outputFile, rowData);
      }
    } else {
      const rowObject = this.mapToObj(rowData);
      if (process.env.browser) {
        rowObject.browser = process.env.browser;
      }
      const cpuTotalTime = rowObject["CPU Total Time"] as number;
      this._reporter.addEntry("DisplayTests", testName, "CPU Total Time", cpuTotalTime, rowObject);
      const niTotalTime = rowObject["Non-Interactive Total Time"] as number;
      const nifps = rowObject["Non-Interactive FPS"] as number;
      if (niTotalTime !== undefined && nifps !== undefined) {
        this._reporter.addEntry("DisplayTests", testName, "Non-Interactive Total Time", niTotalTime, rowObject);
        this._reporter.addEntry("DisplayTests", testName, "Non-Interactive FPS", nifps, rowObject);
      }
      const gpuTotalTime = rowObject["GPU Total Time"] as number;
      const eTotalTime = rowObject["Effective Total Time"] as number;
      const efps = rowObject["Effective FPS"] as number;
      if (gpuTotalTime !== undefined && eTotalTime !== undefined && efps !== undefined) {
        this._reporter.addEntry("DisplayTests", testName, "GPU Total Time", gpuTotalTime, rowObject);
        this._reporter.addEntry("DisplayTests", testName, "Effective Total Time", eTotalTime, rowObject);
        this._reporter.addEntry("DisplayTests", testName, "Effective FPS", efps, rowObject);
      }
      const aTotalTime = rowObject["Actual Total Time"] as number;
      const afps = rowObject["Actual FPS"] as number;
      this._reporter.addEntry("DisplayTests", testName, "Actual Total Time", aTotalTime, rowObject);
      this._reporter.addEntry("DisplayTests", testName, "Actual FPS", afps, rowObject);
    }
  }

  private getFilePath(fileName: string): string {
    const slashIndex = fileName.lastIndexOf("/");
    const backSlashIndex = fileName.lastIndexOf("\\");
    if (slashIndex > backSlashIndex)
      return fileName.substring(0, slashIndex);
    else
      return fileName.substring(0, backSlashIndex);
  }

  public override async savePng(fileName: string, png: string) {
    let filePath;
    if (ProcessDetector.isMobileAppBackend && process.env.DOCS) {
      filePath = process.env.DOCS;
      fileName = path.join(filePath, fileName);
    } else {
      filePath = this.getFilePath(fileName);
    }
    if (!IModelJsFs.existsSync(filePath)) createFilePath(filePath);
    if (IModelJsFs.existsSync(fileName)) IModelJsFs.unlinkSync(fileName);
    const buf = Buffer.from(png, "base64");
    IModelJsFs.writeFileSync(fileName, buf);
  }

  public override async finishCsv(output: string, outputPath?: string, outputName?: string, csvFormat?: string) {
    if (outputPath !== undefined && outputName !== undefined) {
      let outputFile = this.createFullFilePath(outputPath, outputName);
      outputFile = outputFile ? outputFile : "";
      if (csvFormat === "original" || !csvFormat) {
        addEndOfTestToCsvFile(output, outputFile);
      } else {
        this._reporter.exportCSV(outputFile);
      }
    }
  }

  public override async finishTest() {
    await IModelHost.shutdown();

    // Electron only
    if (app !== undefined) app.exit();

    // Browser only
    if (DisplayPerfRpcInterface.webServer) DisplayPerfRpcInterface.webServer.close();
    if (DisplayPerfRpcInterface.backendServer) DisplayPerfRpcInterface.backendServer.close();
    if (DisplayPerfRpcInterface.chrome) await DisplayPerfRpcInterface.chrome.kill();
  }

  private createFullFilePath(filePath: string | undefined, fileName: string | undefined): string | undefined {
    if (fileName === undefined)
      return undefined;
    if (filePath === undefined)
      return fileName;
    else
      return path.join(filePath, fileName);
  }

  private mapToObj(map: Map<string, number | string>) {
    const obj: { [key: string]: string | number } = {};
    map.forEach((value: number | string, key: string) => {
      obj[key] = value;
    });
    return obj;
  }

  private createEsvFilename(fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".");
    if (-1 !== dotIndex)
      return `${fileName.substring(0, dotIndex)}_ESV.json`;
    return `${fileName}.sv`;
  }

  public override async readExternalSavedViews(bimfileName: string): Promise<string> {
    const esvFileName = this.createEsvFilename(bimfileName);
    if (!IModelJsFs.existsSync(esvFileName)) {
      return "";
    }
    const jsonStr = IModelJsFs.readFileSync(esvFileName).toString();
    if (undefined === jsonStr)
      return "";
    return jsonStr;
  }

  /**
   * See https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript
   * Get regex to find strings matching a given rule wildcard. Makes sure that it is case-insensitive.
   */
  private _matchRuleRegex(rule: string) {
    rule = rule.toLowerCase();
    const escapeRegex = (str: string) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp(`^${rule.split("*").map(escapeRegex).join(".*")}$`, "i");
  }

  public override async getMatchingFiles(rootDir: string, pattern: string): Promise<string> {
    const fileNames = JSON.stringify(IModelJsFs.recursiveFindSync(rootDir, this._matchRuleRegex(pattern)));
    return fileNames;
  }

}

/** Auto-register the impl when this file is included. */
RpcManager.registerImpl(DisplayPerfRpcInterface, DisplayPerfRpcImpl);
