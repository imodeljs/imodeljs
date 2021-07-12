/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { Button, Checkbox, Input, ProgressLinear, ProgressRadial, Radio, Select, ToggleSwitch } from "@itwin/itwinui-react";
import { ComponentExampleCategory } from "./ComponentExamples";
import { createComponentExample } from "./ComponentExamplesProvider";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";

export class ITwinUIExamplesProvider {

  private static get iTwinUIComponentSamples(): ComponentExampleCategory {
    return {
      title: "iTwinUI-react",
      examples: [
        createComponentExample("Input", "iTwinUI Input component", <Input placeholder="Type..." className="uicore-full-width" />),
        createComponentExample("Check Box", undefined, <Checkbox label="Basic Check Box" />),
        createComponentExample("Radio Button", "Basic Radio Buttons",
          <div>
            <Radio label="Radio Button 1" name="demo1" value="option-1" />
            <Radio label="Radio Button 2" name="demo1" value="option-2" />
            <Radio label="Radio Button 3" name="demo1" value="option-3" />
          </div>),

        createComponentExample("Basic ToggleSwitch", undefined, <ToggleSwitch defaultChecked />),
        createComponentExample("Labeled ToggleSwitch", "Label Right", <ToggleSwitch defaultChecked label="This is a right label" labelPosition="right" />),
        createComponentExample("Labeled ToggleSwitch", "Label Left", <ToggleSwitch defaultChecked label="This is a left label" labelPosition="left" />),

        createComponentExample("Basic Button", "Button with cta", <Button styleType="cta">Primary Button</Button>),
        createComponentExample("Blue Button", "Button with high-visibility", <Button styleType="high-visibility">Blue Button</Button>),
        createComponentExample("Hollow Button", "Button with default", <Button styleType="default">Hollow Button</Button>),

        createComponentExample("Select with values", "Select with values in array",
          <Select value="option2"
            onChange={(newValue: string) => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, newValue))}
            options={[
              { label: "Option 1", value: "option1" },
              { label: "Option 2", value: "option2" },
              { label: "Option 3", value: "option3" },
              { label: "Option 4", value: "option4" },
            ]} />),

        createComponentExample("ProgressRadial", "at 50%", <ProgressRadial value={50} />),
        createComponentExample("Indeterminate ProgressRadial", "indeterminate prop", <ProgressRadial indeterminate />),
        createComponentExample("ProgressRadial with value", "display value of 63", <ProgressRadial size="large" value={63}>63</ProgressRadial>),
        createComponentExample("ProgressLinear", "at 50%", <ProgressLinear value={50} className="uicore-full-width" />),
        createComponentExample("Indeterminate ProgressLinear", "indeterminate prop", <ProgressLinear indeterminate className="uicore-full-width" />),
      ],
    };
  }

  public static get categories(): ComponentExampleCategory[] {
    return [
      ITwinUIExamplesProvider.iTwinUIComponentSamples,
    ];
  }

}
