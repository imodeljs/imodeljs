/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HyperModeling
 */

import { SectionType } from "@bentley/imodeljs-common";
import {
  I18N,
  I18NNamespace,
} from "@bentley/imodeljs-i18n";
import {
  IModelApp,
  ScreenViewport,
  Tool,
} from "@bentley/imodeljs-frontend";
import { HyperModeling } from "./HyperModeling";
import { SectionGraphicsConfig, SectionMarkerConfig } from "./HyperModelingConfig";
import { HyperModelingDecorator } from "./HyperModelingDecorator";

/** Parses a string case-insensitively returning true for "ON", false for "OFF", undefined for "TOGGLE" or undefined, and the input string for anything else. */
function parseToggle(arg: string | undefined): string | boolean | undefined {
  if (undefined === arg)
    return undefined;

  switch (arg.toLowerCase()) {
    case "on": return true;
    case "off": return false;
    case "toggle": return undefined;
    default: return arg;
  }
}

class HyperModelingTool extends Tool {
  public static override toolId = "HyperModeling";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean, vp?: ScreenViewport): boolean {
    vp = vp ?? IModelApp.viewManager.selectedView;
    if (vp)
      HyperModeling.startOrStop(vp, enable); // eslint-disable-line @typescript-eslint/no-floating-promises

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    return typeof enable !== "string" && this.run(enable);
  }
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/** Configures how section graphics are displayed. These are global settings. If no arguments are supplied, the defaults are restored.
 * Otherwise, each argument is of the form "name=value" where value is 0 (disable) or 1 (enable). Only the first letter of each argument matters.
 *  - drawings: Whether to display the section drawing graphics. Default: 1.
 *  - sheets: Whether to display the sheet annotation graphics. Default: 1.
 *  - clip: Whether to apply clip volumes to the 2d graphics. Default: 1.
 *  - boundaries: Whether to display clip volumes as boundary shapes for debugging purposes. Default: 0.
 */
class SectionGraphicsConfigTool extends Tool {
  public static override toolId = "HyperModeling.Graphics.Config";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 4; }

  public override run(config?: SectionGraphicsConfig): boolean {
    if (!config) {
      config = {
        ignoreClip: false,
        debugClipVolumes: false,
        hideSectionGraphics: false,
        hideSheetAnnotations: false,
      };
    }

    HyperModeling.updateConfiguration({ graphics: config });
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    if (0 === args.length)
      return this.run(); // restore defaults...

    const config: Writeable<SectionGraphicsConfig> = {};
    for (const arg of args) {
      const parts = arg.toLowerCase().split("=");
      if (2 !== parts.length)
        continue;

      const value = Number.parseInt(parts[1], 10);
      if (Number.isNaN(value) || (0 !== value && 1 !== value))
        continue;

      const enable = 1 === value;
      switch (parts[0][0]) {
        case "d":
          config.hideSectionGraphics = !enable;
          break;
        case "s":
          config.hideSheetAnnotations = !enable;
          break;
        case "c":
          config.ignoreClip = !enable;
          break;
        case "b":
          config.debugClipVolumes = enable;
          break;
      }
    }

    return this.run(config);
  }
}

abstract class SectionMarkerConfigTool extends Tool {
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 3; }

  protected abstract update(config: SectionMarkerConfig): void;

  public override run(config?: SectionMarkerConfig): boolean {
    config = config ?? { ignoreModelSelector: false, ignoreCategorySelector: false, hiddenSectionTypes: [] };
    this.update(config);
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    if (0 === args.length)
      return this.run(); // restore defaults...

    const config: Writeable<SectionMarkerConfig> = {};
    for (const arg of args) {
      const parts = arg.toLowerCase().split("=");
      if (2 !== parts.length)
        continue;

      const setting = parts[0][0];
      switch (setting) {
        case "h": {
          config.hiddenSectionTypes = [];
          for (const c of parts[1]) {
            switch (c) {
              case "s":
                config.hiddenSectionTypes.push(SectionType.Section);
                break;
              case "d":
                config.hiddenSectionTypes.push(SectionType.Detail);
                break;
              case "e":
                config.hiddenSectionTypes.push(SectionType.Elevation);
                break;
              case "p":
                config.hiddenSectionTypes.push(SectionType.Plan);
                break;
            }
          }

          break;
        }
        default: {
          const intVal = Number.parseInt(parts[1], 10);
          if (!Number.isNaN(intVal) && (0 === intVal || 1 === intVal)) {
            if ("c" === setting)
              config.ignoreCategorySelector = 0 === intVal;
            else if ("m" === setting)
              config.ignoreModelSelector = 0 === intVal;
          }

          break;
        }
      }
    }

    return this.run(config);
  }
}

class SectionMarkerDefaultConfigTool extends SectionMarkerConfigTool {
  public static override toolId = "HyperModeling.Marker.Default.Config";

  protected update(config: SectionMarkerConfig): void {
    HyperModeling.updateConfiguration({ markers: config });
  }
}

class SectionMarkerDecoratorConfigTool extends SectionMarkerConfigTool {
  public static override toolId = "HyperModeling.Marker.Config";

  protected update(config: SectionMarkerConfig): void {
    const vp = IModelApp.viewManager.selectedView;
    const decorator = vp ? HyperModelingDecorator.getForViewport(vp) : undefined;
    if (decorator)
      decorator.updateConfiguration(config);
  }
}

/** @internal */
export function registerTools(namespace: I18NNamespace | undefined, i18n: I18N): void {
  const register = (tool: typeof Tool) => IModelApp.tools.register(tool, namespace, i18n);
  register(HyperModelingTool);
  register(SectionGraphicsConfigTool);
  register(SectionMarkerDecoratorConfigTool);
  register(SectionMarkerDefaultConfigTool);
}
