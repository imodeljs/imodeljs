/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "@bentley/presentation-frontend/lib/test/_helpers/MockFrontendEnvironment";
import * as chai from "chai";
import chaiSubset from "chai-subset";
import * as cpx from "cpx";
import * as fs from "fs";
import * as path from "path";
import sinonChai from "sinon-chai";
import { ClientRequestContext, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { loadEnv } from "@bentley/config-loader";
import { IModelAppOptions, NoRenderApp } from "@bentley/imodeljs-frontend";
import { I18NOptions } from "@bentley/imodeljs-i18n";
import { TestUsers } from "@bentley/oidc-signin-tool/lib/TestUsers";
import { TestUtility } from "@bentley/oidc-signin-tool/lib/TestUtility";
import {
  HierarchyCacheMode, Presentation as PresentationBackend, PresentationBackendNativeLoggerCategory,
  PresentationProps as PresentationBackendProps,
} from "@bentley/presentation-backend";
import { RequestPriority } from "@bentley/presentation-common";
import { PresentationManagerProps as PresentationFrontendProps } from "@bentley/presentation-frontend";
import { initialize as initializeTesting, PresentationTestingInitProps, terminate as terminateTesting } from "@bentley/presentation-testing";

chai.use(sinonChai);
chai.use(chaiSubset);

loadEnv(path.join(__dirname, "..", ".env"));

const copyBentleyBackendAssets = (outputDir: string) => {
  const bentleyPackagesPath = "node_modules/@bentley";
  fs.readdirSync(bentleyPackagesPath).map((packageName) => {
    const packagePath = path.resolve(bentleyPackagesPath, packageName);
    return path.join(packagePath, "lib", "assets");
  }).filter((assetsPath) => {
    return fs.existsSync(assetsPath);
  }).forEach((src) => {
    cpx.copySync(`${src}/**/*`, outputDir);
  });
};

const copyBentleyFrontendAssets = (outputDir: string) => {
  const bentleyPackagesPath = "node_modules/@bentley";
  fs.readdirSync(bentleyPackagesPath).map((packageName) => {
    const packagePath = path.resolve(bentleyPackagesPath, packageName);
    return path.join(packagePath, "lib", "public");
  }).filter((assetsPath) => {
    return fs.existsSync(assetsPath);
  }).forEach((src) => {
    cpx.copySync(`${src}/**/*`, outputDir);
  });
};

class IntegrationTestsApp extends NoRenderApp {
  protected static supplyI18NOptions(): I18NOptions {
    const urlTemplate = `file://${path.join(path.resolve("lib/public/locales"), "{{lng}}/{{ns}}.json").replace(/\\/g, "/")}`;
    return { urlTemplate };
  }

  public static override async startup(opts?: IModelAppOptions): Promise<void> {
    await NoRenderApp.startup({ ...opts, i18n: this.supplyI18NOptions() });
    cpx.copySync(`assets/**/*`, "lib/assets");
    copyBentleyBackendAssets("lib/assets");
    copyBentleyFrontendAssets("lib/public");
  }
}

const initializeCommon = async (props: { backendTimeout?: number, useClientServices?: boolean }) => {
  // init logging
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel(PresentationBackendNativeLoggerCategory.ECObjects, LogLevel.Warning);

  const libDir = path.resolve("lib");
  const backendInitProps: PresentationBackendProps = {
    requestTimeout: props.backendTimeout ?? 0,
    rulesetDirectories: [path.join(libDir, "assets", "rulesets")],
    localeDirectories: [path.join(libDir, "assets", "locales")],
    activeLocale: "en-PSEUDO",
    taskAllocationsMap: {
      [RequestPriority.Max]: 1,
    },
    cacheConfig: { mode: HierarchyCacheMode.Disk, directory: path.join(libDir, "cache") },
  };
  const frontendInitProps: PresentationFrontendProps = {
    activeLocale: "en-PSEUDO",
  };

  const frontendAppOptions: IModelAppOptions = {
    authorizationClient: props.useClientServices
      ? TestUtility.getAuthorizationClient(TestUsers.regular)
      : undefined,
  };

  if (props.useClientServices)
    await frontendAppOptions.authorizationClient!.signIn(new ClientRequestContext());

  const presentationTestingInitProps: PresentationTestingInitProps = {
    backendProps: backendInitProps,
    frontendProps: frontendInitProps,
    frontendApp: IntegrationTestsApp,
    frontendAppOptions,
  };

  await initializeTesting(presentationTestingInitProps);
};

export const initialize = async (backendTimeout: number = 0) => {
  await initializeCommon({ backendTimeout });
};

export const initializeWithClientServices = async () => {
  await initializeCommon({ useClientServices: true });
};

export const terminate = async () => {
  await terminateTesting();
};

export const resetBackend = () => {
  const props = PresentationBackend.initProps;
  PresentationBackend.terminate();
  PresentationBackend.initialize(props);
};
