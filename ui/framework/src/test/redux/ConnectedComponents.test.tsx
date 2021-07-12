/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as React from "react";
import { Provider } from "react-redux";
import { fireEvent, render } from "@testing-library/react";
import { connectIModelConnection } from "../../ui-framework/redux/connectIModel";
import { SessionStateActionsProps, sessionStateMapDispatchToProps } from "../../ui-framework/redux/SessionState";
import { UiFramework } from "../../ui-framework/UiFramework";
import TestUtils from "../TestUtils";

describe("ConnectedContent", () => {
  before(async () => {
    await TestUtils.initializeUiFramework(true);
  });

  it("TestComponent connected should render", () => {
    const numSelected = 10;
    const defaultViewId = "DefaultViewId";
    const viewportControlId = "ViewportControlId";
    let numClicks = 0;

    interface Props extends SessionStateActionsProps {
      numItemsSelected: number;
      defaultViewId: string | undefined;
      defaultIModelViewportControlId: string;
    }

    class TestComponent extends React.Component<Props> {
      private _clickCount = 0;

      private _onClick = () => {
        const clickCount = this._clickCount % 3;
        this._clickCount++;
        numClicks = this._clickCount;

        if (0 === clickCount) {
          this.props.setNumItemsSelected(numSelected);
        }

        if (1 === clickCount) {
          this.props.setDefaultViewId(defaultViewId);
        }

        if (2 === clickCount) {
          this.props.setDefaultIModelViewportControlId(viewportControlId);
        }
      };

      public override render() {
        return <div>
          <button data-testid="testButton" title="test" onClick={this._onClick} />
          <span data-testid="numItemsSelected">{this.props.numItemsSelected}</span>
          <br />
          <span data-testid="defaultViewId">{this.props.defaultViewId}</span>
          <br />
          <span data-testid="defaultIModelViewportControlId">{this.props.defaultIModelViewportControlId}</span>
        </div>;
      }
    }

    function localMapStateToProps(state: any) {
      const frameworkState = state[UiFramework.frameworkStateKey];  // since app sets up key, don't hard-code name

      /* istanbul ignore next */
      if (!frameworkState)
        return {};

      return {
        numItemsSelected: frameworkState.sessionState.numItemsSelected,
        defaultViewId: frameworkState.sessionState.defaultViewId,
        defaultIModelViewportControlId: frameworkState.sessionState.defaultIModelViewportControlId,
      };
    }

    const ConnectControl = connectIModelConnection(localMapStateToProps, sessionStateMapDispatchToProps)(TestComponent); // eslint-disable-line @typescript-eslint/naming-convention
    const renderedComponent = render(<Provider store={TestUtils.store} ><ConnectControl /></Provider>);

    expect(renderedComponent).not.to.be.undefined;

    // simulate selecting toolId
    const buttonElement = renderedComponent.getByTestId("testButton") as HTMLButtonElement;
    fireEvent.click(buttonElement);
    expect(numClicks).to.be.eq(1);
    fireEvent.click(buttonElement);
    expect(numClicks).to.be.eq(2);
    fireEvent.click(buttonElement);
    expect(numClicks).to.be.eq(3);

    const span1 = renderedComponent.getByTestId("numItemsSelected") as HTMLSpanElement;
    const span2 = renderedComponent.getByTestId("defaultViewId") as HTMLSpanElement;
    const span3 = renderedComponent.getByTestId("defaultIModelViewportControlId") as HTMLSpanElement;
    expect(span1.innerHTML).to.be.eq(numSelected.toString());
    expect(span2.innerHTML).to.be.eq(defaultViewId);
    expect(span3.innerHTML).to.be.eq(viewportControlId);
  });

  after(() => {
    // clear out the framework key
    TestUtils.terminateUiFramework();
  });
});
