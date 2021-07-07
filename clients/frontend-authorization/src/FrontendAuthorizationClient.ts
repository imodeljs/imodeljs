/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authorization
 */
import { BeEvent, ClientRequestContext } from "@bentley/bentleyjs-core";
import { AccessToken, AuthorizationClient } from "@bentley/itwin-client";

/** Interface to provide means of client signin/signout
 * @public
 */
export interface FrontendAuthorizationClient extends AuthorizationClient {
  /** Called to start the sign-in process. Subscribe to onUserStateChanged to be notified when sign-in completes */
  signIn(requestContext?: ClientRequestContext): Promise<void>;

  /** Called to start the sign-out process. Subscribe to onUserStateChanged to be notified when sign-out completes */
  signOut(requestContext?: ClientRequestContext): Promise<void>;

  /** Event called when the user's sign-in state changes - this may be due to calls to signIn(), signOut() or simply because the token expired */
  readonly onUserStateChanged: BeEvent<(token: AccessToken | undefined) => void>;

  /** Set to true if signed in - the accessToken may be active or may have expired and require a refresh */
  readonly hasSignedIn: boolean;
}
