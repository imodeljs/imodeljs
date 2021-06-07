/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64, Id64Arg, Id64Set } from "@bentley/bentleyjs-core";
import { AppearanceOverrideProps, ColorDef, EmphasizeElementsProps, FeatureAppearance, FeatureOverrideType, RgbColor } from "@bentley/imodeljs-common";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { FeatureOverrideProvider } from "./FeatureOverrideProvider";
import { Viewport } from "./Viewport";

/** An implementation of [[FeatureOverrideProvider]] for emphasizing selected elements through simple color/transparency appearance overrides.
 * @public
 */
export class EmphasizeElements implements FeatureOverrideProvider {
  private _defaultAppearance?: FeatureAppearance;
  private _unanimatedAppearance?: FeatureAppearance;
  private _emphasizeIsolated?: Id64Set;
  private _overrideAppearance?: Map<number, Id64Set>;
  private readonly _emphasizedAppearance = FeatureAppearance.fromJSON({ emphasized: true });

  /** If true, all overridden and emphasized elements will also have the "emphasis" effect applied to them. This causes them to be hilited using the current [[Viewport.emphasisSettings]]. */
  public wantEmphasis = false;

  /** Establish active feature overrides to emphasize elements and apply color/transparency overrides.
   * @see [[Viewport.addFeatureOverrideProvider]]
   */
  public addFeatureOverrides(overrides: FeatureSymbology.Overrides, vp: Viewport): void {
    const emphasizedElements = this.getEmphasizedElements(vp);
    if (undefined !== emphasizedElements) {
      overrides.setDefaultOverrides(this._defaultAppearance!);
      const app = this.wantEmphasis ? this._emphasizedAppearance : FeatureAppearance.defaults;
      emphasizedElements.forEach((id) => { overrides.overrideElement(id, app); });
    }

    const overriddenElements = this.getOverriddenElements();
    if (undefined !== overriddenElements) {
      if (undefined !== this._defaultAppearance)
        overrides.setDefaultOverrides(this._defaultAppearance);
      for (const [key, ids] of overriddenElements) {
        const ovrApp = this.createAppearanceFromKey(key);
        ids.forEach((id) => { overrides.overrideElement(id, ovrApp); });
      }
    }

    if (this._unanimatedAppearance) {
      if (this._unanimatedAppearance.isFullyTransparent)
        overrides.neverDrawnAnimationNodes.add(0);
      else
        overrides.animationNodeOverrides.set(0, this._unanimatedAppearance);
    }
  }

  /** @internal */
  protected createAppearanceFromKey(key: number): FeatureAppearance {
    let transparency: number | undefined;
    let rgb: RgbColor | undefined;

    if (key < 0) {
      transparency = Math.abs(key);
    } else {
      const color = ColorDef.fromJSON(key);
      rgb = RgbColor.fromColorDef(color);
      if (0 !== color.getAlpha()) // Fully transparent signifies to use color only...
        transparency = color.getTransparency() / 255;
    }

    const emphasized = this.wantEmphasis ? true : undefined;
    return FeatureAppearance.fromJSON({ rgb, transparency, emphasized });
  }

  /** Get override key from color and override type */
  public createOverrideKey(color: ColorDef, override: FeatureOverrideType): number | undefined {
    const colorValues = color.colors;
    switch (override) {
      case FeatureOverrideType.ColorAndAlpha:
        return 255 === colorValues.t ? undefined : color.tbgr; // Hiding elements should be done using neverDrawn, not transparency...
      case FeatureOverrideType.ColorOnly:
        return ColorDef.from(colorValues.r, colorValues.g, colorValues.b, 255).tbgr;
      case FeatureOverrideType.AlphaOnly:
        return -(colorValues.t / 255);
    }
  }

  /** Get color and override type for the given key. */
  public getOverrideFromKey(key: number): { overrideType: FeatureOverrideType, color: ColorDef } {
    let overrideType;
    let color;

    if (key < 0) {
      color = ColorDef.from(0, 0, 0, 255 * Math.abs(key));
      overrideType = FeatureOverrideType.AlphaOnly;
    } else {
      color = ColorDef.fromJSON(key);
      if (0 === color.getAlpha()) {
        color = color.withAlpha(255);
        overrideType = FeatureOverrideType.ColorOnly;
      } else {
        overrideType = FeatureOverrideType.ColorAndAlpha;
      }
    }

    return { overrideType, color };
  }

