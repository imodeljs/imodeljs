/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
const path = require("path");

// A workaround to @testing-library/react {@testing-library/dom {wait-for-expect}} breaking somewhere,
// because somewhere (most likely in jsdom) window.Date becomes undefined.
// Similar issue mentioned in https://github.com/vuejs/vue-test-utils/issues/936
require('jsdom-global')();
window.Date = Date;
document.elementFromPoint = () => null;

// Fill in more missing functions left out by jsdom or mocha
performance = window.performance;

const {
  JSDOM
} = require('jsdom');
global.DOMParser = new JSDOM().window.DOMParser;

/** Enzyme mount with automatic unmount after the test. */
let mounted = [];
const isMounted = Symbol("isMounted");
global.enzymeMount = (...args) => {
  const enzyme = require("enzyme");
  const result = enzyme.mount(...args);
  result[isMounted] = true;
  const unmount = result.unmount.bind(result);
  result.unmount = () => {
    result[isMounted] = false;
    return unmount();
  };
  mounted.push(result);
  return result;
}

const chai = require("chai");
const sinonChai = require("sinon-chai");
const chaiAsPromised = require("chai-as-promised");
const chaiJestSnapshot = require("chai-jest-snapshot");
const enzyme = require("enzyme/build");
const spies = require("chai-spies");
const rhtl = require("@testing-library/react-hooks");

// Fix node's module loader to strip ?sprite from SVG imports
const m = require("module");
const origLoader = m._load;
m._load = (request, parent, isMain) => {
  return origLoader(request.replace("?sprite", ""), parent, isMain);
};

// setup enzyme (testing utils for React)
enzyme.configure({
  adapter: new (require("enzyme-adapter-react-16/build"))()
});
chaiJestSnapshot.addSerializer(require("enzyme-to-json/serializer"));

// setup chai
chai.should();
chai.use(chaiAsPromised);
chai.use(chaiJestSnapshot);
chai.use(spies);
chai.use(sinonChai);
try {
  chai.use(require("chai-string"));
} catch (e) { }

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();
});

after(function () {
  delete require.cache[__filename];
});

beforeEach(function () {
  const currentTest = this.currentTest;

  try {
    // we want snapshot tests to use the same random data between runs
    const faker = require("faker");
    let seed = 0;
    for (let i = 0; i < currentTest.fullTitle().length; ++i)
      seed += currentTest.fullTitle().charCodeAt(i);
    faker.seed(seed);
  } catch (e) {
    // may throw if package doesn't use faker - ignore
  }

  // set up snapshot name
  const sourceFilePath = currentTest.file.replace(path.join("lib", "test"), path.join("src", "test")).replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = sourceFilePath + ".snap";
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());

  chai.spy.restore();
});

afterEach(async () => {
  for (const m of mounted) {
    if (!m[isMounted])
      continue;
    m.unmount();
  }
  mounted = [];
  try {
    const rtl = require("@testing-library/react");
    rtl.cleanup();
  } catch (e) { }
  await rhtl.cleanup();
  try {
    const sinon = require("sinon");
    sinon.restore();
  } catch (e) { }
});
