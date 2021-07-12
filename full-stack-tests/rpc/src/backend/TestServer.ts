/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelJsExpressServer } from "@bentley/express-server";

export class TestServer extends IModelJsExpressServer {
  protected override _configureHeaders() {
    super._configureHeaders();

    this._app.all("/**", (req, res, next) => {
      if (req.path.indexOf("-startCSRFTest") !== -1) {
        res.cookie("XSRF-TOKEN", "test");
      }

      if (req.path.indexOf("-stopCSRFTest") !== -1) {
        res.clearCookie("XSRF-TOKEN");
      }

      if (req.path.indexOf("-csrfTestEnabled") !== -1 && req.header("X-XSRF-TOKEN") !== "test") {
        throw new Error("CSRF is not enabled.");
      }

      if (req.path.indexOf("-csrfTestDisabled") !== -1 && req.header("X-XSRF-TOKEN")) {
        throw new Error("CSRF is not disabled.");
      }

      next();
    });
  }
}