  /** Establish a default appearance to apply to elements without overrides. If changing the default appearance
   * without also calling overrideElements, an explicit refresh must be requested for the change to take effect.
   * @see [[Viewport.setFeatureOverrideProviderChanged]]
   */
  public get defaultAppearance(): FeatureAppearance | undefined { return this._defaultAppearance; }
  public set defaultAppearance(appearance: FeatureAppearance | undefined) { this._defaultAppearance = appearance; }

  /** Establish a default appearance to apply to elements that are not animated by the view's [RenderSchedule.Script]($common).
   * @note If this is the only change made to EmphasizeElements, you must call [[Viewport.setFeatureOverrideProviderChanged]] for
   * the change to take immediate effect.
   * @see [[createDefaultAppearance]] to create an appearance suitable for de-emphasizing the non-animated elements.
   */
  public get unanimatedAppearance(): FeatureAppearance | undefined {
    return this._unanimatedAppearance;
  }
  public set unanimatedAppearance(appearance: FeatureAppearance | undefined) {
    this._unanimatedAppearance = appearance;
  }

  /** Create default appearance to use for emphasizeElements when not supplied by caller. */
  public createDefaultAppearance(): FeatureAppearance {
    return FeatureAppearance.fromJSON({
      rgb: new RgbColor(0xe4, 0xe4, 0xe4),
      transparency: 0.8,
      nonLocatable: true,
    });
  }

  /** Get the IDs of the currently never drawn elements. */
  public getNeverDrawnElements(vp: Viewport): Id64Set | undefined {
    return (undefined !== vp.neverDrawn && 0 !== vp.neverDrawn.size ? vp.neverDrawn : undefined);
  }

  /** Get the IDs of the currently always drawn elements. */
  public getAlwaysDrawnElements(vp: Viewport): Id64Set | undefined {
    return (undefined !== vp.alwaysDrawn && 0 !== vp.alwaysDrawn.size ? vp.alwaysDrawn : undefined);
  }

  /** Get the IDs of the currently hidden elements. */
  public getHiddenElements(vp: Viewport): Id64Set | undefined {
    return this.getNeverDrawnElements(vp);
  }

  /** Get the IDs of the currently isolated elements. */
  public getIsolatedElements(vp: Viewport): Id64Set | undefined {
    return (vp.isAlwaysDrawnExclusive ? this.getAlwaysDrawnElements(vp) : undefined);
  }

  /** Get the IDs of the currently emphasized isolated elements. */
  public getEmphasizedIsolatedElements(): Id64Set | undefined {
    return (undefined !== this._defaultAppearance && undefined !== this._emphasizeIsolated && 0 !== this._emphasizeIsolated.size ? this._emphasizeIsolated : undefined);
  }

  /** Get the IDs of the currently emphasized elements. */
  public getEmphasizedElements(vp: Viewport): Id64Set | undefined {
    return (undefined !== this.getEmphasizedIsolatedElements() ? this._emphasizeIsolated : (undefined !== this._defaultAppearance && !vp.isAlwaysDrawnExclusive ? this.getAlwaysDrawnElements(vp) : undefined));
  }

  /** Get the map of current elements with color/transparency overrides. */
  public getOverriddenElements(): Map<number, Id64Set> | undefined {
    return (undefined !== this._overrideAppearance && 0 !== this._overrideAppearance.size ? this._overrideAppearance : undefined);
  }

  /** Get the IDs of current elements with the specified color/transparency override. */
  public getOverriddenElementsByKey(key: number): Id64Set | undefined {
    return (undefined !== this._overrideAppearance ? this._overrideAppearance.get(key) : undefined);
  }

  /** Clear never drawn elements.
   * @return false if nothing to clear.
   */
  public clearNeverDrawnElements(vp: Viewport): boolean {
    if (undefined === this.getNeverDrawnElements(vp))
      return false;
    vp.clearNeverDrawn();
    return true;
  }

  /** Clear always drawn elements.
   * @return false if nothing to clear.
   */
  public clearAlwaysDrawnElements(vp: Viewport): boolean {
    if (undefined === this.getAlwaysDrawnElements(vp))
      return false;
    vp.clearAlwaysDrawn();
    return true;
  }

