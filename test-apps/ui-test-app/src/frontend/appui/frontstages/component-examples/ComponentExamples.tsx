/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ComponentExamples.scss";
import * as React from "react";
import { CommonProps, VerticalTabs } from "@bentley/ui-core";
import { ColorTheme, MessageManager, ModalFrontstageInfo, StatusMessageRenderer, UiFramework } from "@bentley/ui-framework";
import { ToggleSwitch } from "@itwin/itwinui-react";
import { ComponentExamplesProvider } from "./ComponentExamplesProvider";
import { ITwinUIExamplesProvider } from "./ITwinUIExamplesProvider";

export interface ComponentExampleCategory {
  title: string;
  examples: ComponentExampleProps[];
}

/** Modal frontstage displaying component examples.
 */
export class ComponentExamplesModalFrontstage implements ModalFrontstageInfo {
  public title: string = UiFramework.i18n.translate("SampleApp:componentExamplesStage.examples");
  public categories: ComponentExampleCategory[] = [...ComponentExamplesProvider.categories, ...ITwinUIExamplesProvider.categories];
  public get content(): React.ReactNode {
    MessageManager.maxDisplayedStickyMessages = 6;
    return (<ComponentExamplesPage categories={this.categories} />);
  }
}

interface ComponentExamplesPageProps {
  categories: ComponentExampleCategory[];
  hideThemeOption?: boolean;
}

/** ComponentExamplesPage displaying the component examples.
 */
export const ComponentExamplesPage: React.FC<ComponentExamplesPageProps> = (props: ComponentExamplesPageProps) => {
  const themeTitle: string = UiFramework.i18n.translate("SampleApp:componentExamplesStage.themeTitle");
  const themeDescription: string = UiFramework.i18n.translate("SampleApp:componentExamplesStage.themeDescription");
  const showThemeOption = !(!!props.hideThemeOption);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [colorTheme, setColorTheme] = React.useState(() => UiFramework.getColorTheme());

  const onThemeChange = () => {
    const theme = isLightTheme() ? ColorTheme.Dark : ColorTheme.Light;
    UiFramework.setColorTheme(theme);
    setColorTheme(theme);
  };

  const isLightTheme = (): boolean => {
    return (colorTheme === ColorTheme.Light);
  };

  const isChecked = isLightTheme();
  const darkLabel = UiFramework.i18n.translate("SampleApp:settingsStage.dark");
  const lightLabel = UiFramework.i18n.translate("SampleApp:settingsStage.light");

  const handleActivateTab = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="component-examples">
      <div className="component-examples-categories">
        <VerticalTabs
          labels={props.categories.map((category: ComponentExampleCategory) => category.title)}
          activeIndex={activeIndex} onActivateTab={handleActivateTab} />
      </div>
      <div className="component-examples-items">
        {showThemeOption && <>
          <ComponentExample title={themeTitle} description={themeDescription}
            content={
              <>
                {darkLabel}
                &nbsp;
                <ToggleSwitch checked={isChecked} onChange={onThemeChange} />
                &nbsp;
                {lightLabel}
              </>
            }
          />
          <hr className="component-examples-items-separator" />
        </>
        }
        {props.categories[activeIndex].examples.map((exampleProps: ComponentExampleProps, index: number) => {
          const { title, description, content, ...otherProps } = exampleProps;
          return (
            <ComponentExample key={index.toString()} title={title} description={description} content={content} {...otherProps} />
          );
        })}
      </div>
      <StatusMessageRenderer />
    </div>
  );
};

/** Properties for the Component Example component */
export interface ComponentExampleProps extends CommonProps {
  title: string;
  description?: string;
  content: React.ReactNode;
}

/** Component Example component */
export const ComponentExample: React.FC<ComponentExampleProps> = (props: ComponentExampleProps) => {
  const { title, description, content } = props;
  return (
    <div className="component-examples-item">
      <div className="panel left-panel">
        <span className="title">{title}</span>
        {description && <span className="description">{description}</span>}
      </div>
      <div className="panel right-panel">
        {content}
      </div>
    </div>
  );
};
