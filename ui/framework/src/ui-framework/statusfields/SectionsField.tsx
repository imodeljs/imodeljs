/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import "./SectionsField.scss";
import classnames from "classnames";
import * as React from "react";
import { ClipEventType, IModelApp, ViewClipClearTool, ViewClipDecoration, ViewClipDecorationProvider, Viewport } from "@bentley/imodeljs-frontend";
import { Dialog, FooterPopup, TitleBar } from "@bentley/ui-ninezone";
import { Button, ToggleSwitch } from "@itwin/itwinui-react";
import { useActiveViewport } from "../hooks/useActiveViewport";
import { UiFramework } from "../UiFramework";
import { Indicator } from "./Indicator";
import { StatusFieldProps } from "./StatusFieldProps";

/** Sections Status Field Props
 * @beta
 */
export interface SectionsStatusFieldProps extends StatusFieldProps {
  hideWhenUnused?: boolean;
}

/** Status Field for showing section extra tools for clearing and showing manipulators
 * @beta
 */
export function SectionsStatusField(props: SectionsStatusFieldProps) {
  const [toolTip] = React.useState(UiFramework.translate("tools.sectionTools"));
  const [clearLabel] = React.useState(UiFramework.translate("tools.sectionClear"));
  const [showHandlesLabel] = React.useState(UiFramework.translate("tools.sectionShowHandles"));
  const activeViewport = useActiveViewport();
  const [showIndicator, setShowIndicator] = React.useState(false);
  const [isPopupOpen, setPopupOpen] = React.useState(false);
  const targetDiv = React.useRef<HTMLDivElement>(null);
  const classes = (showIndicator) ? "uifw-indicator-fade-in" : "uifw-indicator-fade-out";
  const [hasManipulatorsShown, setHasManipulatorsShown] = React.useState(false);

  React.useEffect(() => {
    // istanbul ignore next
    const onClipChanged = (viewport: Viewport, _eventType: ClipEventType, _provider: ViewClipDecorationProvider) => {
      if (viewport !== activeViewport)
        return;

      setHasManipulatorsShown(!!ViewClipDecoration.get(activeViewport));
      const isClipActive = !!activeViewport.view.getViewClip();
      setShowIndicator(isClipActive || !props.hideWhenUnused);
    };

    const clipActive = !!activeViewport && /* istanbul ignore next */ !!activeViewport.view.getViewClip();
    setShowIndicator(clipActive || !props.hideWhenUnused);
    setHasManipulatorsShown(clipActive && /* istanbul ignore next */ !!activeViewport && /* istanbul ignore next */ !!ViewClipDecoration.get(activeViewport));

    ViewClipDecorationProvider.create().onActiveClipChanged.addListener(onClipChanged);
    return () => {
      // Get or create static ViewClipDecorationProvider
      ViewClipDecorationProvider.create().onActiveClipChanged.removeListener(onClipChanged);
    };
  }, [activeViewport, props.hideWhenUnused, isPopupOpen]);

  // istanbul ignore next
  const toggleManipulators = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeViewport) {
      setHasManipulatorsShown(e.target.checked);
      ViewClipDecorationProvider.create().toggleDecoration(activeViewport);
    }
  };

  // istanbul ignore next
  const handleClear = () => {
    IModelApp.tools.run(ViewClipClearTool.toolId, ViewClipDecorationProvider.create());
    setPopupOpen(false);
  };

  return (
    <>
      <div ref={targetDiv} title={toolTip}>
        <Indicator className={classes}
          iconName="icon-section-tool"
          onClick={() => setPopupOpen(!isPopupOpen)}
          opened={isPopupOpen}
          isInFooterMode={props.isInFooterMode}
        />
      </div>
      <FooterPopup
        target={targetDiv.current}
        onClose={() => setPopupOpen(false)}
        isOpen={isPopupOpen}>
        <Dialog
          titleBar={
            <TitleBar title={toolTip} />
          }>
          <div className="uifw-sections-footer-contents">
            <Button onClick={handleClear}>{clearLabel}</Button>
            <div className="uifw-uifw-sections-toggle-container">
              <div className={classnames("uifw-sections-label")}>{showHandlesLabel}</div>
              <ToggleSwitch className="uifw-sections-toggle" onChange={toggleManipulators} checked={hasManipulatorsShown} />
            </div>
          </div>
        </Dialog>
      </FooterPopup>
    </>
  );
}