  /** Clear hidden elements.
   * @return false if nothing to clear.
   */
  public clearHiddenElements(vp: Viewport): boolean {
    return this.clearNeverDrawnElements(vp);
  }

  /** Clear isolated elements.
   * @return false if nothing to clear.
   */
  public clearIsolatedElements(vp: Viewport): boolean {
    if (undefined === this.getIsolatedElements(vp))
      return false;
    if (this.clearEmphasizedIsolatedElements(vp, true))
      return true;
    return this.clearAlwaysDrawnElements(vp);
  }

  /** Clear emphasized elements.
   * @return false if nothing to clear.
   */
  public clearEmphasizedElements(vp: Viewport): boolean {
    if (undefined === this.getEmphasizedElements(vp))
      return false;

    if (this.clearEmphasizedIsolatedElements(vp, false))
      return true;

    if (!this.clearAlwaysDrawnElements(vp))
      return false;

    this._defaultAppearance = undefined;
    return true;
  }

  /** Clear emphasized isolated elements.
   * @return false if nothing to clear.
   */
  public clearEmphasizedIsolatedElements(vp: Viewport, setToAlwaysDrawn: boolean): boolean {
    const emphasizedIsolated = this.getEmphasizedIsolatedElements();
    this._emphasizeIsolated = undefined; // Always clear in case default appearance was unset...
    if (undefined === emphasizedIsolated)
      return false;

    if (setToAlwaysDrawn && this.setAlwaysDrawnElements(emphasizedIsolated, vp, false))
      return true;

    this._defaultAppearance = undefined;
    vp.setFeatureOverrideProviderChanged();
    return true;
  }

  /** Clear color/transparency overrides from elements. Removes all overrides when keyOrIds isn't supplied.
   * @param keyOrIds Specify a key value from [[EmphasizeElements.getOverriddenElements]] or [[EmphasizeElements.createOverrideKey]]
   * to remove a single color/transparency override for the corresponding elements or specify the IDs of elements to
   * remove any color/transparency override from.
   * @return false if nothing to clear.
   */
  public clearOverriddenElements(vp: Viewport, keyOrIds?: number | Id64Arg): boolean {
    if (undefined === this._overrideAppearance)
      return false;

    if (undefined !== keyOrIds) {
      if (typeof keyOrIds === "number") {
        if (!this._overrideAppearance.delete(keyOrIds))
          return false;
      } else {
        let changed = false;

        for (const [otherKey, otherIds] of this._overrideAppearance) {
          const oldSize = otherIds.size;
          for (const id of Id64.iterable(keyOrIds))
            otherIds.delete(id);

          if (oldSize !== otherIds.size)
            changed = true;

          if (0 === otherIds.size)
            this._overrideAppearance.delete(otherKey);
        }

        if (!changed)
          return false;
      }
    } else {
      this._overrideAppearance = undefined;
    }
    vp.setFeatureOverrideProviderChanged();
    return true;
  }

  /** @internal */
  protected updateIdSet(ids: Id64Arg, replace: boolean, existingIds?: Id64Set): Id64Set | undefined {
    const newIds = new Set<string>();
    for (const id of Id64.iterable(ids))
      newIds.add(id);

    if (0 === newIds.size)
      return undefined;

    const oldSize = (!replace && undefined !== existingIds ? existingIds.size : 0);
    if (0 !== oldSize && undefined !== existingIds)
      for (const id of existingIds)
        newIds.add(id);

    if (oldSize === newIds.size)
      return undefined;

    return newIds;
  }

  /** Set the element IDs to be never drawn.
   * @param ids The IDs of the elements to never draw.
   * @param vp The viewport.
   * @param replace true to replace currently hidden elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.neverDrawn]]
   * @internal
   */
  public setNeverDrawnElements(ids: Id64Arg, vp: Viewport, replace: boolean = true): boolean {
    const hiddenIds = this.updateIdSet(ids, replace, vp.neverDrawn);
    if (undefined === hiddenIds)
      return false;
    vp.setNeverDrawn(hiddenIds);
    return true;
  }

