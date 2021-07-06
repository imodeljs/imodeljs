/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";

// Hook that creates create an interval and clear it when unloaded
// Reference: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export function useInterval(callback: (...args: any[]) => void, delay: number|undefined) {
  const savedCallback = React.useRef<(...args: any[]) => void>(callback);

  // Remember the latest function.
  React.useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  React.useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== undefined) {
      const id = setInterval(tick, delay);
      return (() => {clearInterval(id);});
    } else {
      return undefined;
    }
  }, [delay]);
}

export default useInterval;
