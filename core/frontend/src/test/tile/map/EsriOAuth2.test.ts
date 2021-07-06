/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { EsriOAuth2, EsriOAuth2EndpointType } from "../../../tile/map/EsriOAuth2";

describe("ESRI OAuth2", () => {
  const sampleOnPremiseFeatureServer1 = "https://dtlgeoarcgis.adtl.com/server/rest/services/SampleWorldCities/FeatureServer/";
  const sampleAuthorizeUrl1 = "https://dtlgeoarcgis.adtl.com/server/sharing/rest/oauth2/authorize";
  const sampleTokenUrl1 = "https://dtlgeoarcgis.adtl.com/server/sharing/rest/oauth2/token";

  const sampleOnPremiseFeatureServer2 = "https://dtlgeoarcgis.adtl.com/arcgis/rest/services/SampleWorldCities/FeatureServer/";
  const sampleAuthorizeUrl2 = "https://dtlgeoarcgis.adtl.com/arcgis/sharing/rest/oauth2/authorize";

  const sampleOnPremiseFeatureServer3 = "https://dtlgeoarcgis.adtl.com:444/arcgis/rest/services/SampleWorldCities/FeatureServer/";
  const sampleAuthorizeUrl3 = "https://dtlgeoarcgis.adtl.com:444/arcgis/sharing/rest/oauth2/authorize";

  const sampleBadUrl = "https://dtlgeoarcgis.adtl.com/server/test/";

  const sampleOnlineFeatureServer1 = "https://services3.arcgis.com/RRwXxn3KKYHT7QV6/arcgis/rest/services/Quebec/MapServer";
  const sampleOnlineAuthorize1 = "https://www.arcgis.com/sharing/rest/oauth2/authorize";
  const sampleOnlineToken1 = "https://www.arcgis.com/sharing/rest/oauth2/token";

  it("should build proper OAuth2 endpoint URL", async () => {

    const authorize1 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnPremiseFeatureServer1, EsriOAuth2EndpointType.Authorize);
    expect(authorize1).to.not.undefined;
    expect(authorize1).to.equals(sampleAuthorizeUrl1);

    const token1 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnPremiseFeatureServer1, EsriOAuth2EndpointType.Token);
    expect(token1).to.not.undefined;
    expect(token1).to.equals(sampleTokenUrl1);

    const authorize2 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnPremiseFeatureServer2, EsriOAuth2EndpointType.Authorize);
    expect(authorize2).to.not.undefined;
    expect(authorize2).to.not.undefined;
    expect(authorize2).to.equals(sampleAuthorizeUrl2);

    const authorize3 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnPremiseFeatureServer3, EsriOAuth2EndpointType.Authorize);
    expect(authorize3).to.not.undefined;
    expect(authorize3).to.equals(sampleAuthorizeUrl3);

    const authorize4 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleBadUrl, EsriOAuth2EndpointType.Authorize);
    expect(authorize4).to.undefined;

    const authorize5 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnlineFeatureServer1, EsriOAuth2EndpointType.Authorize);
    expect(authorize5).to.not.undefined;
    expect(authorize5).to.equals(sampleOnlineAuthorize1);

    const authorize6 =  EsriOAuth2.getOAuth2EndpointFromRestUrl(sampleOnlineFeatureServer1, EsriOAuth2EndpointType.Token);
    expect(authorize6).to.not.undefined;
    expect(authorize6).to.equals(sampleOnlineToken1);
  });

});
