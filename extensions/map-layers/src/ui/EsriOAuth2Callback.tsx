/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "@bentley/bentleyjs-core";
import { Spinner, SpinnerSize } from "@bentley/ui-core";
import * as React from "react";

// eslint-disable-next-line @typescript-eslint/naming-convention
export function EsriOAuth2Callback() {

  const startLogin = () => {
    let success = false;
    if (window.opener !== undefined) {
      const opener = (window.opener );
      assert(opener?.esriOAuth2Callback);
      if (opener?.esriOAuth2Callback) {
        const hashMatch = window.location.hash.match(new RegExp(/#access_token=([^&]+)&expires_in=([^&]+)&username=([^&]+)&ssl=([^&]+)&state=([^&]+)/, "i"));
        if (hashMatch !== null &&  hashMatch.length === 6 )
          opener.esriOAuth2Callback(true, hashMatch[1], hashMatch[2], hashMatch[3], hashMatch[4], hashMatch[5]);
        success = true;
      }
    }

    if (success === false) {
      opener.esriOAuth2Callback(false);
    }
  };

  React.useEffect(() => {
    startLogin();
  }, []);

  return (
    <Spinner size={SpinnerSize.Medium }/>
  );
}
