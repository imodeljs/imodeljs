/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Compiler, DefinePlugin } from "webpack";
import { IModelJsOptionsDefaulter } from "../utils/IModelJsOptionsDefaulter";
import { CopyAppAssetsPlugin, CopyBentleyStaticResourcesPlugin } from "./CopyBentleyStaticResourcesPlugin";
import { CopyExternalsPlugin } from "./CopyExternalsPlugin";
import { IgnoreOptionalDependenciesPlugin } from "./OptionalDependenciesPlugin";
import { addCopyFilesSuffix, addExternalPrefix, copyFilesRule, handlePrefixedExternals, RequireMagicCommentsPlugin } from "./RequireMagicCommentsPlugin";

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/naming-convention */
const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");
const ExternalsPlugin = require("webpack/lib/ExternalsPlugin");
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/naming-convention */

export class BackendDefaultsPlugin {
  public apply(compiler: Compiler) {
    // By default, webpack will prefer ES Modules over CommonJS modules.
    // This causes trouble with importing node-fetch, so we need to explicitly prefer CommonJS over ES/Harmony.
    // https://github.com/bitinn/node-fetch/issues/450#issuecomment-494475397
    compiler.options.resolve!.mainFields = ["main"];

    // Don't bother minimizing backends...
    compiler.options.optimization!.minimize = false;

    compiler.options = new IModelJsOptionsDefaulter().process(compiler.options);
    compiler.options.module!.rules = [
      ...(compiler.options.module!.rules || []),
      {
        test: /\.ecschema\.xml$/,
        loader: require.resolve("file-loader"),
        options: {
          name: "ecschemas/[name].[ext]",
        },
      },
      copyFilesRule,
    ];

    // Add default plugins
    const plugins = [
      new CopyAppAssetsPlugin("assets"),
      new CopyBentleyStaticResourcesPlugin(["assets"]), // eslint-disable-line deprecation/deprecation
      new CopyExternalsPlugin(),
      new DefinePlugin({
        "global.GENTLY": false,
      }),
      new FilterWarningsPlugin({ exclude: /Failed to parse source map/ }),
      new IgnoreOptionalDependenciesPlugin([
        "debug",
        "diagnostic-channel-publishers",
        "express",
        "got",
        "keyv",
        "ws",
      ]),
      new RequireMagicCommentsPlugin([
        {
          test: /webpack: *external/i,
          handler: addExternalPrefix,
        },
        {
          test: /webpack: *copyfile/i,
          handler: addCopyFilesSuffix,
          convertResolve: true,
        },
      ]),
      new ExternalsPlugin("commonjs", [
        handlePrefixedExternals,
        "electron",
        "@bentley/imodeljs-native",
        "@bentley/imodeljs-native/package.json",
        "dtrace-provider",
        "node-report/api",
        "applicationinsights-native-metrics",
        "@opentelemetry/tracing",
      ]),
    ];
    plugins.forEach((p) => p.apply(compiler));
  }
}
