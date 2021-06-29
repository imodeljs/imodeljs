/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import * as puppeteer from "puppeteer";
import { ChildProcess } from "child_process";
import { spawnChildProcess } from "../../utils/SpawnUtils";
import { executeRegisteredCallback } from "../../utils/CallbackUtils";
import { CertaConfig } from "../../CertaConfig";
import { writeCoverageData } from "../../utils/CoverageUtils";
import { configureRemoteReporter } from "./MochaRemoteReporter";

interface ChromeTestResults {
  failures: number;
  coverage: any;
}

type ConsoleMethodName = keyof typeof console;

let browser: puppeteer.Browser;
let webserverProcess: ChildProcess;

export class ChromeTestRunner {
  public static readonly supportsCoverage = true;
  public static async initialize(config: CertaConfig): Promise<void> {
    // Go ahead and launch puppeteer now - the VS Code debugger gets confused if it can't at least see the chrome instance right away.
    const options = {
      ignoreHTTPSErrors: true,
      args: config.chromeOptions.args,
      headless: !config.debug,
    };

    if (config.debug)
      options.args.push(`--disable-gpu`, `--remote-debugging-port=${config.ports.frontendDebugging}`);

    browser = await puppeteer.launch(options);

    const webserverEnv = {
      CERTA_PORT: `${config.ports.frontend}`, // eslint-disable-line @typescript-eslint/naming-convention
      CERTA_PATH: path.join(__dirname, "../../../public/index.html"), // eslint-disable-line @typescript-eslint/naming-convention
      CERTA_PUBLIC_DIRS: JSON.stringify(config.chromeOptions.publicDirs), // eslint-disable-line @typescript-eslint/naming-convention
    };
    webserverProcess = spawnChildProcess("node", [require.resolve("./webserver")], webserverEnv, true);

    // Don't continue until the webserver is started and listening.
    const webserverExited = new Promise<never>((_resolve, reject) => webserverProcess.once("exit", () => reject("Webserver exited!")));
    const webserverStarted = new Promise<number>((resolve) => webserverProcess.once("message", resolve));
    const actualPort = await Promise.race([webserverExited, webserverStarted]);
    if (actualPort !== config.ports.frontend)
      console.warn(`CERTA: Port ${config.ports.frontend} was already in use, so serving test resources on port ${actualPort}`);
    process.env.CERTA_PORT = String(actualPort);
  }

  public static async runTests(config: CertaConfig): Promise<void> {
    // FIXME: Do we really want to always enforce this behavior?
    if (process.env.CI || process.env.TF_BUILD)
      (config.mochaOptions as any).forbidOnly = true;

    const { failures, coverage } = await runTestsInPuppeteer(config, process.env.CERTA_PORT!);
    webserverProcess.kill();

    // Save nyc/istanbul coverage file.
    if (config.cover)
      writeCoverageData(coverage);

    process.exit(failures);
  }
}

async function loadScript(page: puppeteer.Page, scriptPath: string) {
  return page.addScriptTag({ url: `/@/${scriptPath}` });
}

async function runTestsInPuppeteer(config: CertaConfig, port: string) {
  return new Promise<ChromeTestResults>(async (resolve, reject) => {
    try {
      const page = (await browser.pages()).pop() || await browser.newPage();

      // Don't let dialogs block tests
      page.on("dialog", async (dialog) => dialog.dismiss());

      // Re-throw any uncaught exceptions from the frontend in the backend
      page.on("pageerror", reject);

      // Expose some functions to the frontend that will execute _in the backend context_
      await page.exposeFunction("_CertaConsole", (type: ConsoleMethodName, args: any[]) => console[type](...args));
      await page.exposeFunction("_CertaSendToBackend", executeRegisteredCallback);
      await page.exposeFunction("_CertaReportResults", (results: any) => {
        setTimeout(async () => {
          await browser.close();
          resolve(results);
        });
      });

      // Now load the page (and requisite scripts)...
      const testBundle = (config.cover && config.instrumentedTestBundle) || config.testBundle;
      await page.goto(`http://localhost:${port}`);
      await page.addScriptTag({ content: `var _CERTA_CONFIG = ${JSON.stringify(config)};` });
      await loadScript(page, require.resolve("../../utils/initLogging.js"));
      await loadScript(page, require.resolve("mocha/mocha.js"));
      await loadScript(page, require.resolve("source-map-support/browser-source-map-support.js"));
      await loadScript(page, require.resolve("../../utils/initSourceMaps.js"));
      await loadScript(page, require.resolve("./MochaSerializer.js"));
      await configureRemoteReporter(page);
      await loadScript(page, require.resolve("../../utils/initMocha.js"));
      await loadScript(page, testBundle);

      // ...and start the tests
      await page.evaluate(async () => {
        // NB: This is being evaluated in the frontend context!
        Mocha.reporters.Base.color = true as any;
        const globals = window as any;
        mocha.run((failures) => {
          const coverage = globals.__coverage__;
          globals._CertaReportResults({ failures, coverage }); // This will close the browser
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}
