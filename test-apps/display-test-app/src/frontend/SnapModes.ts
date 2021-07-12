/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { createComboBox } from "@bentley/frontend-devtools";
import { SnapMode } from "@bentley/imodeljs-frontend";
import { DisplayTestApp } from "./App";

const multiSnapModes = [
  SnapMode.NearestKeypoint,
  SnapMode.Nearest,
  SnapMode.Intersection,
  SnapMode.MidPoint,
  SnapMode.Origin,
  SnapMode.Center,
  SnapMode.Bisector,
];

const multiSnapMode = -1;

function changeSnapModes(value: SnapMode): void {
  if (multiSnapMode !== (value as number)) {
    DisplayTestApp.setActiveSnapMode(value);
  } else {
    DisplayTestApp.setActiveSnapModes(multiSnapModes);
  }
}

export function addSnapModes(container: HTMLElement): HTMLElement {
  const cb = createComboBox({
    name: "Snap Mode: ",
    id: "snapModes",
    parent: container,
    value: SnapMode.NearestKeypoint,
    handler: (select: HTMLSelectElement) => changeSnapModes(Number.parseInt(select.value, 10)),
    entries: [
      { name: "Keypoint", value: SnapMode.NearestKeypoint },
      { name: "Nearest", value: SnapMode.Nearest },
      { name: "Center", value: SnapMode.Center },
      { name: "Origin", value: SnapMode.Origin },
      { name: "Intersection", value: SnapMode.Intersection },
      { name: "Multi-snap", value: multiSnapMode },
    ],
  });

  return cb.div;
}
