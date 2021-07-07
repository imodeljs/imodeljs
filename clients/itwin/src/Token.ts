/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */
import { AuthStatus, BentleyError, Logger } from "@bentley/bentleyjs-core";
import { ITwinClientLoggerCategory } from "./ITwinClientLoggerCategory";
import { UserInfo, UserInfoProps } from "./UserInfo";
const loggerCategory = ITwinClientLoggerCategory.Authorization;

/**
 * Option to specify if the prefix identifying the token is included when serializing the access token.
 * * JWTs (Jason Web Tokens) are identified with a "Bearer" prefix.
 * * Typically the prefix is required for calls made across the wire.
 * @public
 */
export enum IncludePrefix {
  Yes = 0,
  No = 1,
}

/**
 * When TokenPrefix is used as a decorator for a class, this function gets access to that class's constructor. That class's constructor is stored
 * in a dictionary that maps token prefix to constructor.
 * @param prefix Prefix of the Token
 * @internal
 */
export function TokenPrefix(prefix: string) { // eslint-disable-line @typescript-eslint/naming-convention
  return (constructor: any) => {
    TokenPrefixToTypeContainer.tokenPrefixToConstructorDict[prefix] = constructor;
  };
}

/**
 * Class solely to hold the dictionary of mappings from token prefix (string) to the token's constructor
 * @internal
 */
class TokenPrefixToTypeContainer {
  public static tokenPrefixToConstructorDict: { [key: string]: any } = {};
}

/** Properties for transmitting AccessTokens between processes
 * @public
 */
export interface AccessTokenProps {
  tokenString: string;
  startsAt?: string;
  expiresAt?: string;
  userInfo?: UserInfoProps;
}

/** Token used for authorization
 * @public
 */
@TokenPrefix("Bearer")
export class AccessToken {
  protected _prefix: string;
  protected _tokenString: string;
  private _userInfo?: UserInfo;
  private _startsAt?: Date;
  private _expiresAt?: Date;

  /** Create a new AccessToken given a JWT (JSON Web Token) */
  public constructor(tokenString?: string, startsAt?: Date, expiresAt?: Date, userInfo?: UserInfo) {
    this._tokenString = tokenString ?? "";
    this._startsAt = startsAt;
    this._expiresAt = expiresAt;
    this._userInfo = userInfo;
    this.setPrefix("Bearer");
  }

  /** @internal */
  public getUserInfo(): UserInfo | undefined {
    return this._userInfo;
  }

  /** @internal */
  public setUserInfo(userInfo: UserInfo) {
    this._userInfo = userInfo;
  }

  /** @internal */
  public getExpiresAt(): Date | undefined {
    return this._expiresAt;
  }

  /** @internal */
  public getStartsAt(): Date | undefined {
    return this._startsAt;
  }
  protected setPrefix(prefix: string) {
    this._prefix = prefix;
  }

  /** returns true if this token has expired
   * @param buffer amount of time in seconds to return true before the real expiration time.
   */
  public isExpired(buffer: number) {
    return (undefined !== this._expiresAt) && (this._expiresAt.getTime() - (buffer * 1000)) < Date.now();
  }

  /**
   * Convert this AccessToken to a string that can be passed across the wire
   * Users should overwrite this method in a subclass of AccessToken if their token is not converted to a string in this way.
   * @param includePrefix Include the token prefix to identify the type of token - "Bearer" for JSON Web Tokens (JWTs)
   */
  public toTokenString(includePrefix: IncludePrefix = IncludePrefix.Yes): string {
    const jwt = this._tokenString;
    return (includePrefix === IncludePrefix.Yes) ? `${this._prefix} ${jwt}` : jwt;
  }

