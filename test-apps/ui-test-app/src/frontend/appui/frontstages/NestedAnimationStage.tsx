/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import {
  ContentGroup, CoreTools, Frontstage, FrontstageProps, FrontstageProvider, NestedFrontstage, ToolWidget, Widget, Zone,
} from "@bentley/ui-framework";

export class NestedAnimationStage extends FrontstageProvider {

  public get frontstage(): React.ReactElement<FrontstageProps> {
    const myContentGroup: ContentGroup = new ContentGroup(
      {
        contents: [
          {
            classId: "ScheduleAnimationControl",
          },
        ],
      },
    );

    return (
      <Frontstage id="NestedAnimationStage"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout="SingleContent"
        contentGroup={myContentGroup}
        isInFooterMode={false}
        applicationData={{ key: "value" }}
        contentManipulationTools={
          <Zone
            widgets={[
              <Widget isFreeform={true} element={<FrontstageToolWidget />} />, // eslint-disable-line react/jsx-key
            ]}
          />
        }
      />
    );
  }
}

/** Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class FrontstageToolWidget extends React.Component {
  public override render() {
    return (
      // eslint-disable-next-line deprecation/deprecation
      <ToolWidget
        appButton={NestedFrontstage.backToPreviousFrontstageCommand}
      />
    );
  }
}
