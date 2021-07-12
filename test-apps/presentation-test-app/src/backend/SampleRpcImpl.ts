/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { IModelHost } from "@bentley/imodeljs-backend";
import { RpcManager } from "@bentley/imodeljs-common";
import SampleRpcInterface from "../common/SampleRpcInterface";

/** The backend implementation of SampleRpcInterface. */
export default class SampleRpcImpl extends SampleRpcInterface {

  private getAssetsDir(): string {
    if (IModelHost.appAssetsDir)
      return IModelHost.appAssetsDir;
    return "assets";
  }

  public override async getSampleImodels(): Promise<string[]> {
    const dir = path.join(this.getAssetsDir(), "sample_documents");
    const files = fs.readdirSync(dir);
    return files
      .filter((name) => name.endsWith(".ibim") || name.endsWith(".bim"))
      .map((name) => path.resolve(dir, name));
  }

  public override async getAvailableRulesets(): Promise<string[]> {
    const extensions = [".PresentationRuleSet.xml", ".PresentationRuleSet.json"];
    const dir = path.join(this.getAssetsDir(), "presentation_rules");
    const files = fs.readdirSync(dir);
    return files
      .filter((fullPath) => extensions.some((ext) => fullPath.endsWith(ext)))
      .map((fullPath) => extensions.reduce((name, ext) => path.basename(name, ext), fullPath));
  }

}

/** Auto-register the impl when this file is included. */
RpcManager.registerImpl(SampleRpcInterface, SampleRpcImpl);
