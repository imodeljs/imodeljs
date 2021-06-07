/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ContextRegistryClient, ContextRegistryRequestQueryOptions, Project } from "@bentley/context-registry-client";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers } from "@bentley/oidc-signin-tool/lib/frontend";
import { Permission, RbacClient } from "../../RbacClient";
import { TestConfig } from "../TestConfig";

//  These tests require that the client_id requests the following scopes:
//    - openid
//    - context-registry-service:read-only
//    - rbac-user:external-client

describe("RbacClient (#integration)", () => {
  const contextRegistry = new ContextRegistryClient();
  const rbacClient = new RbacClient();
  let requestContext: AuthorizedClientRequestContext;

  before(async function () {
    this.timeout(0);
    requestContext = await TestConfig.getAuthorizedClientRequestContext(TestUsers.super);
  });

  it("should get the permissions for any service for the specified project (#integration)", async () => {
    // Get test project
    const queryOptions: ContextRegistryRequestQueryOptions = {
      $select: "*",
      $filter: `Name+eq+'${TestConfig.projectName}'`,
    };

    const project: Project = await contextRegistry.getProject(requestContext, queryOptions);
    expect(!!project);

    const iModelHubServiceGPRId = 2485;
    const permissions: Permission[] = await rbacClient.getPermissions(requestContext, project.wsgId, iModelHubServiceGPRId);
    expect(permissions.length).equals(9);
  });

  it("should get the object type relevant to iModelHub for the specified project (#integration)", async () => {
    const objectTypeId: string = await rbacClient.getObjectTypeId(requestContext, "IMHS_ObjectType_iModel", 2485);
    expect(objectTypeId);
  });
});
