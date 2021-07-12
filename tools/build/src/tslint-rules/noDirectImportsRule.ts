/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * This rule prevents the use of import statements that refer to source files within a package that has an index (barrel) file.
 * That is important for preventing our modules from incorporating code that should be in other modules.
 */
import * as ts from "typescript";
import * as Lint from "tslint";

export class Rule extends Lint.Rules.AbstractRule {
  public static FAILURE_STRING: string = "Imports from iModeljs modules must come from the index file, not directly from the source file.";
  public static externalModuleNames: Set<string> = new Set<string>([
    "bentleyjs-core",
    "geometry-core",
    "bwc",
    "imodeljs-i18n",
    "imodeljs-clients",
    "imodeljs-common",
    "imodeljs-quantity",
    "imodeljs-frontend",
    "ui-abstract",
    "ui-core",
    "ui-components",
    "ui-framework",
    "ui-ninezone",
    "presentation-common",
    "presentation-components",
    "presentation-frontend",
  ]);

  // override
  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    // we do not want to apply this rule to backend sources, so we use the simple heuristic to skip it
    // if any part of the filename contains "backend"
    if (-1 !== sourceFile.fileName.indexOf("backend")) {
      return [];
    }

    return this.applyWithWalker(
      new NoDirectImportWalker(sourceFile, this.getOptions()),
    );
  }
}

class NoDirectImportWalker extends Lint.RuleWalker {

  // override
  public override visitImportDeclaration(node: ts.ImportDeclaration) {
    const from: string = node.moduleSpecifier.getText().slice(1, -1);

    // it is Ok to import scss files from another package - they're not in the index file.
    if (!from.endsWith(".scss")) {
      // divide the string at the / characters.
      const pathComponents: string[] = from.split("/", 3);
      if ((pathComponents.length > 2) && (pathComponents[0] === "@bentley")) {
        if (Rule.externalModuleNames.has(pathComponents[1])) {
          this.addFailureAtNode(node, Rule.FAILURE_STRING);
        }
      }
    }
    super.visitImportDeclaration(node);
  }
}
