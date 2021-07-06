/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import useInterval from "./useInterval";
import {EsriOAuth2} from "@bentley/imodeljs-frontend";

// Hook that will show a popup window and trigger the ESRI OAuth2 process.
// Note: An interval is used to check get closed by user: because we access
// a cross domain resource inside the popup, we don't have access to popup window events.
// Reference: https://stackoverflow.com/questions/9388380/capture-the-close-event-of-popup-window-in-javascript/48240128#48240128
export function useEsriOAuth2Popup(visible: boolean, contextUrl: string, onClose: () => void) {

  const savedContextUrl = React.useRef(contextUrl);   // We we want to trigger a re-render when the context urlChange
  const [checkPopupAliveDelay, setCheckPopupAliveDelay] = React.useState<number|undefined>();
  const popupWindow = React.useRef<Window>();

  const checkPopupOpen = () => {
    console.log("checkPopupOpen called");
    if (popupWindow.current?.closed ) {
      onClose();
      setCheckPopupAliveDelay(undefined);
      popupWindow.current = undefined;
    }
  };

  useInterval(checkPopupOpen, checkPopupAliveDelay);

  React.useEffect(() => {
    savedContextUrl.current = contextUrl;
  }, [contextUrl]);

  React.useEffect(() => {

    // If visible and a popup window is not already open, open a new popup window
    if (visible && popupWindow.current === undefined) {
      console.log("opening popup");
      const oauthState = encodeURIComponent(savedContextUrl.current);
      const arcgisUrl = `https://www.arcgis.com/sharing/rest/oauth2/authorize?client_id=${EsriOAuth2.arcGisOnlineClientId}&response_type=token&expiration=${EsriOAuth2.expiration}&redirect_uri=${EsriOAuth2.redirectUri}&state=${oauthState}`;
      const popup = window.open(arcgisUrl, "ArcGIS login", "directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=no,width=450,height=450");
      if (popup !== null) {
        popup.focus();
        popupWindow.current = popup;

        // Start and interval that will check if popup got closed by user
        setCheckPopupAliveDelay(1000);
      }
    }

    // If not visible but a previous popup window is still open, close it.
    if (!visible && popupWindow.current !== undefined ) {
      console.log("Closing popup");
      popupWindow.current.close();
      popupWindow.current = undefined;
      setCheckPopupAliveDelay(undefined);
      onClose();
    }

  }, [checkPopupAliveDelay, onClose, visible]);
}

export default useEsriOAuth2Popup;