  /** Set the element IDs to be always drawn.
   * @param ids The IDs of the elements to always draw.
   * @param vp The viewport.
   * @param exclusive If true, *only* the specified elements will be drawn.
   * @param replace true to replace currently always drawn elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.isAlwaysDrawnExclusive]]
   * @internal
   */
  public setAlwaysDrawnElements(ids: Id64Arg, vp: Viewport, exclusive: boolean = true, replace: boolean = true): boolean {
    const visibleIds = this.updateIdSet(ids, replace, vp.alwaysDrawn);
    if (undefined === visibleIds)
      return false;
    vp.setAlwaysDrawn(visibleIds, exclusive);
    return true;
  }

  /** Set the element IDs to be never drawn.
   * @param ids The IDs of the elements to never draw.
   * @param vp The viewport.
   * @param replace true to replace currently hidden elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.neverDrawn]]
   */
  public hideElements(ids: Id64Arg, vp: Viewport, replace: boolean = false): boolean {
    return this.setNeverDrawnElements(ids, vp, replace);
  }

  /** Set the currently selected elements to be never drawn.
   * @param vp The viewport.
   * @param replace true to replace currently hidden elements (if any) or false to add to the existing set.
   * @param clearSelection true to clear current selection after setting appearance override, false to leave selected.
   * @return true if overrides were changed.
   * @see [[Viewport.neverDrawn]]
   */
  public hideSelectedElements(vp: Viewport, replace: boolean = false, clearSelection: boolean = true): boolean {
    const selection = vp.view.iModel.selectionSet;
    if (!selection.isActive || !this.hideElements(selection.elements, vp, replace))
      return false;
    if (clearSelection)
      selection.emptyAll();
    return true;
  }

  /** Set the element IDs to be always drawn exclusively.
   * @param ids The IDs of the elements to always draw.
   * @param vp The viewport.
   * @param replace true to replace currently isolated elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.isAlwaysDrawnExclusive]]
   */
  public isolateElements(ids: Id64Arg, vp: Viewport, replace: boolean = true): boolean {
    const wasEmphasized = (undefined !== this.getEmphasizedElements(vp));
    if (!this.setAlwaysDrawnElements(ids, vp, true, replace))
      return false;

    if (wasEmphasized)
      this._defaultAppearance = this._emphasizeIsolated = undefined; // Don't clear defaultAppearance unless it was established by emphasize...

    return true;
  }

  /** Set the currently selected elements to be always drawn exclusively.
   * @param vp The viewport.
   * @param replace true to replace currently isolated elements (if any) or false to add to the existing set.
   * @param clearSelection true to clear current selection after setting appearance override, false to leave selected.
   * @return true if overrides were changed.
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.isAlwaysDrawnExclusive]]
   */
  public isolateSelectedElements(vp: Viewport, replace: boolean = true, clearSelection: boolean = true): boolean {
    const selection = vp.view.iModel.selectionSet;
    if (!selection.isActive || !this.isolateElements(selection.elements, vp, replace))
      return false;
    if (clearSelection)
      selection.emptyAll();
    return true;
  }

  /** Set the element IDs to be always drawn normally with all other elements in the view overridden to draw using a default appearance..
   * @param ids The IDs of the elements to always draw.
   * @param vp The viewport.
   * @param defaultAppearance Optional default appearance, uses non-locatable transparent grey if not specified.
   * @param replace true to replace currently overridden elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.isAlwaysDrawnExclusive]]
   */
  public emphasizeElements(ids: Id64Arg, vp: Viewport, defaultAppearance?: FeatureAppearance, replace: boolean = true): boolean {
    if (undefined !== this.getIsolatedElements(vp)) {
      const emphasizeIds = this.updateIdSet(ids, replace, this._emphasizeIsolated);
      if (undefined === emphasizeIds)
        return false;

      this._emphasizeIsolated = emphasizeIds;
      vp.setFeatureOverrideProviderChanged();
    } else {
      if (!this.setAlwaysDrawnElements(ids, vp, false, replace))
        return false;

      this._emphasizeIsolated = undefined;
    }

    this._defaultAppearance = (undefined === defaultAppearance ? this.createDefaultAppearance() : defaultAppearance);
    return true;
  }

