/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */

import * as child_process from "child_process";

const execSync = child_process.execSync;
let args = "";
for (let i = 2; i < process.argv.length; i++) {
  const curArg = process.argv[i];
  args += `${curArg} `;
}
execSync(`npm run start:web ${args}`, { stdio: [0, 1, 2] });
