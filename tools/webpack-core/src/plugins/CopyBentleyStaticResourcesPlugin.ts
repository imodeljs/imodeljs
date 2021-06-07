/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs-extra";
import * as path from "path";
import { Compiler } from "webpack";
import { paths, resolveApp } from "../utils/paths";
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/naming-convention */
const CopyPlugin = require("copy-webpack-plugin");
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/naming-convention */

abstract class AbstractAsyncStartupPlugin {
  private _name: string;
  private _promise!: Promise<any>;

  constructor(name: string) {
    this._name = name;
  }

  public apply(compiler: Compiler) {
    compiler.hooks.beforeRun.tap(this._name, () => {
      this._promise = this.runAsync(compiler);
    });

    compiler.hooks.afterEmit.tapPromise(this._name, async () => {
      await this._promise;
    });
  }

  public abstract runAsync(compiler: Compiler): Promise<any>;
}

async function isDirectory(directoryName: string) {
  return (await fs.stat(directoryName)).isDirectory();
}

async function tryCopyDirectoryContents(source: string, target: string) {
  if (!fs.existsSync(source))
    return;

  const copyOptions = { dereference: true, preserveTimestamps: true, overwrite: false, errorOnExist: false };
  try {
    if (await isDirectory(source) && fs.existsSync(target) && await isDirectory(target)) {
      for (const name of await fs.readdir(source)) {
        await tryCopyDirectoryContents(path.join(source, name), path.join(target, name));
      }
    } else {
      await fs.copy(source, target, copyOptions);
    }
  } catch (err) {
    console.log(`Error trying to copy '${source}' to '${target}': ${err.toString()}`);
  }
}

/** Prefer use of CopyStaticAssetsPlugin instead.
 * @note Will be removed in 3.0
 * @deprecated
 */
export class CopyBentleyStaticResourcesPlugin extends AbstractAsyncStartupPlugin {
  private _directoryNames: string[];
  private _useDirectoryName: boolean;

  constructor(directoryNames: string[], useDirectoryName?: boolean) {
    super("CopyBentleyStaticResourcesPlugin");
    this._directoryNames = directoryNames;
    this._useDirectoryName = undefined === useDirectoryName ? false : useDirectoryName;
  }

  public async runAsync(compiler: Compiler) {
    const bentleyDir = path.resolve(paths.appNodeModules, "@bentley");
    const subDirectoryNames = await fs.readdir(bentleyDir);
    for (const thisSubDir of subDirectoryNames) {
      if (!(await isDirectory(path.resolve(bentleyDir, thisSubDir))))
        continue;

      const fullDirName = path.resolve(bentleyDir, thisSubDir);
      for (const staticAssetsDirectoryName of this._directoryNames) {
        await tryCopyDirectoryContents(
          path.join(fullDirName, "lib", staticAssetsDirectoryName),
          this._useDirectoryName ? compiler.outputPath : path.join(compiler.outputPath, staticAssetsDirectoryName),
        );
      }
    }
  }
}

export class CopyAppAssetsPlugin extends AbstractAsyncStartupPlugin {
  constructor(private _assetsDir: string = "assets") {
    super("CopyAppAssetsPlugin");
  }

  public async runAsync(compiler: Compiler) {
    const outAssetsDir = path.resolve(compiler.outputPath, "assets");
    await tryCopyDirectoryContents(resolveApp(this._assetsDir), outAssetsDir);
  }
}

export class CopyStaticAssetsPlugin {
  private _scopes: string[];
  private _fromTo: string;

  constructor({ scopes = ["@bentley", "@itwin"], fromTo = "public" }) {
    this._scopes = scopes;
    this._fromTo = fromTo;
  }

  private _getPatterns() {
    if (!this._scopes || !this._fromTo) {
      return [];
    }

    const patterns = [];
    const fromTo = this._fromTo;

    for (const scope of this._scopes) {
      patterns.push({
        from: `**/${fromTo}/**/*`,
        context: `node_modules/${scope}`,
        noErrorOnMissing: true,
        to({ absoluteFilename }: { absoluteFilename: string }) {
          const regex = new RegExp(`(${fromTo}(?:\\\\|\/))(.*)`);
          return regex.exec(absoluteFilename)![2];
        },
      });
    }
    return patterns;
  }

  public apply(compiler: Compiler) {
    const patterns = this._getPatterns();
    new CopyPlugin({ patterns }).apply(compiler);
  }
}