  /**
   * Initialize the jwt field of the current instance of the AccessToken
   * Users would typically override this method in a subclass of AccessToken
   * if their token has to be initialized in a different way
   * @param tokenStr String representation of the token
   */
  public initFromTokenString(tokenStr: string): void {
    if (!tokenStr.startsWith(this._prefix)) {
      throw new BentleyError(AuthStatus.Error, "Invalid access token", Logger.logError, loggerCategory, () => ({ tokenStr }));
    }
    const jwt = tokenStr.substr(this._prefix.length + 1);
    this._tokenString = jwt;
  }

  /**
   * Create an AccessToken from a string that's typically passed across the wire
   * - The AccessToken will not include the user information or expiry information
   * - The token must include the "Bearer" prefix that identifies JSON Web Tokens (JWTs)
   * - The token is NOT validated in any way other than the basic prefix check described above
   * @param tokenStr String representation of the token
   * @throws [[BentleyError]] If the token does not have the required prefix
   */
  public static fromTokenString(tokenStr: string): AccessToken {
    const accessToken: AccessToken = AccessToken.generateProperTokenType(tokenStr);
    accessToken.initFromTokenString(tokenStr);
    return accessToken;
  }

  private static generateProperTokenType(tokenStr: string): any {
    for (const key in TokenPrefixToTypeContainer.tokenPrefixToConstructorDict) {
      if (tokenStr.startsWith(key)) {
        return new TokenPrefixToTypeContainer.tokenPrefixToConstructorDict[key]();
      }
    }
    throw new BentleyError(AuthStatus.Error, "Invalid access token", Logger.logError, loggerCategory, () => ({ tokenStr }));
  }

  /**
   * Creates a strongly typed AccessToken object from an untyped JSON with the same properties as [[AccessToken]]
   * @param jsonObj
   * @throws [BentleyError]($bentley) if the supplied tokenResponse is undefined, or does not contain an "access_token" field
   */
  public static fromJson(jsonObj: AccessTokenProps): AccessToken {
    const jwt = jsonObj.tokenString;
    const startsAt = jsonObj.startsAt !== undefined ? new Date(jsonObj.startsAt) : undefined;
    const expiresAt = jsonObj.expiresAt !== undefined ? new Date(jsonObj.expiresAt) : undefined;
    const userInfo = jsonObj.userInfo !== undefined ? UserInfo.fromJson(jsonObj.userInfo) : undefined;
    return new AccessToken(jwt, startsAt, expiresAt, userInfo);
  }

  public toJSON(): AccessTokenProps {
    return {
      tokenString: this._tokenString,
      startsAt: this._startsAt?.toJSON(),
      expiresAt: this._expiresAt?.toJSON(),
      userInfo: this._userInfo,
    };
  }

  /**
   * Creates an AccessToken from the typical token responses obtained from Authorization servers
   * - The fields from the token response to different names in AccessToken to keep with naming guidelines
   * - Only basic validation is done - the input tokenResponse must be defined, and have an "access_token" field in it
   * @param tokenResponse Response containing the token string as obtained from the authorization server
   * @param userProfileResponse Response containing the user profile information as obtained from the authorization server
   * @returns Strongly typed AccessToken
   * @see [[AccessToken.fromJson]] for use cases that involve serialization/deserialization of AccessToken
   * @throws [BentleyError]($bentley) if the supplied tokenResponse does not contain an "access_token" field
   * @internal
   */
  public static fromTokenResponseJson(tokenResponse: any, userProfileResponse?: any): AccessToken {
    if (!tokenResponse || !tokenResponse.access_token)
      throw new BentleyError(AuthStatus.Error, "Expected tokenResponse to contain access_token field", Logger.logError, loggerCategory, () => tokenResponse);

    const startsAt = new Date((tokenResponse.expires_at - tokenResponse.expires_in) * 1000);
    const expiresAt = new Date(tokenResponse.expires_at * 1000);
    const userInfo = userProfileResponse ? UserInfo.fromTokenResponseJson(userProfileResponse) : undefined;

    const token = new AccessToken(tokenResponse.access_token);
    token._startsAt = startsAt;
    token._expiresAt = expiresAt;
    token._userInfo = userInfo;
    return token;
  }
}