  /** Set the currently selected elements to be always drawn normally with all other elements in the view overridden to draw using a default appearance.
   * @param vp The viewport.
   * @param defaultAppearance Optional default appearance, uses transparent grey if not specified.
   * @param replace true to replace currently overridden elements (if any) or false to add to the existing set.
   * @param clearSelection true to clear current selection after setting appearance override, false to leave selected.
   * @return true if overrides were changed.
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.isAlwaysDrawnExclusive]]
   */
  public emphasizeSelectedElements(vp: Viewport, defaultAppearance?: FeatureAppearance, replace: boolean = true, clearSelection: boolean = true): boolean {
    const selection = vp.view.iModel.selectionSet;
    if (!selection.isActive || !this.emphasizeElements(selection.elements, vp, defaultAppearance, replace))
      return false;

    if (clearSelection)
      selection.emptyAll();

    return true;
  }

  /** Set the element IDs to display with a color/transparency override.
   * @param ids The IDs of the elements.
   * @param vp The viewport.
   * @param color ColorDef to specify override rgb and alpha.
   * @param override Whether to use color and alpha, only color, or only alpha from the supplied ColorDef.
   * @param replace true to replace currently overridden elements (if any) or false to add to the existing set.
   * @return true if overrides were changed.
   * @see [[Viewport.addFeatureOverrideProvider]]
   */
  public overrideElements(ids: Id64Arg, vp: Viewport, color: ColorDef, override: FeatureOverrideType = FeatureOverrideType.ColorOnly, replace: boolean = false): boolean {
    const ovrKey = this.createOverrideKey(color, override);
    if (undefined === ovrKey)
      return false;

    const overrideIds = new Set<string>();
    for (const id of Id64.iterable(ids))
      overrideIds.add(id);

    if (0 === overrideIds.size)
      return false;

    const existingIds = (!replace ? this.getOverriddenElementsByKey(ovrKey) : undefined);
    const oldSize = (undefined !== existingIds ? existingIds.size : 0);
    if (0 !== oldSize && undefined !== existingIds)
      for (const id of existingIds)
        overrideIds.add(id);

    if (oldSize === overrideIds.size)
      return false;

    if (undefined === this._overrideAppearance) {
      this._overrideAppearance = new Map<number, Id64Set>();
    } else {
      for (const [key, otherIds] of this._overrideAppearance) {
        if (key === ovrKey) // Make sure these ids are unique to this color/transparency key...
          continue;

        for (const id of Id64.iterable(ids))
          otherIds.delete(id);

        if (0 !== otherIds.size)
          continue;

        this._overrideAppearance.delete(key);
      }
    }

    this._overrideAppearance.set(ovrKey, overrideIds);
    vp.setFeatureOverrideProviderChanged();

    return true;
  }

  /** Set the currently selected elements to display with a color/transparency override.
   * @param vp The viewport.
   * @param color ColorDef to specify override rgb and alpha.
   * @param override Whether to use color and alpha, only color, or only alpha from the supplied ColorDef.
   * @param replace true to replace currently overridden elements (if any) or false to add to the existing set.
   * @param clearSelection true to clear current selection after setting appearance override, false to leave selected.
   * @return true if overrides were changed.
   * @see [[Viewport.addFeatureOverrideProvider]]
   */
  public overrideSelectedElements(vp: Viewport, color: ColorDef, override: FeatureOverrideType = FeatureOverrideType.ColorOnly, replace: boolean = false, clearSelection: boolean = true): boolean {
    const selection = vp.view.iModel.selectionSet;
    if (!selection.isActive || !this.overrideElements(selection.elements, vp, color, override, replace))
      return false;
    if (clearSelection)
      selection.emptyAll();
    return true;
  }

  /** @return true if provider is currently overriding the display of any elements. */
  public isActive(vp: Viewport): boolean { return (undefined !== this.getNeverDrawnElements(vp) || undefined !== this.getAlwaysDrawnElements(vp) || undefined !== this.getOverriddenElements()); }

