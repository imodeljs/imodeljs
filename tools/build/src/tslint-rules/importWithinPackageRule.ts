/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * This rule prevents the use of import statements that refer to other packages in the monorepo through path manipulation.
 */
import * as Lint from "tslint";
import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

export class Rule extends Lint.Rules.AbstractRule {
  public static FAILURE_STRING = "Imports beyond package boundary are not allowed";

  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new NoImportsBeyondPackageWalker(sourceFile, this.getOptions()));
  }
}

class NoImportsBeyondPackageWalker extends Lint.RuleWalker {
  constructor(sourceFile: ts.SourceFile, options: Lint.IOptions) {
    super(sourceFile, options);
  }
  public override visitImportDeclaration(node: ts.ImportDeclaration) {
    const from: string = node.moduleSpecifier.getText().slice(1, -1);
    const pathComponents: string[] = from.split("/");
    const parPaths = getParentCount(pathComponents);
    if (pathComponents[0] === "..") {
      const packageJsonPath = findPackageJson(path.resolve(path.dirname(this.getSourceFile().fileName)));

      if (packageJsonPath) {
        const packageDir = path.dirname(packageJsonPath);
        const rem = this.getSourceFile().fileName.substring(packageDir.length + 1);
        const remComponents: string[] = rem.split("/");
        const allowed: number = remComponents.length - 1;
        if (parPaths > allowed) {
          this.addFailureAtNode(node, Rule.FAILURE_STRING);
        }
      }
    }

    // call the base version of this visitor to actually parse this node
    super.visitImportDeclaration(node);
  }
}

function findPackageJson(current: string): string | undefined {
  let prev: string;
  do {
    const fileName = path.join(current, "package.json");
    if (fs.existsSync(fileName)) {
      return fileName;
    }
    prev = current;
    current = path.dirname(current);
  } while (prev !== current);
  return undefined;
}

function getParentCount(frompath: string[]): number {
  let ps: number = 0;
  for (const p of frompath) {
    if (p === "..") {
      ps = ps + 1;
    }
  }
  return ps;
}
