
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */
import { AuthStatus, BentleyError, Logger } from "@bentley/bentleyjs-core";
import { ITwinClientLoggerCategory } from "./ITwinClientLoggerCategory";

const loggerCategory = ITwinClientLoggerCategory.Authorization;

/** @public */
export interface UserInfoProps {
  id: string;
  email?: { id: string, isVerified?: boolean };
  profile?: { firstName: string, lastName: string, name?: string, preferredUserName?: string };
  organization?: { id: string, name: string };
  featureTracking?: { ultimateSite: string, usageCountryIso: string };
}

/** Information on the authenticated user.
 * @public
 */
export class UserInfo {
  constructor(
    /** Id of the user */
    public id: string,

    /** Email details */
    public email?: { id: string, isVerified?: boolean },

    /** Profile of the user */
    public profile?: { firstName: string, lastName: string, name?: string, preferredUserName?: string },

    /** Organization the user belongs to */
    public organization?: { id: string, name: string },

    /** Feature tracking information associated with the user */
    public featureTracking?: { ultimateSite: string, usageCountryIso: string },
  ) { }

  /** Creates a strongly typed UserInfo object from untyped JSON with the same properties as [[UserInfo]]
   * @see [[UserInfo.fromTokenResponseJson]] for use cases that involve parsing responses from typical Authorization Client-s.
   * @throws [BentleyError]($bentley) if the supplied json parameter is undefined
   * @beta
   */
  public static fromJson(jsonObj: UserInfoProps): UserInfo {
    if (!jsonObj)
      throw new BentleyError(AuthStatus.Error, "Expected valid json to be passed to UserInfo.fromTokenResponseJson", Logger.logError, loggerCategory, () => jsonObj);
    return new UserInfo(jsonObj.id, jsonObj.email, jsonObj.profile, jsonObj.organization, jsonObj.featureTracking);
  }

  /**
   * Creates UserInfo from the typical token response obtained from Authorization servers
   * - Note that we map these fields from the token response to different names in UserInfo to keep with typescript guidelines.
   * - Only basic validation is done - the input parameter must be defined
   * @see [[UserInfo.fromJson]] for use cases that involve serialization/deserialization of UserInfo
   * @throws [BentleyError]($bentley) if the supplied json parameter is undefined
   * @internal
   */
  public static fromTokenResponseJson(jsonObj: any): UserInfo {
    if (!jsonObj)
      throw new BentleyError(AuthStatus.Error, "Expected valid json to be passed to UserInfo.fromTokenResponseJson", Logger.logError, loggerCategory, () => jsonObj);
    const id: string = jsonObj.sub;
    const email: any = jsonObj.email ? { id: jsonObj.email, isVerified: jsonObj.email_verified } : undefined;
    const profile: any = jsonObj.given_name ? { name: jsonObj.name, preferredUserName: jsonObj.preferred_username, firstName: jsonObj.given_name, lastName: jsonObj.family_name } : undefined;
    const organization: any = jsonObj.org ? { id: jsonObj.org, name: jsonObj.org_name } : undefined;
    const featureTracking: any = jsonObj.ultimate_site ? { ultimateSite: jsonObj.ultimate_site, usageCountryIso: jsonObj.usage_country_iso } : undefined;
    return new UserInfo(id, email, profile, organization, featureTracking);
  }
}
