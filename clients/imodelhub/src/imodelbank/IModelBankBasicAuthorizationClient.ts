/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AuthStatus, BeEvent, BentleyError, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { FrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { AccessToken, IncludePrefix, ITwinClientLoggerCategory, TokenPrefix, UserInfo } from "@bentley/itwin-client";
const loggerCategory = ITwinClientLoggerCategory.Authorization;

/**
 * Implements AccessToken that uses Basic access authentication
 * @internal
 */
@TokenPrefix("Basic")
export class BasicAccessToken extends AccessToken {

  constructor(tokenStr?: string) {
    super(tokenStr, undefined, undefined, undefined);
    this.setPrefix("Basic");
  }
  /**
   * Create a BasicAccessToken from user credentials
   * @param userCredentials User credentials containing email and password of the user.
   */
  public static fromCredentials(userCredentials: any): AccessToken {
    const basicToken = new BasicAccessToken("");
    basicToken._tokenString = Buffer.from(`${userCredentials.email}:${userCredentials.password}`).toString("base64");
    return basicToken;
  }
  /**
   * Creates a token to be used in Authorization header.
   * @param includePrefix Set to Yes if prefix (Basic) should be included before the token.
   */
  public override toTokenString(includePrefix: IncludePrefix = IncludePrefix.Yes): string {
    let token: string = "";
    if (includePrefix === IncludePrefix.Yes)
      token += `${this._prefix} `;

    token += this._tokenString;
    return token;
  }
  /**
   * initialize the tokenString field of the current instance of BasicAccessToken
   * @param tokenStr String representation of the token
   */
  public override initFromTokenString(tokenStr: string): void {
    if (!tokenStr.startsWith(this._prefix)) {
      throw new BentleyError(AuthStatus.Error, "Invalid access token", Logger.logError, loggerCategory, () => ({ tokenStr }));
    }
    const userPass = tokenStr.substr(this._prefix.length + 1);
    this._tokenString = userPass;
  }
}

/** Implements the user permission abstraction by creating a BasicAccessToken. Note that the corresponding IModelBank server must
 * be able to tolerate this BasicAccessToken.
 * @internal
 */
export class IModelBankBasicAuthorizationClient implements FrontendAuthorizationClient {
  private _token?: AccessToken;

  public constructor(_userInfo: UserInfo | undefined, private _userCredentials: any) {
  }

  public async signIn(_requestContext?: ClientRequestContext): Promise<void> {
    _requestContext?.enter();
    this._token = BasicAccessToken.fromCredentials(this._userCredentials);
    this.onUserStateChanged.raiseEvent(this._token);
  }

  public async signOut(_requestContext?: ClientRequestContext): Promise<void> {
    _requestContext?.enter();
    this._token = undefined;
    this.onUserStateChanged.raiseEvent(this._token);
  }

  public readonly onUserStateChanged = new BeEvent<(token: AccessToken | undefined) => void>();
  public get isAuthorized(): boolean {
    return !!this._token;
  }
  public get hasExpired(): boolean {
    return !this._token;
  }
  public get hasSignedIn(): boolean {
    return !!this._token;
  }

  public async getAccessToken(_requestContext?: ClientRequestContext): Promise<AccessToken> {
    if (!this._token) {
      throw new Error("User is not signed in.");
    }
    return this._token;
  }
}
