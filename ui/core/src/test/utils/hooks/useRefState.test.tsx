/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { render } from "@testing-library/react";
import { useRefState } from "../../../ui-core/utils/hooks/useRefState";

describe("useRefState", () => {
  // NEEDSWORK - use renderHook to test
  it("should use ref state", () => {

    function TestComponent() {
      const [testRef] = useRefState<HTMLDivElement>();
      return (
        <div ref={testRef} />
      );
    }

    render(<TestComponent />);
    // expect NEEDSWORK
  });
});
