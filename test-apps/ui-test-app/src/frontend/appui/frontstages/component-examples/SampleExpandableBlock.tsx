/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { ExpandableBlock, ExpandableBlockProps } from "@bentley/ui-core";

/** Sample component using ExpandableBlock with an expanded state  */
// eslint-disable-next-line @typescript-eslint/naming-convention
// eslint-disable-next-line deprecation/deprecation
export const SampleExpandableBlock: React.FC<ExpandableBlockProps> = (props: ExpandableBlockProps) => {
  const [expanded, setExpanded] = React.useState(props.isExpanded);

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
    setExpanded(!expanded);

    props.onClick && props.onClick(event);
  }, [expanded, props]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent): void => {
    if (event.key === SpecialKey.Enter || event.key === SpecialKey.Space) {
      setExpanded(!expanded);
    } else if (event.key === SpecialKey.ArrowDown && !expanded) {
      setExpanded(true);
    } else if (event.key === SpecialKey.ArrowUp && expanded) {
      setExpanded(false);
    }
  }, [expanded]);

  return (
    // eslint-disable-next-line deprecation/deprecation
    <ExpandableBlock {...props} isExpanded={expanded} onClick={handleClick} onKeyDown={handleKeyDown} />
  );
};
