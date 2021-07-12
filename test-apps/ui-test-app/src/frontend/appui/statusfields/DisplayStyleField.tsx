/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import "./DisplayStyleField.scss";
import classnames from "classnames";
import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { DisplayStyle2dState, DisplayStyle3dState, DisplayStyleState, IModelApp, ScreenViewport } from "@bentley/imodeljs-frontend";
import { ContentControl, ContentControlActivatedEventArgs, ContentViewManager, FrontstageManager, StatusFieldProps } from "@bentley/ui-framework";
import { FooterIndicator } from "@bentley/ui-ninezone";
import { Select, SelectOption } from "@itwin/itwinui-react";

interface DisplayStyleFieldState {
  viewport?: ScreenViewport;
  displayStyles: Map<Id64String, DisplayStyleState>;
  styleEntries: SelectOption<string>[];
}

/**
 * Shadow Field React component. This component is designed to be specified in a status bar definition.
 * It is used to enable/disable display of shadows.
 */
export class DisplayStyleField extends React.Component<StatusFieldProps, DisplayStyleFieldState> {
  private _label = IModelApp.i18n.translate("SampleApp:statusFields.displayStyle.label");
  private _tooltip = IModelApp.i18n.translate("SampleApp:statusFields.displayStyle.tooltip");

  constructor(props: StatusFieldProps) {
    super(props);

    this.state = { viewport: undefined, displayStyles: new Map<Id64String, DisplayStyleState>(), styleEntries: [] };
  }

  private async setStateFromActiveContent(contentControl?: ContentControl): Promise<void> {
    if (contentControl && contentControl.viewport) {
      const unnamedPrefix = IModelApp.i18n.translate("SampleApp:statusFields.unnamedDisplayStyle");
      const displayStyles = new Map<Id64String, DisplayStyleState>();
      const view = contentControl.viewport.view;
      const is3d = view.is3d();
      const sqlName: string = is3d ? DisplayStyle3dState.classFullName : DisplayStyle2dState.classFullName;
      const displayStyleProps = await view.iModel.elements.queryProps({ from: sqlName, where: "IsPrivate=FALSE" });
      const styleEntries: SelectOption<string>[] = [];
      let emptyNameSuffix = 0;
      for (const displayStyleProp of displayStyleProps) {
        let name = displayStyleProp.code.value!;
        if (0 === name.length) {
          emptyNameSuffix++;
          name = `${unnamedPrefix}-${emptyNameSuffix}`;
        }
        styleEntries.push({ value: displayStyleProp.id!, label: name });

        let displayStyle: DisplayStyleState;
        if (is3d)
          displayStyle = new DisplayStyle3dState(displayStyleProp, view.iModel);
        else
          displayStyle = new DisplayStyle2dState(displayStyleProp, view.iModel);

        displayStyles.set(displayStyleProp.id!, displayStyle);
      }

      this.setState((_prevState) => (
        {
          viewport: contentControl.viewport,
          displayStyles,
          styleEntries,
        }));
    }
  }

  private _handleContentControlActivatedEvent = (args: ContentControlActivatedEventArgs) => {
    setImmediate(async () => this.setStateFromActiveContent(args.activeContentControl));
  };

  public override componentDidMount() {
    FrontstageManager.onContentControlActivatedEvent.addListener(this._handleContentControlActivatedEvent);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.setStateFromActiveContent(ContentViewManager.getActiveContentControl());
  }

  public override componentWillUnmount() {
    FrontstageManager.onContentControlActivatedEvent.removeListener(this._handleContentControlActivatedEvent);
  }

  private _handleDisplayStyleSelected = async (newValue: string) => {
    if (!this.state.viewport)
      return;

    const viewport = this.state.viewport;
    const style = this.state.displayStyles.get(newValue)!.clone();
    if (style) {
      await style.load();

      viewport.displayStyle = style;
      viewport.invalidateScene();
      viewport.synchWithView();
      this.setState({ viewport });
    }
  };

  public override render(): React.ReactNode {
    if (!this.state.viewport)
      return null;

    const displayStyleId = this.state.viewport.view.displayStyle.id;

    return (
      <FooterIndicator
        className={classnames("uifw-statusFields-displayStyle", this.props.className)}
        style={this.props.style}
        isInFooterMode={this.props.isInFooterMode}
      >
        <Select options={this.state.styleEntries} value={displayStyleId} onChange={this._handleDisplayStyleSelected}
          title={this._tooltip} aria-label={this._label}
          className="uifw-statusFields-displayStyle-selector" />
      </FooterIndicator >
    );
  }
}