  /** Serialize to JSON representation.
   * @see [[EmphasizeElements.fromJSON]]
   */
  public toJSON(vp: Viewport): EmphasizeElementsProps {
    const props: EmphasizeElementsProps = {};
    const neverDrawn = this.getNeverDrawnElements(vp);
    if (undefined !== neverDrawn)
      props.neverDrawn = [...neverDrawn];

    const alwaysDrawn = this.getAlwaysDrawnElements(vp);
    if (undefined !== alwaysDrawn)
      props.alwaysDrawn = [...alwaysDrawn];

    if (vp.isAlwaysDrawnExclusive)
      props.isAlwaysDrawnExclusive = true; // isolate

    const alwaysDrawnExclusiveEmphasized = this.getEmphasizedIsolatedElements();
    if (undefined !== alwaysDrawnExclusiveEmphasized)
      props.alwaysDrawnExclusiveEmphasized = [...alwaysDrawnExclusiveEmphasized];

    if (undefined !== this.defaultAppearance)
      props.defaultAppearance = this.defaultAppearance; // emphasize (or specifically set for override)

    if (this.unanimatedAppearance)
      props.unanimatedAppearance = this.unanimatedAppearance;

    const overriddenElements = this.getOverriddenElements();
    if (undefined !== overriddenElements) {
      const appearanceOverride: AppearanceOverrideProps[] = [];
      for (const [key, ovrIds] of overriddenElements) {
        const { color, overrideType } = { ...this.getOverrideFromKey(key) };
        const ids = [...ovrIds];
        appearanceOverride.push({ overrideType, color: color.toJSON(), ids });
      }

      props.appearanceOverride = appearanceOverride;
    }

    if (this.wantEmphasis)
      props.wantEmphasis = true;

    return props;
  }

  /** Initialize from JSON representation.
   * @see [[EmphasizeElements.toJSON]]
   */
  public fromJSON(props: EmphasizeElementsProps, vp: Viewport): boolean {
    let changed = false;
    if (undefined !== props.neverDrawn && this.setNeverDrawnElements(new Set<string>(props.neverDrawn), vp, true))
      changed = true;

    if (undefined !== props.alwaysDrawn && this.setAlwaysDrawnElements(new Set<string>(props.alwaysDrawn), vp, undefined !== props.isAlwaysDrawnExclusive && props.isAlwaysDrawnExclusive))
      changed = true;

    if (undefined !== props.alwaysDrawnExclusiveEmphasized)
      this._emphasizeIsolated = new Set<string>(props.alwaysDrawnExclusiveEmphasized); // changed status determined by setAlwaysDrawnElements...

    if (undefined !== props.defaultAppearance)
      this.defaultAppearance = FeatureAppearance.fromJSON(props.defaultAppearance); // changed status determined by setAlwaysDrawnElements or overrideElements...

    if (props.unanimatedAppearance)
      this.unanimatedAppearance = FeatureAppearance.fromJSON(props.unanimatedAppearance);

    if (undefined !== props.appearanceOverride) {
      for (const ovrApp of props.appearanceOverride) {
        if (undefined === ovrApp.ids)
          continue;

        if (this.overrideElements(new Set<string>(ovrApp.ids), vp, ColorDef.fromJSON(ovrApp.color), ovrApp.overrideType, true))
          changed = true;
      }
    }

    const wantEmphasis = true === props.wantEmphasis;
    if (wantEmphasis !== this.wantEmphasis) {
      this.wantEmphasis = wantEmphasis;
      changed = true;
    }

    return changed;
  }

  /** Return the EmphasizeElements provider currently registered with the specified Viewport, if one is already registered. */
  public static get(vp: Viewport): EmphasizeElements | undefined {
    return vp.findFeatureOverrideProviderOfType<EmphasizeElements>(EmphasizeElements);
  }

  /** Return the EmphasizeElements provider currently registered with the specified Viewport, or register a new one and return it. */
  public static getOrCreate(vp: Viewport): EmphasizeElements {
    let provider = this.get(vp);
    if (!provider) {
      provider = new EmphasizeElements();
      vp.addFeatureOverrideProvider(provider);
    }

    return provider;
  }

  /** Drop the EmphasizeElements provider currently registered with the specified Viewport, if any is registered. */
  public static clear(vp: Viewport, inactiveOnly: boolean = false) {
    const provider = this.get(vp);

    if (undefined === provider || (inactiveOnly && provider.isActive))
      return;

    vp.clearNeverDrawn();
    vp.clearAlwaysDrawn();
    vp.dropFeatureOverrideProvider(provider);
  }
}
