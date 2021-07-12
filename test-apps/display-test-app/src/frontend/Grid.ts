/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { parseArgs } from "@bentley/frontend-devtools";
import { GridOrientationType } from "@bentley/imodeljs-common";
import { IModelApp, Tool } from "@bentley/imodeljs-frontend";

/** Change grid settings for testing. */
export class ChangeGridSettingsTool extends Tool {
  public static override toolId = "GridSettings";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 4; }

  public override run(spacing?: number, ratio?: number, gridsPerRef?: number, orientation?: GridOrientationType): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return false;

    if (undefined !== spacing)
      vp.view.details.gridSpacing = { x: spacing, y: spacing };

    if (undefined !== ratio)
      vp.view.details.gridSpacing = { x: vp.view.details.gridSpacing.x, y: vp.view.details.gridSpacing.x * ratio };

    if (undefined !== gridsPerRef)
      vp.view.details.gridsPerRef = gridsPerRef;

    if (undefined !== orientation)
      vp.view.details.gridOrientation = orientation;

    vp.invalidateScene(); // Needed to clear cached grid decoration...
    return true;
  }

  /** The keyin accepts the following arguments:
   *  - `spacing=number` Specify x and y grid reference line spacing in meters.
   *  - `ratio=number` Specify y spacing as current x * ratio.
   *  - `gridsPerRef=number` Specify number of grid lines to display per reference line.
   *  - `orientation=0|1|2|3|4` Value for GridOrientationType.
   */
  public override parseAndRun(...inputArgs: string[]): boolean {
    let spacing;
    let ratio;
    let gridsPerRef;
    let orientation;
    const args = parseArgs(inputArgs);

    const spacingArg = args.getFloat("s");
    if (undefined !== spacingArg)
      spacing = spacingArg;

    const ratioArg = args.getFloat("r");
    if (undefined !== ratioArg)
      ratio = ratioArg;

    const gridsPerRefArg = args.getInteger("g");
    if (undefined !== gridsPerRefArg)
      gridsPerRef = gridsPerRefArg;

    const orientationArg = args.getInteger("o");
    if (undefined !== orientationArg) {
      switch (orientationArg) {
        case 0:
          orientation = GridOrientationType.View;
          break;
        case 1:
          orientation = GridOrientationType.WorldXY;
          break;
        case 2:
          orientation = GridOrientationType.WorldYZ;
          break;
        case 3:
          orientation = GridOrientationType.WorldXZ;
          break;
        case 4:
          orientation = GridOrientationType.AuxCoord;
          break;
      }
    }

    this.run(spacing, ratio, gridsPerRef, orientation);
    return true;
  }
}
