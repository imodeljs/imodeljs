#! /usr/bin/env node

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
"use strict"
const path = require('path');
const fs = require('fs');

function getNodeModulesDir(startPath) {
  let currPath = startPath;
  let baseName = path.basename(currPath);
  while (baseName !== "node_modules") {
    currPath = path.resolve(currPath, "..")
    if (currPath === "/")
      return undefined;
    baseName = path.basename(currPath);
  }
  return currPath;
}

const nodeModules = getNodeModulesDir(path.dirname(process.argv[1]));
if (!nodeModules)
  throw ("Could not find node_modules directory");

const distDir = path.join(nodeModules, "@bentley/eslint-plugin/dist")
if (!fs.existsSync(distDir))
  throw ("Could not find required dir: " + distDir);

// Run eslint with the appropriate configuration and formatter to get a report of the no-internal rule
let args = [
  "--no-eslintrc",
  "-f", path.join(distDir, "formatters/no-internal-summary.js"),
  "--plugin", "@bentley",
  "--rule", "@bentley/no-internal:'error'",
  "--parser", "@typescript-eslint/parser",
  "--parser-options", "{project:'tsconfig.json',sourceType:'module'}",
  ...process.argv.slice(2)
];

let results;
try {
  const { execFileSync } = require('child_process');
  results = execFileSync("eslint", args);
} catch (error) {
  results = error.stdout;
}
console.log(results.toString());
