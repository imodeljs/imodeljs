/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { AuthStatus, BentleyError, Logger } from "@bentley/bentleyjs-core";
import { ITwinClientLoggerCategory } from "../ITwinClientLoggerCategory";
import { AccessToken, IncludePrefix, TokenPrefix } from "../Token";

const loggerCategory = ITwinClientLoggerCategory.Authorization;
@TokenPrefix("Basic")
class BasicAccessToken extends AccessToken {

  constructor(tokenStr: string) {
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
describe("AccessToken", async () => {

  it("should retrieve a Basic Access Token from token string", () => {
    const token = new BasicAccessToken("user:password");
    const tokenString = token.toTokenString(); // will have "Basic" as prefix
    const newToken = AccessToken.fromTokenString(tokenString);
    assert(newToken instanceof BasicAccessToken);
    assert(newToken.toTokenString() === "Basic user:password");
  });
  it("should retrieve an AccessToken from token string", () => {
    // create a token that expires 60 minutes from now
    const token = new AccessToken("98187ejlaskjd", undefined, new Date(Date.now() + 60 * 60 * 1000));
    const tokenString = token.toTokenString();
    const newToken = AccessToken.fromTokenString(tokenString);
    assert((newToken instanceof AccessToken));
    assert(newToken.toTokenString() === "Bearer 98187ejlaskjd");
    assert.isFalse(token.isExpired(0), "should not be expired");
    assert.isFalse(token.isExpired(30 * 60), "should not expire in 30 minutes");
    assert.isTrue(token.isExpired((60 * 60) + 1), "should expire within 60 minutes");
    assert.isFalse(newToken.isExpired(61 * 60), "token with no expiry should not expire");
  });
  it("should properly create an AccessToken from a json object", () => {
    const jsonObject = {
      tokenString: "abc123",
      userInfo: { id: "blah" },
    };
    const token = AccessToken.fromJson(jsonObject);
    assert(token.toTokenString() === "Bearer abc123");
    assert(token.getUserInfo()?.id === "blah");
  });
});
