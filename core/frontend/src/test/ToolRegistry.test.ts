/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { I18NNamespace } from "@bentley/imodeljs-i18n";
import { FuzzySearchResult, FuzzySearchResults } from "../FuzzySearch";
import { IModelApp } from "../IModelApp";
import { MockRender } from "../render/MockRender";
import { KeyinParseError, Tool } from "../tools/Tool";

// these are later set by executing the TestImmediate tool.
let testVal1: number;
let testVal2: number;
let lastCommand: string;

/** class to test immediate tool */
class TestImmediate extends Tool {
  public static override toolId = "Test.Immediate";
  public override run(v1: number, v2: number): boolean {
    testVal1 = v1;
    testVal2 = v2;
    return true;
  }
  public static override get minArgs() { return 2; }
  public static override get maxArgs() { return 2; }
  public override parseAndRun(v1: string, v2: string): boolean {
    if (arguments.length !== 2)
      return false;
    return this.run(parseInt(v1, 10), parseInt(v2, 10));
  }
}

// spell-checker: disable
class TestCommandApp extends MockRender.App {
  public static testNamespace?: I18NNamespace;

  public static override async startup(): Promise<void> {
    await IModelApp.startup({ i18n: this.supplyI18NOptions() });
    this.testNamespace = IModelApp.i18n.registerNamespace("TestApp");
    TestImmediate.register(this.testNamespace);
  }

  protected static supplyI18NOptions() { return { urlTemplate: `${window.location.origin}/locales/{{lng}}/{{ns}}.json` }; }
}

async function setupToolRegistryTests() {
  await TestCommandApp.startup();
  createTestTools();
  await IModelApp.i18n.waitForAllRead();

}

function logResult(..._args: any[]) {
  // eslint-disable-next-line no-console
  // console.log(..._args);
}

describe("ToolRegistry", () => {
  before(async () => setupToolRegistryTests());
  after(async () => TestCommandApp.shutdown());

  it("Should find Select tool", async () => {
    const command = IModelApp.tools.findExactMatch("Select Elements");
    assert.isDefined(command, "Found Select Elements Command");
    if (command) {
      assert.isTrue(command.prototype instanceof Tool);
    }
  });

  it("Should execute the TestImmediate command", async () => {
    const command = IModelApp.tools.findExactMatch("Localized TestImmediate Keyin")!;
    assert.equal(command, TestImmediate, "Found TestImmediate");
    assert.equal(command.minArgs, 2);
    assert.equal(command.maxArgs, 2);
    let cmdReturn = new command().run(4, 22);
    assert.isTrue(cmdReturn);
    assert.equal(testVal1, 4, "TestImmediate tool set values");
    assert.equal(testVal2, 22);
    cmdReturn = new TestImmediate().parseAndRun("5", "33");
    assert.isTrue(cmdReturn);
    assert.equal(testVal1, 5, "From parseAndRun");
    assert.equal(testVal2, 33);
    cmdReturn = new command().parseAndRun("125");
    assert.isFalse(cmdReturn);
  });

  function testKeyinArgs(keyin: string, args: string[], expectedToolKeyin?: string) {
    const result = IModelApp.tools.parseKeyin(keyin);
    expect(result.ok).to.be.true;
    if (result.ok) {
      assert.equal(result.args.length, args.length);
      args.forEach((parsedArg, index) => assert.equal(parsedArg, result.args[index]));
      if (undefined !== expectedToolKeyin)
        expect(result.tool.keyin).to.equal(expectedToolKeyin);
    }
  }

  function expectParseError(keyin: string, expectedError: KeyinParseError) {
    const result = IModelApp.tools.parseKeyin(keyin);
    expect(result.ok).to.be.false;
    if (!result.ok)
      expect(result.error).to.equal(expectedError);
  }

  it("Should parse command with quoted arguments", () => {
    testKeyinArgs(`uccalc test args with "a quoted string" included`, ["test", "args", "with", "a quoted string", "included"]);
    testKeyinArgs(`uccalc "a quoted string"`, ["a quoted string"]);
    testKeyinArgs(`uccalc this has "a quoted string"`, ["this", "has", "a quoted string"]);
    testKeyinArgs(`uccalc "a quoted string" is before me`, ["a quoted string", "is", "before", "me"]);
    testKeyinArgs(`uccalc "my arg"`, ["my arg"]);
  });

  it("Should parse quoted arguments with embedded quotes", () => {
    testKeyinArgs(`uccalc "a single "" inside"`, [`a single " inside`]);
    testKeyinArgs(`uccalc """ is first"`, [`" is first`]);
    testKeyinArgs(`uccalc "trailing """`, [`trailing "`]);
    testKeyinArgs(`uccalc "double """" quotes"`, [`double "" quotes`]);
    testKeyinArgs(`uccalc "" """" """"""`, [``, `"`, `""`]);
    testKeyinArgs(`uccalc no "yes """ no """ yes" no "yes "" yes"`, [`no`, `yes "`, `no`, `" yes`, `no`, `yes " yes`]);
  });

  it("Should parse command with mismatched quotes", () => {
    expectParseError(`uccalc "test`, KeyinParseError.MismatchedQuotes);
    expectParseError(`uccalc abc "xyz`, KeyinParseError.MismatchedQuotes);
    expectParseError(`uccalc abc "x "" y "" z`, KeyinParseError.MismatchedQuotes);
  });

  it("Should not consider quoted tokens as part of tool keyin", () => {
    testKeyinArgs(`preprocessor format double`, [], "preprocessor format double");
    testKeyinArgs(`preprocessor format double abc "d e f"`, ["abc", "d e f"], "preprocessor format double");
    testKeyinArgs(`preprocessor format "double"`, ["double"], "preprocessor format");
    testKeyinArgs(`preprocessor format "double" abc "d e f"`, ["double", "abc", "d e f"], "preprocessor format");
    testKeyinArgs(`preprocessor "format" double`, ["format", "double"], "preprocessor");

    const result = IModelApp.tools.parseKeyin(`"preprocessor" format double`);
    expect(result.ok).to.be.false;
    if (!result.ok)
      expect(result.error).to.equal(KeyinParseError.ToolNotFound);
  });

  it("Should parse whitespace", () => {
    // NB: A quoted argument must always be preceded by whitespace; otherwise it is just another character in an unquoted argument.
    testKeyinArgs(`uccalc abc xyz"`, [`abc`, `xyz"`]);
    testKeyinArgs(`  uccalc   one two  three   "four"     "five six" seven`, ["one", "two", "three", "four", "five six", "seven"]);
    testKeyinArgs(`uccalc one"two"three four""five"`, [`one"two"three`, `four""five"`]);
    testKeyinArgs("\tuccalc\none\t \ttwo \n three", ["one", "two", "three"]);
  });

  it("Should find the MicroStation inputmanager training command", async () => {
    const command = IModelApp.tools.findExactMatch("inputmanager training");
    assert.isDefined(command, "Found inputmanager training command");
    if (command) {
      assert.isTrue(IModelApp.tools.run(command.toolId));
      assert.equal(lastCommand, "inputmanager training");
    }
  });

  it("Should find some partial matches for 'plac'", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("plac");
    showSearchResults("Matches for 'plac':", searchResults);
  });

  it("Should find some partial matches for 'plce'", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("plce");
    showSearchResults("Matches for 'plce':", searchResults);
  });

  it("Should find some partial matches for 'cone plac'", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("cone plac");
    showSearchResultsUsingIndexApi("Matches for 'cone plac':", searchResults);
  });
  it("Should find some partial matches for 'vie'", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("vie");
    showSearchResultsUsingIndexApi("Matches for 'vie':", searchResults);
  });
  it("Should find some partial matches for 'place '", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("place ");
    showSearchResults("Matches for 'place ':", searchResults);
  });
  it("Should find some nomatch results 'fjt'", async () => {
    const searchResults: FuzzySearchResults<typeof Tool> = IModelApp.tools.findPartialMatches("fjt");
    showSearchResults("Matches for 'place ':", searchResults);
  });
});

function caretStringFromBoldMask(keyin: string, boldMask: boolean[]): string {
  assert.isTrue(keyin.length === boldMask.length);
  let boldString: string = boldMask[0] ? "^" : " ";
  for (let index = 1; index < boldMask.length; index++) {
    boldString = boldString.concat(boldMask[index] ? "^" : " ");
  }
  return boldString;
}

function showSearchResults(title: string, searchResults: FuzzySearchResults<typeof Tool>) {
  expect(searchResults.length).to.be.greaterThan(0);
  logResult(searchResults.length, title);

  for (const thisResult of searchResults) {
    const keyin = thisResult.getMatchedValue();
    logResult(keyin);
    assert.isTrue(keyin.length > 0);

    const boldMask: boolean[] = thisResult.getBoldMask();
    logResult(caretStringFromBoldMask(keyin, boldMask));
  }
}

function showSearchResultsUsingIndexApi(title: string, searchResults?: FuzzySearchResults<typeof Tool>) {
  assert.isDefined(searchResults);
  if (!searchResults)
    return;
  logResult(searchResults.length, title);

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let resultIndex: number = 0; resultIndex < searchResults.length; resultIndex++) {
    const thisResult: FuzzySearchResult<typeof Tool> | undefined = searchResults.getResult(resultIndex);
    assert.isDefined(thisResult);

    const keyin = thisResult!.getMatchedValue();
    logResult(keyin);
    assert.isTrue(keyin && keyin.length > 0);

    const boldMask: boolean[] = thisResult!.getBoldMask();
    assert.isTrue(boldMask && boldMask.length > 0);
    logResult(caretStringFromBoldMask(keyin, boldMask));
  }
}

function registerTestClass(id: string, keyin: string, ns: I18NNamespace) {
  (class extends Tool {
    public static override toolId = id;
    public override run(): boolean { lastCommand = keyin; return true; }
    public static override get keyin(): string { return keyin; }

  }).register(ns);
}

function createTestTools(): void {
  const testCommandEntries: any = JSON.parse(testCommandsString);
  const ns: I18NNamespace = TestCommandApp.testNamespace!;
  for (const thisEntry of testCommandEntries) {
    // create a tool id by concatenating the words of the keyin.
    const toolId: string = thisEntry.commandString.replace(/ /g, ".");
    registerTestClass(toolId, thisEntry.commandString, ns);
  }
}

const testCommandsString: string = '[\
    {\
      "commandString": "update"\
    },\
    {\
      "commandString": "update 1"\
    },\
    {\
      "commandString": "update 2"\
    },\
    {\
      "commandString": "update 3"\
    },\
    {\
      "commandString": "update 4"\
    },\
    {\
      "commandString": "update 5"\
    },\
    {\
      "commandString": "update 6"\
    },\
    {\
      "commandString": "update 7"\
    },\
    {\
      "commandString": "update 8"\
    },\
    {\
      "commandString": "update right"\
    },\
    {\
      "commandString": "update left"\
    },\
    {\
      "commandString": "update both"\
    },\
    {\
      "commandString": "update all"\
    },\
    {\
      "commandString": "update view"\
    },\
    {\
      "commandString": "update grid"\
    },\
    {\
      "commandString": "update file"\
    },\
    {\
      "commandString": "update fence"\
    },\
    {\
      "commandString": "update fence inside"\
    },\
    {\
      "commandString": "update fence outside"\
    },\
    {\
      "commandString": "fit"\
    },\
    {\
      "commandString": "fit active"\
    },\
    {\
      "commandString": "fit reference"\
    },\
    {\
      "commandString": "fit all"\
    },\
    {\
      "commandString": "fit tofence"\
    },\
    {\
      "commandString": "window"\
    },\
    {\
      "commandString": "window area"\
    },\
    {\
      "commandString": "window center"\
    },\
    {\
      "commandString": "window origin"\
    },\
    {\
      "commandString": "window volume"\
    },\
    {\
      "commandString": "window back"\
    },\
    {\
      "commandString": "window front"\
    },\
    {\
      "commandString": "window move"\
    },\
    {\
      "commandString": "window move tlcorner"\
    },\
    {\
      "commandString": "window move topedge"\
    },\
    {\
      "commandString": "window move trcorner"\
    },\
    {\
      "commandString": "window move rightedge"\
    },\
    {\
      "commandString": "window move brcorner"\
    },\
    {\
      "commandString": "window move btmedge"\
    },\
    {\
      "commandString": "window move blcorner"\
    },\
    {\
      "commandString": "window move leftedge"\
    },\
    {\
      "commandString": "window move allcorners"\
    },\
    {\
      "commandString": "window close"\
    },\
    {\
      "commandString": "window sink"\
    },\
    {\
      "commandString": "window cascade"\
    },\
    {\
      "commandString": "window tile"\
    },\
    {\
      "commandString": "window bottomtotop"\
    },\
    {\
      "commandString": "window restore"\
    },\
    {\
      "commandString": "window minimize"\
    },\
    {\
      "commandString": "window maximize"\
    },\
    {\
      "commandString": "window changescreen"\
    },\
    {\
      "commandString": "window arrange"\
    },\
    {\
      "commandString": "zoom"\
    },\
    {\
      "commandString": "zoom in"\
    },\
    {\
      "commandString": "zoom in center"\
    },\
    {\
      "commandString": "zoom out"\
    },\
    {\
      "commandString": "zoom out center"\
    },\
    {\
      "commandString": "move"\
    },\
    {\
      "commandString": "move left"\
    },\
    {\
      "commandString": "move right"\
    },\
    {\
      "commandString": "move up"\
    },\
    {\
      "commandString": "move down"\
    },\
    {\
      "commandString": "move fence"\
    },\
    {\
      "commandString": "move acs"\
    },\
    {\
      "commandString": "move parallel"\
    },\
    {\
      "commandString": "move parallel distance"\
    },\
    {\
      "commandString": "move parallel keyin"\
    },\
    {\
      "commandString": "move parallel icon"\
    },\
    {\
      "commandString": "set"\
    },\
    {\
      "commandString": "set levels"\
    },\
    {\
      "commandString": "set levels on"\
    },\
    {\
      "commandString": "set levels off"\
    },\
    {\
      "commandString": "set levels toggle"\
    },\
    {\
      "commandString": "set text"\
    },\
    {\
      "commandString": "set text on"\
    },\
    {\
      "commandString": "set text off"\
    },\
    {\
      "commandString": "set text toggle"\
    },\
    {\
      "commandString": "set ed"\
    },\
    {\
      "commandString": "set ed on"\
    },\
    {\
      "commandString": "set ed off"\
    },\
    {\
      "commandString": "set ed toggle"\
    },\
    {\
      "commandString": "set grid"\
    },\
    {\
      "commandString": "set grid on"\
    },\
    {\
      "commandString": "set grid off"\
    },\
    {\
      "commandString": "set grid toggle"\
    },\
    {\
      "commandString": "set prompt"\
    },\
    {\
      "commandString": "set tpmode"\
    },\
    {\
      "commandString": "set tpmode locate"\
    },\
    {\
      "commandString": "set tpmode delta"\
    },\
    {\
      "commandString": "set tpmode distance"\
    },\
    {\
      "commandString": "set tpmode angle2"\
    },\
    {\
      "commandString": "set tpmode vdelta"\
    },\
    {\
      "commandString": "set tpmode acslocate"\
    },\
    {\
      "commandString": "set tpmode acsdelta"\
    },\
    {\
      "commandString": "set function"\
    },\
    {\
      "commandString": "set range"\
    },\
    {\
      "commandString": "set range on"\
    },\
    {\
      "commandString": "set range off"\
    },\
    {\
      "commandString": "set range toggle"\
    },\
    {\
      "commandString": "set ddepth"\
    },\
    {\
      "commandString": "set ddepth absolute"\
    },\
    {\
      "commandString": "set ddepth relative"\
    },\
    {\
      "commandString": "set pattern"\
    },\
    {\
      "commandString": "set pattern on"\
    },\
    {\
      "commandString": "set pattern off"\
    },\
    {\
      "commandString": "set pattern toggle"\
    },\
    {\
      "commandString": "set construct"\
    },\
    {\
      "commandString": "set construct on"\
    },\
    {\
      "commandString": "set construct off"\
    },\
    {\
      "commandString": "set construct toggle"\
    },\
    {\
      "commandString": "set dimension"\
    },\
    {\
      "commandString": "set dimension on"\
    },\
    {\
      "commandString": "set dimension off"\
    },\
    {\
      "commandString": "set dimension toggle"\
    },\
    {\
      "commandString": "set weight"\
    },\
    {\
      "commandString": "set weight on"\
    },\
    {\
      "commandString": "set weight off"\
    },\
    {\
      "commandString": "set weight toggle"\
    },\
    {\
      "commandString": "set nodes"\
    },\
    {\
      "commandString": "set nodes on"\
    },\
    {\
      "commandString": "set nodes off"\
    },\
    {\
      "commandString": "set nodes toggle"\
    },\
    {\
      "commandString": "set healing"\
    },\
    {\
      "commandString": "set healing on"\
    },\
    {\
      "commandString": "set healing off"\
    },\
    {\
      "commandString": "set healing toggle"\
    },\
    {\
      "commandString": "set hilite"\
    },\
    {\
      "commandString": "set hilite black"\
    },\
    {\
      "commandString": "set hilite blue"\
    },\
    {\
      "commandString": "set hilite green"\
    },\
    {\
      "commandString": "set hilite cyan"\
    },\
    {\
      "commandString": "set hilite red"\
    },\
    {\
      "commandString": "set hilite magenta"\
    },\
    {\
      "commandString": "set hilite yellow"\
    },\
    {\
      "commandString": "set hilite white"\
    },\
    {\
      "commandString": "set hilite lgrey"\
    },\
    {\
      "commandString": "set hilite dgrey"\
    },\
    {\
      "commandString": "set mirtext"\
    },\
    {\
      "commandString": "set mirtext on"\
    },\
    {\
      "commandString": "set mirtext off"\
    },\
    {\
      "commandString": "set mirtext toggle"\
    },\
    {\
      "commandString": "set database"\
    },\
    {\
      "commandString": "set stream"\
    },\
    {\
      "commandString": "set stream on"\
    },\
    {\
      "commandString": "set stream off"\
    },\
    {\
      "commandString": "set stream toggle"\
    },\
    {\
      "commandString": "set button"\
    },\
    {\
      "commandString": "set delete"\
    },\
    {\
      "commandString": "set delete on"\
    },\
    {\
      "commandString": "set delete off"\
    },\
    {\
      "commandString": "set delete toggle"\
    },\
    {\
      "commandString": "set control"\
    },\
    {\
      "commandString": "set stackfractions"\
    },\
    {\
      "commandString": "set stackfractions on"\
    },\
    {\
      "commandString": "set stackfractions off"\
    },\
    {\
      "commandString": "set stackfractions toggle"\
    },\
    {\
      "commandString": "set overview"\
    },\
    {\
      "commandString": "set overview on"\
    },\
    {\
      "commandString": "set overview off"\
    },\
    {\
      "commandString": "set overview toggle"\
    },\
    {\
      "commandString": "set overview right"\
    },\
    {\
      "commandString": "set overview left"\
    },\
    {\
      "commandString": "set lvlsymb"\
    },\
    {\
      "commandString": "set lvlsymb on"\
    },\
    {\
      "commandString": "set lvlsymb off"\
    },\
    {\
      "commandString": "set lvlsymb toggle"\
    },\
    {\
      "commandString": "set linewidth"\
    },\
    {\
      "commandString": "set linewidth on"\
    },\
    {\
      "commandString": "set linewidth off"\
    },\
    {\
      "commandString": "set linewidth toggle"\
    },\
    {\
      "commandString": "set linefill"\
    },\
    {\
      "commandString": "set linefill on"\
    },\
    {\
      "commandString": "set linefill off"\
    },\
    {\
      "commandString": "set linefill toggle"\
    },\
    {\
      "commandString": "set fill"\
    },\
    {\
      "commandString": "set fill on"\
    },\
    {\
      "commandString": "set fill off"\
    },\
    {\
      "commandString": "set fill toggle"\
    },\
    {\
      "commandString": "set cursor"\
    },\
    {\
      "commandString": "set cursor small"\
    },\
    {\
      "commandString": "set cursor full"\
    },\
    {\
      "commandString": "set cursor toggle"\
    },\
    {\
      "commandString": "set cursor orthogonal"\
    },\
    {\
      "commandString": "set cursor isometric"\
    },\
    {\
      "commandString": "set undo"\
    },\
    {\
      "commandString": "set undo on"\
    },\
    {\
      "commandString": "set undo off"\
    },\
    {\
      "commandString": "set undo toggle"\
    },\
    {\
      "commandString": "set auxinput"\
    },\
    {\
      "commandString": "set auxinput on"\
    },\
    {\
      "commandString": "set auxinput off"\
    },\
    {\
      "commandString": "set auxinput toggle"\
    },\
    {\
      "commandString": "set autopan"\
    },\
    {\
      "commandString": "set autopan on"\
    },\
    {\
      "commandString": "set autopan off"\
    },\
    {\
      "commandString": "set autopan toggle"\
    },\
    {\
      "commandString": "set maxgrid"\
    },\
    {\
      "commandString": "set edchar"\
    },\
    {\
      "commandString": "set plotter"\
    },\
    {\
      "commandString": "set locate"\
    },\
    {\
      "commandString": "set isoplane"\
    },\
    {\
      "commandString": "set isoplane top"\
    },\
    {\
      "commandString": "set isoplane left"\
    },\
    {\
      "commandString": "set isoplane right"\
    },\
    {\
      "commandString": "set isoplane all"\
    },\
    {\
      "commandString": "set dynosize"\
    },\
    {\
      "commandString": "set xor"\
    },\
    {\
      "commandString": "set xor black"\
    },\
    {\
      "commandString": "set xor blue"\
    },\
    {\
      "commandString": "set xor green"\
    },\
    {\
      "commandString": "set xor cyan"\
    },\
    {\
      "commandString": "set xor red"\
    },\
    {\
      "commandString": "set xor magenta"\
    },\
    {\
      "commandString": "set xor yellow"\
    },\
    {\
      "commandString": "set xor white"\
    },\
    {\
      "commandString": "set xor lgrey"\
    },\
    {\
      "commandString": "set xor dgrey"\
    },\
    {\
      "commandString": "set acsdisplay"\
    },\
    {\
      "commandString": "set acsdisplay on"\
    },\
    {\
      "commandString": "set acsdisplay off"\
    },\
    {\
      "commandString": "set acsdisplay toggle"\
    },\
    {\
      "commandString": "set parseall"\
    },\
    {\
      "commandString": "set parseall on"\
    },\
    {\
      "commandString": "set parseall off"\
    },\
    {\
      "commandString": "set parseall toggle"\
    },\
    {\
      "commandString": "set help"\
    },\
    {\
      "commandString": "set help on"\
    },\
    {\
      "commandString": "set help off"\
    },\
    {\
      "commandString": "set help toggle"\
    },\
    {\
      "commandString": "set smalltext"\
    },\
    {\
      "commandString": "set debug"\
    },\
    {\
      "commandString": "set scanner"\
    },\
    {\
      "commandString": "set scanner old"\
    },\
    {\
      "commandString": "set scanner new"\
    },\
    {\
      "commandString": "set camera"\
    },\
    {\
      "commandString": "set camera definition"\
    },\
    {\
      "commandString": "set camera position"\
    },\
    {\
      "commandString": "set camera target"\
    },\
    {\
      "commandString": "set camera lens"\
    },\
    {\
      "commandString": "set camera lens fisheye"\
    },\
    {\
      "commandString": "set camera lens extrawide"\
    },\
    {\
      "commandString": "set camera lens wide"\
    },\
    {\
      "commandString": "set camera lens normal"\
    },\
    {\
      "commandString": "set camera lens portrait"\
    },\
    {\
      "commandString": "set camera lens telephoto"\
    },\
    {\
      "commandString": "set camera lens telescopic"\
    },\
    {\
      "commandString": "set camera lens length"\
    },\
    {\
      "commandString": "set camera lens angle"\
    },\
    {\
      "commandString": "set camera distance"\
    },\
    {\
      "commandString": "set camera on"\
    },\
    {\
      "commandString": "set camera off"\
    },\
    {\
      "commandString": "set camera icon"\
    },\
    {\
      "commandString": "set camera toggle"\
    },\
    {\
      "commandString": "set view"\
    },\
    {\
      "commandString": "set view wireframe"\
    },\
    {\
      "commandString": "set view hidden"\
    },\
    {\
      "commandString": "set view filled"\
    },\
    {\
      "commandString": "set view smooth"\
    },\
    {\
      "commandString": "set sharecell"\
    },\
    {\
      "commandString": "set sharecell on"\
    },\
    {\
      "commandString": "set sharecell off"\
    },\
    {\
      "commandString": "set sharecell toggle"\
    },\
    {\
      "commandString": "set compatible"\
    },\
    {\
      "commandString": "set compatible off"\
    },\
    {\
      "commandString": "set compatible on"\
    },\
    {\
      "commandString": "set compatible dimension"\
    },\
    {\
      "commandString": "set compatible dimension on"\
    },\
    {\
      "commandString": "set compatible dimension off"\
    },\
    {\
      "commandString": "set compatible dimension toggle"\
    },\
    {\
      "commandString": "set compatible mline"\
    },\
    {\
      "commandString": "set compatible mline on"\
    },\
    {\
      "commandString": "set compatible mline off"\
    },\
    {\
      "commandString": "set compatible mline toggle"\
    },\
    {\
      "commandString": "set refbound"\
    },\
    {\
      "commandString": "set refbound on"\
    },\
    {\
      "commandString": "set refbound off"\
    },\
    {\
      "commandString": "set refbound toggle"\
    },\
    {\
      "commandString": "set background"\
    },\
    {\
      "commandString": "set background on"\
    },\
    {\
      "commandString": "set background off"\
    },\
    {\
      "commandString": "set background toggle"\
    },\
    {\
      "commandString": "set xorslot"\
    },\
    {\
      "commandString": "set confirm"\
    },\
    {\
      "commandString": "set confirm on"\
    },\
    {\
      "commandString": "set confirm off"\
    },\
    {\
      "commandString": "set confirm toggle"\
    },\
    {\
      "commandString": "set savearea"\
    },\
    {\
      "commandString": "set xordynamics"\
    },\
    {\
      "commandString": "set xordynamics on"\
    },\
    {\
      "commandString": "set xordynamics off"\
    },\
    {\
      "commandString": "set xordynamics toggle"\
    },\
    {\
      "commandString": "set rmdebug"\
    },\
    {\
      "commandString": "set printer"\
    },\
    {\
      "commandString": "set units"\
    },\
    {\
      "commandString": "set invisgeom"\
    },\
    {\
      "commandString": "set invisgeom byelement"\
    },\
    {\
      "commandString": "set invisgeom always"\
    },\
    {\
      "commandString": "set invisgeom never"\
    },\
    {\
      "commandString": "set invisgeom query"\
    },\
    {\
      "commandString": "set refleveloverrides"\
    },\
    {\
      "commandString": "set refleveloverrides on"\
    },\
    {\
      "commandString": "set refleveloverrides off"\
    },\
    {\
      "commandString": "set refleveloverrides toggle"\
    },\
    {\
      "commandString": "set displayset"\
    },\
    {\
      "commandString": "set displayset on"\
    },\
    {\
      "commandString": "set displayset off"\
    },\
    {\
      "commandString": "set displayset toggle"\
    },\
    {\
      "commandString": "set tags"\
    },\
    {\
      "commandString": "set tags on"\
    },\
    {\
      "commandString": "set tags off"\
    },\
    {\
      "commandString": "set tags toggle"\
    },\
    {\
      "commandString": "set limits"\
    },\
    {\
      "commandString": "set item"\
    },\
    {\
      "commandString": "set storageunit"\
    },\
    {\
      "commandString": "set uorperstorageunit"\
    },\
    {\
      "commandString": "set meshsmoothangle"\
    },\
    {\
      "commandString": "set markers"\
    },\
    {\
      "commandString": "set markers on"\
    },\
    {\
      "commandString": "set markers off"\
    },\
    {\
      "commandString": "set markers toggle"\
    },\
    {\
      "commandString": "set lod"\
    },\
    {\
      "commandString": "set lod fine"\
    },\
    {\
      "commandString": "set lod medium"\
    },\
    {\
      "commandString": "set lod coarse"\
    },\
    {\
      "commandString": "set backgroundmap"\
    },\
    {\
      "commandString": "set backgroundmap none"\
    },\
    {\
      "commandString": "set backgroundmap street"\
    },\
    {\
      "commandString": "set backgroundmap aerial"\
    },\
    {\
      "commandString": "set backgroundmap hybrid"\
    },\
    {\
      "commandString": "show"\
    },\
    {\
      "commandString": "show header"\
    },\
    {\
      "commandString": "show printer"\
    },\
    {\
      "commandString": "show plotter"\
    },\
    {\
      "commandString": "show reference"\
    },\
    {\
      "commandString": "show library"\
    },\
    {\
      "commandString": "show eof"\
    },\
    {\
      "commandString": "show uors"\
    },\
    {\
      "commandString": "show ae"\
    },\
    {\
      "commandString": "show font"\
    },\
    {\
      "commandString": "show pattern"\
    },\
    {\
      "commandString": "show depth"\
    },\
    {\
      "commandString": "show depth display"\
    },\
    {\
      "commandString": "show depth active"\
    },\
    {\
      "commandString": "show transactions"\
    },\
    {\
      "commandString": "show elmdpool"\
    },\
    {\
      "commandString": "show camera"\
    },\
    {\
      "commandString": "show camera position"\
    },\
    {\
      "commandString": "show camera target"\
    },\
    {\
      "commandString": "show camera lens"\
    },\
    {\
      "commandString": "show keyins"\
    },\
    {\
      "commandString": "show files"\
    },\
    {\
      "commandString": "show dupfiles"\
    },\
    {\
      "commandString": "show levelcaches"\
    },\
    {\
      "commandString": "show startup"\
    },\
    {\
      "commandString": "show configuration"\
    },\
    {\
      "commandString": "show commandtables"\
    },\
    {\
      "commandString": "view"\
    },\
    {\
      "commandString": "view top"\
    },\
    {\
      "commandString": "view bottom"\
    },\
    {\
      "commandString": "view left"\
    },\
    {\
      "commandString": "view right"\
    },\
    {\
      "commandString": "view front"\
    },\
    {\
      "commandString": "view back"\
    },\
    {\
      "commandString": "view iso"\
    },\
    {\
      "commandString": "view rghtiso"\
    },\
    {\
      "commandString": "view on"\
    },\
    {\
      "commandString": "view on 1"\
    },\
    {\
      "commandString": "view on 2"\
    },\
    {\
      "commandString": "view on 3"\
    },\
    {\
      "commandString": "view on 4"\
    },\
    {\
      "commandString": "view on 5"\
    },\
    {\
      "commandString": "view on 6"\
    },\
    {\
      "commandString": "view on 7"\
    },\
    {\
      "commandString": "view on 8"\
    },\
    {\
      "commandString": "view on right"\
    },\
    {\
      "commandString": "view on left"\
    },\
    {\
      "commandString": "view on all"\
    },\
    {\
      "commandString": "view off"\
    },\
    {\
      "commandString": "view off 1"\
    },\
    {\
      "commandString": "view off 2"\
    },\
    {\
      "commandString": "view off 3"\
    },\
    {\
      "commandString": "view off 4"\
    },\
    {\
      "commandString": "view off 5"\
    },\
    {\
      "commandString": "view off 6"\
    },\
    {\
      "commandString": "view off 7"\
    },\
    {\
      "commandString": "view off 8"\
    },\
    {\
      "commandString": "view off right"\
    },\
    {\
      "commandString": "view off left"\
    },\
    {\
      "commandString": "view off all"\
    },\
    {\
      "commandString": "view toggle"\
    },\
    {\
      "commandString": "view toggle 1"\
    },\
    {\
      "commandString": "view toggle 2"\
    },\
    {\
      "commandString": "view toggle 3"\
    },\
    {\
      "commandString": "view toggle 4"\
    },\
    {\
      "commandString": "view toggle 5"\
    },\
    {\
      "commandString": "view toggle 6"\
    },\
    {\
      "commandString": "view toggle 7"\
    },\
    {\
      "commandString": "view toggle 8"\
    },\
    {\
      "commandString": "view toggle right"\
    },\
    {\
      "commandString": "view toggle left"\
    },\
    {\
      "commandString": "view toggle all"\
    },\
    {\
      "commandString": "view image"\
    },\
    {\
      "commandString": "view clear"\
    },\
    {\
      "commandString": "view previous"\
    },\
    {\
      "commandString": "view next"\
    },\
    {\
      "commandString": "view quickscan"\
    },\
    {\
      "commandString": "view quickscan on"\
    },\
    {\
      "commandString": "view quickscan off"\
    },\
    {\
      "commandString": "view quickscan toggle"\
    },\
    {\
      "commandString": "view quickscan occlusion"\
    },\
    {\
      "commandString": "view quickscan occlusion on"\
    },\
    {\
      "commandString": "view quickscan occlusion off"\
    },\
    {\
      "commandString": "view quickscan occlusion toggle"\
    },\
    {\
      "commandString": "view quickscan statistics"\
    },\
    {\
      "commandString": "view quickscan statistics on"\
    },\
    {\
      "commandString": "view quickscan statistics off"\
    },\
    {\
      "commandString": "view quickscan statistics toggle"\
    },\
    {\
      "commandString": "view quickscan npasses"\
    },\
    {\
      "commandString": "view quickscan maxelementspernode"\
    },\
    {\
      "commandString": "view quickscan test"\
    },\
    {\
      "commandString": "view quickscan testlist"\
    },\
    {\
      "commandString": "view quickscan sort"\
    },\
    {\
      "commandString": "view quickscan sort on"\
    },\
    {\
      "commandString": "view quickscan sort off"\
    },\
    {\
      "commandString": "view quickscan sort toggle"\
    },\
    {\
      "commandString": "view quickscan weight"\
    },\
    {\
      "commandString": "view quickscan weight on"\
    },\
    {\
      "commandString": "view quickscan weight off"\
    },\
    {\
      "commandString": "view quickscan weight toggle"\
    },\
    {\
      "commandString": "view quickscan displayselected"\
    },\
    {\
      "commandString": "view quickscan displayselected on"\
    },\
    {\
      "commandString": "view quickscan displayselected off"\
    },\
    {\
      "commandString": "view quickscan displayselected toggle"\
    },\
    {\
      "commandString": "view quickscan displaytoselected"\
    },\
    {\
      "commandString": "view quickscan displaytoselected on"\
    },\
    {\
      "commandString": "view quickscan displaytoselected off"\
    },\
    {\
      "commandString": "view quickscan displaytoselected toggle"\
    },\
    {\
      "commandString": "view quickscan scanstatistics"\
    },\
    {\
      "commandString": "view quickscan nodestatistics"\
    },\
    {\
      "commandString": "view quickscan split"\
    },\
    {\
      "commandString": "view quickscan tree"\
    },\
    {\
      "commandString": "view quickscan debug"\
    },\
    {\
      "commandString": "view set"\
    },\
    {\
      "commandString": "view set model"\
    },\
    {\
      "commandString": "text"\
    },\
    {\
      "commandString": "text on"\
    },\
    {\
      "commandString": "text off"\
    },\
    {\
      "commandString": "text toggle"\
    },\
    {\
      "commandString": "attach"\
    },\
    {\
      "commandString": "attach menu"\
    },\
    {\
      "commandString": "attach library"\
    },\
    {\
      "commandString": "attach reference"\
    },\
    {\
      "commandString": "attach ae"\
    },\
    {\
      "commandString": "attach ae icon"\
    },\
    {\
      "commandString": "attach colortable"\
    },\
    {\
      "commandString": "attach colortable right"\
    },\
    {\
      "commandString": "attach colortable left"\
    },\
    {\
      "commandString": "attach colortable both"\
    },\
    {\
      "commandString": "attach colortable create"\
    },\
    {\
      "commandString": "attach colortable write"\
    },\
    {\
      "commandString": "attach acs"\
    },\
    {\
      "commandString": "attach da"\
    },\
    {\
      "commandString": "attach librarydir"\
    },\
    {\
      "commandString": "mc"\
    },\
    {\
      "commandString": "rotate"\
    },\
    {\
      "commandString": "rotate 3pts"\
    },\
    {\
      "commandString": "rotate vmatrx"\
    },\
    {\
      "commandString": "rotate view"\
    },\
    {\
      "commandString": "rotate view relative"\
    },\
    {\
      "commandString": "rotate view absolute"\
    },\
    {\
      "commandString": "rotate view points"\
    },\
    {\
      "commandString": "rotate view element"\
    },\
    {\
      "commandString": "rotate acs"\
    },\
    {\
      "commandString": "rotate acs relative"\
    },\
    {\
      "commandString": "rotate acs relative default"\
    },\
    {\
      "commandString": "rotate acs absolute"\
    },\
    {\
      "commandString": "rotate acs absolute default"\
    },\
    {\
      "commandString": "rotate acs icon"\
    },\
    {\
      "commandString": "plot"\
    },\
    {\
      "commandString": "plot preview"\
    },\
    {\
      "commandString": "newfile"\
    },\
    {\
      "commandString": "ne"\
    },\
    {\
      "commandString": "place"\
    },\
    {\
      "commandString": "place fence"\
    },\
    {\
      "commandString": "place fence block"\
    },\
    {\
      "commandString": "place fence shape"\
    },\
    {\
      "commandString": "place fence circle"\
    },\
    {\
      "commandString": "place fence fromshape"\
    },\
    {\
      "commandString": "place fence icon"\
    },\
    {\
      "commandString": "place fence view"\
    },\
    {\
      "commandString": "place fence design"\
    },\
    {\
      "commandString": "place fence active"\
    },\
    {\
      "commandString": "place fence allfiles"\
    },\
    {\
      "commandString": "place fence universe"\
    },\
    {\
      "commandString": "place fence element"\
    },\
    {\
      "commandString": "place fence flood"\
    },\
    {\
      "commandString": "place lstring"\
    },\
    {\
      "commandString": "place lstring space"\
    },\
    {\
      "commandString": "place lstring stream"\
    },\
    {\
      "commandString": "place lstring stream auto"\
    },\
    {\
      "commandString": "place lstring point"\
    },\
    {\
      "commandString": "place circle"\
    },\
    {\
      "commandString": "place circle center"\
    },\
    {\
      "commandString": "place circle edge"\
    },\
    {\
      "commandString": "place circle radius"\
    },\
    {\
      "commandString": "place circle isometric"\
    },\
    {\
      "commandString": "place block"\
    },\
    {\
      "commandString": "place block orthogonal"\
    },\
    {\
      "commandString": "place block rotated"\
    },\
    {\
      "commandString": "place block isometric"\
    },\
    {\
      "commandString": "place block icon"\
    },\
    {\
      "commandString": "place curve"\
    },\
    {\
      "commandString": "place curve space"\
    },\
    {\
      "commandString": "place curve stream"\
    },\
    {\
      "commandString": "place curve point"\
    },\
    {\
      "commandString": "place curve picon"\
    },\
    {\
      "commandString": "place line"\
    },\
    {\
      "commandString": "place line angle"\
    },\
    {\
      "commandString": "place ellipse"\
    },\
    {\
      "commandString": "place ellipse center"\
    },\
    {\
      "commandString": "place ellipse edge"\
    },\
    {\
      "commandString": "place ellipse half"\
    },\
    {\
      "commandString": "place ellipse quarter"\
    },\
    {\
      "commandString": "place ellipse fourth"\
    },\
    {\
      "commandString": "place arc"\
    },\
    {\
      "commandString": "place arc center"\
    },\
    {\
      "commandString": "place arc edge"\
    },\
    {\
      "commandString": "place arc radius"\
    },\
    {\
      "commandString": "place arc tangent"\
    },\
    {\
      "commandString": "place shape"\
    },\
    {\
      "commandString": "place shape orthogonal"\
    },\
    {\
      "commandString": "place shape icon"\
    },\
    {\
      "commandString": "place cylinder"\
    },\
    {\
      "commandString": "place cylinder right"\
    },\
    {\
      "commandString": "place cylinder radius"\
    },\
    {\
      "commandString": "place cylinder capped"\
    },\
    {\
      "commandString": "place cylinder uncapped"\
    },\
    {\
      "commandString": "place cylinder skewed"\
    },\
    {\
      "commandString": "place cone"\
    },\
    {\
      "commandString": "place cone right"\
    },\
    {\
      "commandString": "place cone radius"\
    },\
    {\
      "commandString": "place cone skewed"\
    },\
    {\
      "commandString": "place cell"\
    },\
    {\
      "commandString": "place cell absolute"\
    },\
    {\
      "commandString": "place cell absolute tmatrx"\
    },\
    {\
      "commandString": "place cell relative"\
    },\
    {\
      "commandString": "place cell relative tmatrx"\
    },\
    {\
      "commandString": "place cell interactive"\
    },\
    {\
      "commandString": "place cell interactive absolute"\
    },\
    {\
      "commandString": "place cell interactive relative"\
    },\
    {\
      "commandString": "place cell icon"\
    },\
    {\
      "commandString": "place node"\
    },\
    {\
      "commandString": "place node view"\
    },\
    {\
      "commandString": "place node tmatrix"\
    },\
    {\
      "commandString": "place node icon"\
    },\
    {\
      "commandString": "place terminator"\
    },\
    {\
      "commandString": "place parabola"\
    },\
    {\
      "commandString": "place parabola nomodify"\
    },\
    {\
      "commandString": "place parabola modify"\
    },\
    {\
      "commandString": "place parabola horizontal"\
    },\
    {\
      "commandString": "place parabola horizontal nomodify"\
    },\
    {\
      "commandString": "place parabola horizontal modify"\
    },\
    {\
      "commandString": "place parabola icon"\
    },\
    {\
      "commandString": "place polygon"\
    },\
    {\
      "commandString": "place polygon inscribed"\
    },\
    {\
      "commandString": "place polygon circumscribed"\
    },\
    {\
      "commandString": "place polygon edge"\
    },\
    {\
      "commandString": "place polygon icon"\
    },\
    {\
      "commandString": "place legend"\
    },\
    {\
      "commandString": "place icon"\
    },\
    {\
      "commandString": "active"\
    },\
    {\
      "commandString": "active color"\
    },\
    {\
      "commandString": "active color white"\
    },\
    {\
      "commandString": "active color blue"\
    },\
    {\
      "commandString": "active color green"\
    },\
    {\
      "commandString": "active color red"\
    },\
    {\
      "commandString": "active color yellow"\
    },\
    {\
      "commandString": "active color violet"\
    },\
    {\
      "commandString": "active color orange"\
    },\
    {\
      "commandString": "active color cselect"\
    },\
    {\
      "commandString": "active color outline"\
    },\
    {\
      "commandString": "active color bylevel"\
    },\
    {\
      "commandString": "active color bycell"\
    },\
    {\
      "commandString": "active style"\
    },\
    {\
      "commandString": "active style cselect"\
    },\
    {\
      "commandString": "active style bylevel"\
    },\
    {\
      "commandString": "active style bycell"\
    },\
    {\
      "commandString": "active weight"\
    },\
    {\
      "commandString": "active weight cselect"\
    },\
    {\
      "commandString": "active weight bylevel"\
    },\
    {\
      "commandString": "active weight bycell"\
    },\
    {\
      "commandString": "active level"\
    },\
    {\
      "commandString": "active level filter"\
    },\
    {\
      "commandString": "active angle"\
    },\
    {\
      "commandString": "active angle pt2"\
    },\
    {\
      "commandString": "active angle pt3"\
    },\
    {\
      "commandString": "active font"\
    },\
    {\
      "commandString": "active origin"\
    },\
    {\
      "commandString": "active origin monument"\
    },\
    {\
      "commandString": "active origin center"\
    },\
    {\
      "commandString": "active gridunit"\
    },\
    {\
      "commandString": "active gridref"\
    },\
    {\
      "commandString": "active txsize"\
    },\
    {\
      "commandString": "active txheight"\
    },\
    {\
      "commandString": "active txheight pt2"\
    },\
    {\
      "commandString": "active txwidth"\
    },\
    {\
      "commandString": "active txwidth pt2"\
    },\
    {\
      "commandString": "active scale"\
    },\
    {\
      "commandString": "active scale distance"\
    },\
    {\
      "commandString": "active xscale"\
    },\
    {\
      "commandString": "active yscale"\
    },\
    {\
      "commandString": "active zscale"\
    },\
    {\
      "commandString": "active unitround"\
    },\
    {\
      "commandString": "active txj"\
    },\
    {\
      "commandString": "active txj lt"\
    },\
    {\
      "commandString": "active txj lc"\
    },\
    {\
      "commandString": "active txj lb"\
    },\
    {\
      "commandString": "active txj ct"\
    },\
    {\
      "commandString": "active txj cc"\
    },\
    {\
      "commandString": "active txj cb"\
    },\
    {\
      "commandString": "active txj rt"\
    },\
    {\
      "commandString": "active txj rc"\
    },\
    {\
      "commandString": "active txj rb"\
    },\
    {\
      "commandString": "active tnj"\
    },\
    {\
      "commandString": "active tnj lt"\
    },\
    {\
      "commandString": "active tnj lc"\
    },\
    {\
      "commandString": "active tnj lb"\
    },\
    {\
      "commandString": "active tnj lmt"\
    },\
    {\
      "commandString": "active tnj lmc"\
    },\
    {\
      "commandString": "active tnj lmb"\
    },\
    {\
      "commandString": "active tnj ct"\
    },\
    {\
      "commandString": "active tnj cc"\
    },\
    {\
      "commandString": "active tnj cb"\
    },\
    {\
      "commandString": "active tnj rmt"\
    },\
    {\
      "commandString": "active tnj rmc"\
    },\
    {\
      "commandString": "active tnj rmb"\
    },\
    {\
      "commandString": "active tnj rt"\
    },\
    {\
      "commandString": "active tnj rc"\
    },\
    {\
      "commandString": "active tnj rb"\
    },\
    {\
      "commandString": "active zdepth"\
    },\
    {\
      "commandString": "active zdepth absolute"\
    },\
    {\
      "commandString": "active zdepth relative"\
    },\
    {\
      "commandString": "active cell"\
    },\
    {\
      "commandString": "active line"\
    },\
    {\
      "commandString": "active line length"\
    },\
    {\
      "commandString": "active line space"\
    },\
    {\
      "commandString": "active terminator"\
    },\
    {\
      "commandString": "active tscale"\
    },\
    {\
      "commandString": "active node"\
    },\
    {\
      "commandString": "active tag"\
    },\
    {\
      "commandString": "active tab"\
    },\
    {\
      "commandString": "active stream"\
    },\
    {\
      "commandString": "active stream delta"\
    },\
    {\
      "commandString": "active stream tolerance"\
    },\
    {\
      "commandString": "active stream angle"\
    },\
    {\
      "commandString": "active stream area"\
    },\
    {\
      "commandString": "active point"\
    },\
    {\
      "commandString": "active keypnt"\
    },\
    {\
      "commandString": "active pattern"\
    },\
    {\
      "commandString": "active pattern delta"\
    },\
    {\
      "commandString": "active pattern angle"\
    },\
    {\
      "commandString": "active pattern scale"\
    },\
    {\
      "commandString": "active pattern cell"\
    },\
    {\
      "commandString": "active pattern match"\
    },\
    {\
      "commandString": "active pattern tolerance"\
    },\
    {\
      "commandString": "active area"\
    },\
    {\
      "commandString": "active area solid"\
    },\
    {\
      "commandString": "active area hole"\
    },\
    {\
      "commandString": "active area toggle"\
    },\
    {\
      "commandString": "active linkage"\
    },\
    {\
      "commandString": "active axis"\
    },\
    {\
      "commandString": "active class"\
    },\
    {\
      "commandString": "active class primary"\
    },\
    {\
      "commandString": "active class primary cselect"\
    },\
    {\
      "commandString": "active class construction"\
    },\
    {\
      "commandString": "active class construction cselect"\
    },\
    {\
      "commandString": "active linewidth"\
    },\
    {\
      "commandString": "active axorigin"\
    },\
    {\
      "commandString": "active review"\
    },\
    {\
      "commandString": "active rcell"\
    },\
    {\
      "commandString": "active database"\
    },\
    {\
      "commandString": "active report"\
    },\
    {\
      "commandString": "active text"\
    },\
    {\
      "commandString": "active capmode"\
    },\
    {\
      "commandString": "active capmode on"\
    },\
    {\
      "commandString": "active capmode off"\
    },\
    {\
      "commandString": "active capmode toggle"\
    },\
    {\
      "commandString": "active gridmode"\
    },\
    {\
      "commandString": "active gridmode orthogonal"\
    },\
    {\
      "commandString": "active gridmode offset"\
    },\
    {\
      "commandString": "active gridmode isometric"\
    },\
    {\
      "commandString": "active gridmode toggle"\
    },\
    {\
      "commandString": "active gridratio"\
    },\
    {\
      "commandString": "active datype"\
    },\
    {\
      "commandString": "active background"\
    },\
    {\
      "commandString": "active fill"\
    },\
    {\
      "commandString": "active fill on"\
    },\
    {\
      "commandString": "active fill off"\
    },\
    {\
      "commandString": "active fill toggle"\
    },\
    {\
      "commandString": "active entity"\
    },\
    {\
      "commandString": "active fillcolor"\
    },\
    {\
      "commandString": "active fillcolor white"\
    },\
    {\
      "commandString": "active fillcolor blue"\
    },\
    {\
      "commandString": "active fillcolor green"\
    },\
    {\
      "commandString": "active fillcolor red"\
    },\
    {\
      "commandString": "active fillcolor yellow"\
    },\
    {\
      "commandString": "active fillcolor violet"\
    },\
    {\
      "commandString": "active fillcolor orange"\
    },\
    {\
      "commandString": "active fillcolor cselect"\
    },\
    {\
      "commandString": "active fillcolor outline"\
    },\
    {\
      "commandString": "active fillcolor bylevel"\
    },\
    {\
      "commandString": "active fillcolor bycell"\
    },\
    {\
      "commandString": "active txslant"\
    },\
    {\
      "commandString": "active txcharspace"\
    },\
    {\
      "commandString": "active txunderline"\
    },\
    {\
      "commandString": "active txunderline on"\
    },\
    {\
      "commandString": "active txunderline off"\
    },\
    {\
      "commandString": "active txunderline toggle"\
    },\
    {\
      "commandString": "active txvertical"\
    },\
    {\
      "commandString": "active txvertical on"\
    },\
    {\
      "commandString": "active txvertical off"\
    },\
    {\
      "commandString": "active txvertical toggle"\
    },\
    {\
      "commandString": "active linestylescale"\
    },\
    {\
      "commandString": "active symbology"\
    },\
    {\
      "commandString": "active symbology bylevel"\
    },\
    {\
      "commandString": "active symbology bycell"\
    },\
    {\
      "commandString": "active gridorientation"\
    },\
    {\
      "commandString": "active gridorientation view"\
    },\
    {\
      "commandString": "active gridorientation top"\
    },\
    {\
      "commandString": "active gridorientation right"\
    },\
    {\
      "commandString": "active gridorientation front"\
    },\
    {\
      "commandString": "active gridorientation acs"\
    },\
    {\
      "commandString": "active gridangle"\
    },\
    {\
      "commandString": "active unitratio"\
    },\
    {\
      "commandString": "active priority"\
    },\
    {\
      "commandString": "active priority cselect"\
    },\
    {\
      "commandString": "active priormode"\
    },\
    {\
      "commandString": "active transparency"\
    },\
    {\
      "commandString": "active transparency cselect"\
    },\
    {\
      "commandString": "active mlinestylescale"\
    },\
    {\
      "commandString": "depth"\
    },\
    {\
      "commandString": "depth display"\
    },\
    {\
      "commandString": "depth display primitive"\
    },\
    {\
      "commandString": "depth display interactive"\
    },\
    {\
      "commandString": "depth active"\
    },\
    {\
      "commandString": "depth active primitive"\
    },\
    {\
      "commandString": "depth active interactive"\
    },\
    {\
      "commandString": "accusnap"\
    },\
    {\
      "commandString": "accusnap toggle"\
    },\
    {\
      "commandString": "accusnap suspend"\
    },\
    {\
      "commandString": "accusnap on"\
    },\
    {\
      "commandString": "accusnap off"\
    },\
    {\
      "commandString": "accusnap autolocate"\
    },\
    {\
      "commandString": "accusnap autolocate toggle"\
    },\
    {\
      "commandString": "accusnap autolocate on"\
    },\
    {\
      "commandString": "accusnap autolocate off"\
    },\
    {\
      "commandString": "accusnap resume"\
    },\
    {\
      "commandString": "accusnap enablefortool"\
    },\
    {\
      "commandString": "buttonaction"\
    },\
    {\
      "commandString": "buttonaction data"\
    },\
    {\
      "commandString": "buttonaction reset"\
    },\
    {\
      "commandString": "buttonaction tentative"\
    },\
    {\
      "commandString": "buttonaction 3ddata"\
    },\
    {\
      "commandString": "buttonaction 3dtentative"\
    },\
    {\
      "commandString": "save"\
    },\
    {\
      "commandString": "save function key"\
    },\
    {\
      "commandString": "save view"\
    },\
    {\
      "commandString": "save acs"\
    },\
    {\
      "commandString": "save image"\
    },\
    {\
      "commandString": "save design"\
    },\
    {\
      "commandString": "save design auto"\
    },\
    {\
      "commandString": "save design query"\
    },\
    {\
      "commandString": "save as"\
    },\
    {\
      "commandString": "save as dwg"\
    },\
    {\
      "commandString": "save as dxf"\
    },\
    {\
      "commandString": "save as v8"\
    },\
    {\
      "commandString": "save as v7"\
    },\
    {\
      "commandString": "copy"\
    },\
    {\
      "commandString": "copy view"\
    },\
    {\
      "commandString": "copy parallel"\
    },\
    {\
      "commandString": "copy parallel distance"\
    },\
    {\
      "commandString": "copy parallel keyin"\
    },\
    {\
      "commandString": "copy ed"\
    },\
    {\
      "commandString": "copy acs"\
    },\
    {\
      "commandString": "align"\
    },\
    {\
      "commandString": "point"\
    },\
    {\
      "commandString": "point absolute"\
    },\
    {\
      "commandString": "point distance"\
    },\
    {\
      "commandString": "point delta"\
    },\
    {\
      "commandString": "point vdelta"\
    },\
    {\
      "commandString": "point acsabsolute"\
    },\
    {\
      "commandString": "point acsdelta"\
    },\
    {\
      "commandString": "point default"\
    },\
    {\
      "commandString": "delete"\
    },\
    {\
      "commandString": "delete element"\
    },\
    {\
      "commandString": "delete view"\
    },\
    {\
      "commandString": "delete cell"\
    },\
    {\
      "commandString": "delete acs"\
    },\
    {\
      "commandString": "delete scdefs"\
    },\
    {\
      "commandString": "delete scdefs anonymous"\
    },\
    {\
      "commandString": "delete scdefs named"\
    },\
    {\
      "commandString": "delete scdefs all"\
    },\
    {\
      "commandString": "delete unused"\
    },\
    {\
      "commandString": "delete unused linestyles"\
    },\
    {\
      "commandString": "delete unused textstyles"\
    },\
    {\
      "commandString": "delete unused dimstyles"\
    },\
    {\
      "commandString": "delete unused fonts"\
    },\
    {\
      "commandString": "delete unused levels"\
    },\
    {\
      "commandString": "delete unused leveltables"\
    },\
    {\
      "commandString": "delete unused leveltables all"\
    },\
    {\
      "commandString": "delete unused leveltables primary"\
    },\
    {\
      "commandString": "delete unused leveltables nested"\
    },\
    {\
      "commandString": "delete unused mlinestyles"\
    },\
    {\
      "commandString": "delete unused elementtemplates"\
    },\
    {\
      "commandString": "lock"\
    },\
    {\
      "commandString": "lock snap"\
    },\
    {\
      "commandString": "lock snap on"\
    },\
    {\
      "commandString": "lock snap off"\
    },\
    {\
      "commandString": "lock snap project"\
    },\
    {\
      "commandString": "lock snap keypoint"\
    },\
    {\
      "commandString": "lock snap construction"\
    },\
    {\
      "commandString": "lock snap construction on"\
    },\
    {\
      "commandString": "lock snap construction off"\
    },\
    {\
      "commandString": "lock snap construction toggle"\
    },\
    {\
      "commandString": "lock snap acs"\
    },\
    {\
      "commandString": "lock snap acs on"\
    },\
    {\
      "commandString": "lock snap acs off"\
    },\
    {\
      "commandString": "lock snap acs toggle"\
    },\
    {\
      "commandString": "lock snap intersection"\
    },\
    {\
      "commandString": "lock snap nearest"\
    },\
    {\
      "commandString": "lock snap midpoint"\
    },\
    {\
      "commandString": "lock snap center"\
    },\
    {\
      "commandString": "lock snap origin"\
    },\
    {\
      "commandString": "lock snap bisector"\
    },\
    {\
      "commandString": "lock snap multisnap1"\
    },\
    {\
      "commandString": "lock snap multisnap2"\
    },\
    {\
      "commandString": "lock snap multisnap3"\
    },\
    {\
      "commandString": "lock snap perpendicular"\
    },\
    {\
      "commandString": "lock snap tangency"\
    },\
    {\
      "commandString": "lock snap pttangent"\
    },\
    {\
      "commandString": "lock snap ptperpendicular"\
    },\
    {\
      "commandString": "lock snap parallel"\
    },\
    {\
      "commandString": "lock snap ptthrough"\
    },\
    {\
      "commandString": "lock snap pointon"\
    },\
    {\
      "commandString": "lock grid"\
    },\
    {\
      "commandString": "lock grid on"\
    },\
    {\
      "commandString": "lock grid off"\
    },\
    {\
      "commandString": "lock grid toggle"\
    },\
    {\
      "commandString": "lock unit"\
    },\
    {\
      "commandString": "lock unit on"\
    },\
    {\
      "commandString": "lock unit off"\
    },\
    {\
      "commandString": "lock unit toggle"\
    },\
    {\
      "commandString": "lock angle"\
    },\
    {\
      "commandString": "lock angle on"\
    },\
    {\
      "commandString": "lock angle off"\
    },\
    {\
      "commandString": "lock angle toggle"\
    },\
    {\
      "commandString": "lock axis"\
    },\
    {\
      "commandString": "lock axis on"\
    },\
    {\
      "commandString": "lock axis off"\
    },\
    {\
      "commandString": "lock axis toggle"\
    },\
    {\
      "commandString": "lock scale"\
    },\
    {\
      "commandString": "lock scale on"\
    },\
    {\
      "commandString": "lock scale off"\
    },\
    {\
      "commandString": "lock scale toggle"\
    },\
    {\
      "commandString": "lock ggroup"\
    },\
    {\
      "commandString": "lock ggroup on"\
    },\
    {\
      "commandString": "lock ggroup off"\
    },\
    {\
      "commandString": "lock ggroup toggle"\
    },\
    {\
      "commandString": "lock level"\
    },\
    {\
      "commandString": "lock level on"\
    },\
    {\
      "commandString": "lock level off"\
    },\
    {\
      "commandString": "lock level toggle"\
    },\
    {\
      "commandString": "lock fence"\
    },\
    {\
      "commandString": "lock fence overlap"\
    },\
    {\
      "commandString": "lock fence inside"\
    },\
    {\
      "commandString": "lock fence clip"\
    },\
    {\
      "commandString": "lock fence void"\
    },\
    {\
      "commandString": "lock fence void overlap"\
    },\
    {\
      "commandString": "lock fence void outside"\
    },\
    {\
      "commandString": "lock fence void clip"\
    },\
    {\
      "commandString": "lock cellstretch"\
    },\
    {\
      "commandString": "lock cellstretch on"\
    },\
    {\
      "commandString": "lock cellstretch off"\
    },\
    {\
      "commandString": "lock cellstretch toggle"\
    },\
    {\
      "commandString": "lock acs"\
    },\
    {\
      "commandString": "lock acs on"\
    },\
    {\
      "commandString": "lock acs off"\
    },\
    {\
      "commandString": "lock acs toggle"\
    },\
    {\
      "commandString": "lock construction"\
    },\
    {\
      "commandString": "lock construction on"\
    },\
    {\
      "commandString": "lock construction off"\
    },\
    {\
      "commandString": "lock construction toggle"\
    },\
    {\
      "commandString": "lock isometric"\
    },\
    {\
      "commandString": "lock isometric on"\
    },\
    {\
      "commandString": "lock isometric off"\
    },\
    {\
      "commandString": "lock isometric toggle"\
    },\
    {\
      "commandString": "lock association"\
    },\
    {\
      "commandString": "lock association on"\
    },\
    {\
      "commandString": "lock association off"\
    },\
    {\
      "commandString": "lock association toggle"\
    },\
    {\
      "commandString": "lock depth"\
    },\
    {\
      "commandString": "lock depth on"\
    },\
    {\
      "commandString": "lock depth off"\
    },\
    {\
      "commandString": "lock depth toggle"\
    },\
    {\
      "commandString": "lock acsperpendicular"\
    },\
    {\
      "commandString": "lock acsperpendicular on"\
    },\
    {\
      "commandString": "lock acsperpendicular off"\
    },\
    {\
      "commandString": "lock acsperpendicular toggle"\
    },\
    {\
      "commandString": "lock useannotationscale"\
    },\
    {\
      "commandString": "lock useannotationscale on"\
    },\
    {\
      "commandString": "lock useannotationscale off"\
    },\
    {\
      "commandString": "lock useannotationscale toggle"\
    },\
    {\
      "commandString": "lock acscontext"\
    },\
    {\
      "commandString": "lock acscontext on"\
    },\
    {\
      "commandString": "lock acscontext off"\
    },\
    {\
      "commandString": "lock acscontext toggle"\
    },\
    {\
      "commandString": "lock templateassociation"\
    },\
    {\
      "commandString": "lock templateassociation on"\
    },\
    {\
      "commandString": "lock templateassociation off"\
    },\
    {\
      "commandString": "lock templateassociation toggle"\
    },\
    {\
      "commandString": "change"\
    },\
    {\
      "commandString": "change color"\
    },\
    {\
      "commandString": "change color element"\
    },\
    {\
      "commandString": "change color fill"\
    },\
    {\
      "commandString": "change color outline"\
    },\
    {\
      "commandString": "change style"\
    },\
    {\
      "commandString": "change weight"\
    },\
    {\
      "commandString": "change symbology"\
    },\
    {\
      "commandString": "change area"\
    },\
    {\
      "commandString": "change fill"\
    },\
    {\
      "commandString": "change level"\
    },\
    {\
      "commandString": "change class"\
    },\
    {\
      "commandString": "change lock"\
    },\
    {\
      "commandString": "change unlock"\
    },\
    {\
      "commandString": "change mline"\
    },\
    {\
      "commandString": "change transparency"\
    },\
    {\
      "commandString": "change priority"\
    },\
    {\
      "commandString": "change displaystyle"\
    },\
    {\
      "commandString": "construct"\
    },\
    {\
      "commandString": "construct bisector"\
    },\
    {\
      "commandString": "construct bisector angle"\
    },\
    {\
      "commandString": "construct bisector line"\
    },\
    {\
      "commandString": "construct line"\
    },\
    {\
      "commandString": "construct line aa"\
    },\
    {\
      "commandString": "construct line aa 1"\
    },\
    {\
      "commandString": "construct line aa 2"\
    },\
    {\
      "commandString": "construct line aa 2 default"\
    },\
    {\
      "commandString": "construct line aa 3"\
    },\
    {\
      "commandString": "construct line aa 4"\
    },\
    {\
      "commandString": "construct line aa 4 default"\
    },\
    {\
      "commandString": "construct line aa icon"\
    },\
    {\
      "commandString": "construct line minimum"\
    },\
    {\
      "commandString": "construct tangent"\
    },\
    {\
      "commandString": "construct tangent from"\
    },\
    {\
      "commandString": "construct tangent to"\
    },\
    {\
      "commandString": "construct tangent circle"\
    },\
    {\
      "commandString": "construct tangent circle 1"\
    },\
    {\
      "commandString": "construct tangent circle 3"\
    },\
    {\
      "commandString": "construct tangent between"\
    },\
    {\
      "commandString": "construct tangent perpendicular"\
    },\
    {\
      "commandString": "construct tangent arc"\
    },\
    {\
      "commandString": "construct tangent arc 1"\
    },\
    {\
      "commandString": "construct tangent arc 3"\
    },\
    {\
      "commandString": "construct perpendicular"\
    },\
    {\
      "commandString": "construct perpendicular from"\
    },\
    {\
      "commandString": "construct perpendicular to"\
    },\
    {\
      "commandString": "filedesign"\
    },\
    {\
      "commandString": "modify"\
    },\
    {\
      "commandString": "modify fence"\
    },\
    {\
      "commandString": "modify fence icon"\
    },\
    {\
      "commandString": "modify arc"\
    },\
    {\
      "commandString": "modify arc radius"\
    },\
    {\
      "commandString": "modify arc angle"\
    },\
    {\
      "commandString": "modify arc axis"\
    },\
    {\
      "commandString": "compress"\
    },\
    {\
      "commandString": "compress design"\
    },\
    {\
      "commandString": "compress design confirm"\
    },\
    {\
      "commandString": "compress design includerefs"\
    },\
    {\
      "commandString": "compress library"\
    },\
    {\
      "commandString": "fence"\
    },\
    {\
      "commandString": "fence delete"\
    },\
    {\
      "commandString": "fence change"\
    },\
    {\
      "commandString": "fence change color"\
    },\
    {\
      "commandString": "fence change style"\
    },\
    {\
      "commandString": "fence change weight"\
    },\
    {\
      "commandString": "fence change symbology"\
    },\
    {\
      "commandString": "fence change area"\
    },\
    {\
      "commandString": "fence change level"\
    },\
    {\
      "commandString": "fence change class"\
    },\
    {\
      "commandString": "fence change lock"\
    },\
    {\
      "commandString": "fence change unlock"\
    },\
    {\
      "commandString": "fence change transparency"\
    },\
    {\
      "commandString": "fence change priority"\
    },\
    {\
      "commandString": "fence report"\
    },\
    {\
      "commandString": "fence attach"\
    },\
    {\
      "commandString": "fence detach"\
    },\
    {\
      "commandString": "fence wset"\
    },\
    {\
      "commandString": "fence wset add"\
    },\
    {\
      "commandString": "fence wset copy"\
    },\
    {\
      "commandString": "fence file"\
    },\
    {\
      "commandString": "fence separate"\
    },\
    {\
      "commandString": "fence load"\
    },\
    {\
      "commandString": "fence surface"\
    },\
    {\
      "commandString": "fence surface projection"\
    },\
    {\
      "commandString": "fence surface revolution"\
    },\
    {\
      "commandString": "fence surface revolution default"\
    },\
    {\
      "commandString": "fence freeze"\
    },\
    {\
      "commandString": "fence thaw"\
    },\
    {\
      "commandString": "fence named"\
    },\
    {\
      "commandString": "fence named attach"\
    },\
    {\
      "commandString": "fence named save"\
    },\
    {\
      "commandString": "fence named delete"\
    },\
    {\
      "commandString": "fence copy"\
    },\
    {\
      "commandString": "fence copy tofile"\
    },\
    {\
      "commandString": "untitledfile"\
    },\
    {\
      "commandString": "pause"\
    },\
    {\
      "commandString": "selview"\
    },\
    {\
      "commandString": "fillet"\
    },\
    {\
      "commandString": "fillet single"\
    },\
    {\
      "commandString": "fillet modify"\
    },\
    {\
      "commandString": "fillet nomodify"\
    },\
    {\
      "commandString": "fillet icon"\
    },\
    {\
      "commandString": "noecho"\
    },\
    {\
      "commandString": "echo"\
    },\
    {\
      "commandString": "include"\
    },\
    {\
      "commandString": "edit"\
    },\
    {\
      "commandString": "edit ae"\
    },\
    {\
      "commandString": "reference"\
    },\
    {\
      "commandString": "reference rotate"\
    },\
    {\
      "commandString": "reference rotate angle"\
    },\
    {\
      "commandString": "reference rotate points"\
    },\
    {\
      "commandString": "reference scale"\
    },\
    {\
      "commandString": "reference scale factor"\
    },\
    {\
      "commandString": "reference scale absolute"\
    },\
    {\
      "commandString": "reference scale points"\
    },\
    {\
      "commandString": "reference move"\
    },\
    {\
      "commandString": "reference detach"\
    },\
    {\
      "commandString": "reference levels"\
    },\
    {\
      "commandString": "reference levels on"\
    },\
    {\
      "commandString": "reference levels off"\
    },\
    {\
      "commandString": "reference levels toggle"\
    },\
    {\
      "commandString": "reference snap"\
    },\
    {\
      "commandString": "reference snap on"\
    },\
    {\
      "commandString": "reference snap off"\
    },\
    {\
      "commandString": "reference snap toggle"\
    },\
    {\
      "commandString": "reference locate"\
    },\
    {\
      "commandString": "reference locate on"\
    },\
    {\
      "commandString": "reference locate off"\
    },\
    {\
      "commandString": "reference locate toggle"\
    },\
    {\
      "commandString": "reference display"\
    },\
    {\
      "commandString": "reference display on"\
    },\
    {\
      "commandString": "reference display off"\
    },\
    {\
      "commandString": "reference display toggle"\
    },\
    {\
      "commandString": "reference clip"\
    },\
    {\
      "commandString": "reference clip boundary"\
    },\
    {\
      "commandString": "reference clip front"\
    },\
    {\
      "commandString": "reference clip back"\
    },\
    {\
      "commandString": "reference clip mask"\
    },\
    {\
      "commandString": "reference clip rotate"\
    },\
    {\
      "commandString": "reference clip rotate on"\
    },\
    {\
      "commandString": "reference clip rotate off"\
    },\
    {\
      "commandString": "reference clip rotate toggle"\
    },\
    {\
      "commandString": "reference clip delete"\
    },\
    {\
      "commandString": "reference clip forcedelete"\
    },\
    {\
      "commandString": "reference clip restoredefault"\
    },\
    {\
      "commandString": "reference attach"\
    },\
    {\
      "commandString": "reference attach default"\
    },\
    {\
      "commandString": "reference mirror"\
    },\
    {\
      "commandString": "reference mirror horizontal"\
    },\
    {\
      "commandString": "reference mirror vertical"\
    },\
    {\
      "commandString": "reference reload"\
    },\
    {\
      "commandString": "reference reload force"\
    },\
    {\
      "commandString": "reference fit"\
    },\
    {\
      "commandString": "reference update"\
    },\
    {\
      "commandString": "reference copy"\
    },\
    {\
      "commandString": "reference copy folded"\
    },\
    {\
      "commandString": "reference copy folded horizontal"\
    },\
    {\
      "commandString": "reference copy folded vertical"\
    },\
    {\
      "commandString": "reference copy folded line"\
    },\
    {\
      "commandString": "reference presentation"\
    },\
    {\
      "commandString": "reference exchange"\
    },\
    {\
      "commandString": "reference synchronize"\
    },\
    {\
      "commandString": "reference synchronize levels"\
    },\
    {\
      "commandString": "reference synchronize levels custom"\
    },\
    {\
      "commandString": "reference synchronize levels all"\
    },\
    {\
      "commandString": "reference synchronize levels bylevelsymbology"\
    },\
    {\
      "commandString": "reference synchronize levels overridesymbology"\
    },\
    {\
      "commandString": "reference synchronize levels display"\
    },\
    {\
      "commandString": "reference adjustcolors"\
    },\
    {\
      "commandString": "reference adjustcolors dialog"\
    },\
    {\
      "commandString": "reference makedirect"\
    },\
    {\
      "commandString": "reference newsession"\
    },\
    {\
      "commandString": "reference filechanged"\
    },\
    {\
      "commandString": "reference set"\
    },\
    {\
      "commandString": "reference xchange"\
    },\
    {\
      "commandString": "reference activate"\
    },\
    {\
      "commandString": "reference activate dialog"\
    },\
    {\
      "commandString": "reference deactivate"\
    },\
    {\
      "commandString": "reference releasewritelock"\
    },\
    {\
      "commandString": "reference releasewritelock dialog"\
    },\
    {\
      "commandString": "reference centernamedview"\
    },\
    {\
      "commandString": "reference centernamedview coincident"\
    },\
    {\
      "commandString": "reference centernamedview bydrawingarea"\
    },\
    {\
      "commandString": "reference centerstandardview"\
    },\
    {\
      "commandString": "reference centerstandardview coincident"\
    },\
    {\
      "commandString": "reference centerstandardview bydrawingarea"\
    },\
    {\
      "commandString": "reference properties"\
    },\
    {\
      "commandString": "reference attachview"\
    },\
    {\
      "commandString": "reference updatefromsavedview"\
    },\
    {\
      "commandString": "reference pushtosavedview"\
    },\
    {\
      "commandString": "reference visibleedges"\
    },\
    {\
      "commandString": "reference visibleedges dynamic"\
    },\
    {\
      "commandString": "reference visibleedges cached"\
    },\
    {\
      "commandString": "reference visibleedges cached synchronize"\
    },\
    {\
      "commandString": "reference visibleedges cached hide"\
    },\
    {\
      "commandString": "reference visibleedges cached copyhide"\
    },\
    {\
      "commandString": "reference visibleedges cached copyhide all"\
    },\
    {\
      "commandString": "reference visibleedges cached unhide"\
    },\
    {\
      "commandString": "reference visibleedges cached unhide all"\
    },\
    {\
      "commandString": "reference visibleedges cached hiddentoggle"\
    },\
    {\
      "commandString": "reference visibleedges cached  autosynchronize"\
    },\
    {\
      "commandString": "reference visibleedges legacy"\
    },\
    {\
      "commandString": "reference visibleedges allmodels"\
    },\
    {\
      "commandString": "reference visibleedges allmodels dynamic"\
    },\
    {\
      "commandString": "reference visibleedges allmodels cached"\
    },\
    {\
      "commandString": "reference visibleedges allmodels synchronizecache"\
    },\
    {\
      "commandString": "reference visibleedges cvesynch"\
    },\
    {\
      "commandString": "reference visibleedges cvesynch manual"\
    },\
    {\
      "commandString": "reference visibleedges cvesynch alert"\
    },\
    {\
      "commandString": "reference visibleedges cvesynch automatic"\
    },\
    {\
      "commandString": "reference visibleedges cvesynch disconnected"\
    },\
    {\
      "commandString": "reference visibleedges allattachments"\
    },\
    {\
      "commandString": "reference visibleedges allattachments dynamic"\
    },\
    {\
      "commandString": "reference visibleedges allattachments cached"\
    },\
    {\
      "commandString": "reference visibleedges allattachments synchronizecache"\
    },\
    {\
      "commandString": "reference imodel"\
    },\
    {\
      "commandString": "reference imodel attach"\
    },\
    {\
      "commandString": "backup"\
    },\
    {\
      "commandString": "free"\
    },\
    {\
      "commandString": "justify"\
    },\
    {\
      "commandString": "justify left"\
    },\
    {\
      "commandString": "justify center"\
    },\
    {\
      "commandString": "justify right"\
    },\
    {\
      "commandString": "identify"\
    },\
    {\
      "commandString": "identify cell"\
    },\
    {\
      "commandString": "identify text"\
    },\
    {\
      "commandString": "select"\
    },\
    {\
      "commandString": "select cell"\
    },\
    {\
      "commandString": "select cell absolute"\
    },\
    {\
      "commandString": "select cell absolute tmatrx"\
    },\
    {\
      "commandString": "select cell relative"\
    },\
    {\
      "commandString": "select cell relative tmatrx"\
    },\
    {\
      "commandString": "select cell icon"\
    },\
    {\
      "commandString": "define"\
    },\
    {\
      "commandString": "define cell"\
    },\
    {\
      "commandString": "define cell origin"\
    },\
    {\
      "commandString": "define cell attributes"\
    },\
    {\
      "commandString": "define ae"\
    },\
    {\
      "commandString": "define search"\
    },\
    {\
      "commandString": "define acs"\
    },\
    {\
      "commandString": "define acs view"\
    },\
    {\
      "commandString": "define acs view rectangular"\
    },\
    {\
      "commandString": "define acs view cylindrical"\
    },\
    {\
      "commandString": "define acs view spherical"\
    },\
    {\
      "commandString": "define acs view default"\
    },\
    {\
      "commandString": "define acs element"\
    },\
    {\
      "commandString": "define acs element rectangular"\
    },\
    {\
      "commandString": "define acs element cylindrical"\
    },\
    {\
      "commandString": "define acs element spherical"\
    },\
    {\
      "commandString": "define acs element default"\
    },\
    {\
      "commandString": "define acs points"\
    },\
    {\
      "commandString": "define acs points rectangular"\
    },\
    {\
      "commandString": "define acs points cylindrical"\
    },\
    {\
      "commandString": "define acs points spherical"\
    },\
    {\
      "commandString": "define acs points default"\
    },\
    {\
      "commandString": "define acs reference"\
    },\
    {\
      "commandString": "define acs reference rectangular"\
    },\
    {\
      "commandString": "define acs reference cylindrical"\
    },\
    {\
      "commandString": "define acs reference spherical"\
    },\
    {\
      "commandString": "define acs reference default"\
    },\
    {\
      "commandString": "define north"\
    },\
    {\
      "commandString": "define lights"\
    },\
    {\
      "commandString": "define materials"\
    },\
    {\
      "commandString": "create"\
    },\
    {\
      "commandString": "create cell"\
    },\
    {\
      "commandString": "create chain"\
    },\
    {\
      "commandString": "create chain manual"\
    },\
    {\
      "commandString": "create chain automatic"\
    },\
    {\
      "commandString": "create chain icon"\
    },\
    {\
      "commandString": "create shape"\
    },\
    {\
      "commandString": "create shape manual"\
    },\
    {\
      "commandString": "create shape automatic"\
    },\
    {\
      "commandString": "create shape automatic default"\
    },\
    {\
      "commandString": "create shape icon"\
    },\
    {\
      "commandString": "create entity"\
    },\
    {\
      "commandString": "create library"\
    },\
    {\
      "commandString": "create drawing"\
    },\
    {\
      "commandString": "rename"\
    },\
    {\
      "commandString": "rename cell"\
    },\
    {\
      "commandString": "rename cell default"\
    },\
    {\
      "commandString": "matrix"\
    },\
    {\
      "commandString": "matrix cell"\
    },\
    {\
      "commandString": "matrix cell default"\
    },\
    {\
      "commandString": "dimension"\
    },\
    {\
      "commandString": "dimension placement"\
    },\
    {\
      "commandString": "dimension placement auto"\
    },\
    {\
      "commandString": "dimension placement manual"\
    },\
    {\
      "commandString": "dimension placement semiauto"\
    },\
    {\
      "commandString": "dimension witness"\
    },\
    {\
      "commandString": "dimension witness off"\
    },\
    {\
      "commandString": "dimension witness on"\
    },\
    {\
      "commandString": "dimension witness toggle"\
    },\
    {\
      "commandString": "dimension witness left"\
    },\
    {\
      "commandString": "dimension witness left on"\
    },\
    {\
      "commandString": "dimension witness left off"\
    },\
    {\
      "commandString": "dimension witness left toggle"\
    },\
    {\
      "commandString": "dimension witness right"\
    },\
    {\
      "commandString": "dimension witness right on"\
    },\
    {\
      "commandString": "dimension witness right off"\
    },\
    {\
      "commandString": "dimension witness right toggle"\
    },\
    {\
      "commandString": "dimension witness top"\
    },\
    {\
      "commandString": "dimension witness top on"\
    },\
    {\
      "commandString": "dimension witness top off"\
    },\
    {\
      "commandString": "dimension witness top toggle"\
    },\
    {\
      "commandString": "dimension witness bottom"\
    },\
    {\
      "commandString": "dimension witness bottom on"\
    },\
    {\
      "commandString": "dimension witness bottom off"\
    },\
    {\
      "commandString": "dimension witness bottom toggle"\
    },\
    {\
      "commandString": "dimension justification"\
    },\
    {\
      "commandString": "dimension justification left"\
    },\
    {\
      "commandString": "dimension justification center"\
    },\
    {\
      "commandString": "dimension justification right"\
    },\
    {\
      "commandString": "dimension terminator"\
    },\
    {\
      "commandString": "dimension terminator first"\
    },\
    {\
      "commandString": "dimension terminator first off"\
    },\
    {\
      "commandString": "dimension terminator first arrow"\
    },\
    {\
      "commandString": "dimension terminator first stroke"\
    },\
    {\
      "commandString": "dimension terminator first origin"\
    },\
    {\
      "commandString": "dimension terminator left"\
    },\
    {\
      "commandString": "dimension terminator left off"\
    },\
    {\
      "commandString": "dimension terminator left arrow"\
    },\
    {\
      "commandString": "dimension terminator left stroke"\
    },\
    {\
      "commandString": "dimension terminator left origin"\
    },\
    {\
      "commandString": "dimension terminator right"\
    },\
    {\
      "commandString": "dimension terminator right off"\
    },\
    {\
      "commandString": "dimension terminator right arrow"\
    },\
    {\
      "commandString": "dimension terminator right stroke"\
    },\
    {\
      "commandString": "dimension terminator right origin"\
    },\
    {\
      "commandString": "dimension axis"\
    },\
    {\
      "commandString": "dimension axis view"\
    },\
    {\
      "commandString": "dimension axis drawing"\
    },\
    {\
      "commandString": "dimension axis true"\
    },\
    {\
      "commandString": "dimension axis arbitrary"\
    },\
    {\
      "commandString": "dimension level"\
    },\
    {\
      "commandString": "dimension level active"\
    },\
    {\
      "commandString": "dimension tolerance"\
    },\
    {\
      "commandString": "dimension tolerance upper"\
    },\
    {\
      "commandString": "dimension tolerance lower"\
    },\
    {\
      "commandString": "dimension tolerance scale"\
    },\
    {\
      "commandString": "dimension scale"\
    },\
    {\
      "commandString": "dimension scale reset"\
    },\
    {\
      "commandString": "dimension units"\
    },\
    {\
      "commandString": "dimension units length"\
    },\
    {\
      "commandString": "dimension units degrees"\
    },\
    {\
      "commandString": "dimension file"\
    },\
    {\
      "commandString": "dimension file active"\
    },\
    {\
      "commandString": "dimension file reference"\
    },\
    {\
      "commandString": "dimension color"\
    },\
    {\
      "commandString": "dimension color white"\
    },\
    {\
      "commandString": "dimension color blue"\
    },\
    {\
      "commandString": "dimension color green"\
    },\
    {\
      "commandString": "dimension color red"\
    },\
    {\
      "commandString": "dimension color yellow"\
    },\
    {\
      "commandString": "dimension color violet"\
    },\
    {\
      "commandString": "dimension color orange"\
    },\
    {\
      "commandString": "dimension color cselect"\
    },\
    {\
      "commandString": "dimension color outline"\
    },\
    {\
      "commandString": "dimension color bylevel"\
    },\
    {\
      "commandString": "dimension color bycell"\
    },\
    {\
      "commandString": "dimension weight"\
    },\
    {\
      "commandString": "dimension weight active"\
    },\
    {\
      "commandString": "dimension weight bylevel"\
    },\
    {\
      "commandString": "dimension weight bycell"\
    },\
    {\
      "commandString": "dimension text"\
    },\
    {\
      "commandString": "dimension text color"\
    },\
    {\
      "commandString": "dimension text color white"\
    },\
    {\
      "commandString": "dimension text color blue"\
    },\
    {\
      "commandString": "dimension text color green"\
    },\
    {\
      "commandString": "dimension text color red"\
    },\
    {\
      "commandString": "dimension text color yellow"\
    },\
    {\
      "commandString": "dimension text color violet"\
    },\
    {\
      "commandString": "dimension text color orange"\
    },\
    {\
      "commandString": "dimension text color cselect"\
    },\
    {\
      "commandString": "dimension text color outline"\
    },\
    {\
      "commandString": "dimension text color bylevel"\
    },\
    {\
      "commandString": "dimension text color bycell"\
    },\
    {\
      "commandString": "dimension text weight"\
    },\
    {\
      "commandString": "dimension text weight active"\
    },\
    {\
      "commandString": "dimension text weight bylevel"\
    },\
    {\
      "commandString": "dimension text weight bycell"\
    },\
    {\
      "commandString": "dimension text box"\
    },\
    {\
      "commandString": "dimension text box on"\
    },\
    {\
      "commandString": "dimension text box off"\
    },\
    {\
      "commandString": "dimension text box toggle"\
    },\
    {\
      "commandString": "dimension text capsule"\
    },\
    {\
      "commandString": "dimension text capsule on"\
    },\
    {\
      "commandString": "dimension text capsule off"\
    },\
    {\
      "commandString": "dimension text capsule toggle"\
    },\
    {\
      "commandString": "dimension font"\
    },\
    {\
      "commandString": "dimension font active"\
    },\
    {\
      "commandString": "dimension center"\
    },\
    {\
      "commandString": "dimension center size"\
    },\
    {\
      "commandString": "dimension center off"\
    },\
    {\
      "commandString": "dimension center on"\
    },\
    {\
      "commandString": "dimension pre"\
    },\
    {\
      "commandString": "dimension pre off"\
    },\
    {\
      "commandString": "dimension pre diameter"\
    },\
    {\
      "commandString": "dimension pre radius"\
    },\
    {\
      "commandString": "dimension pre square"\
    },\
    {\
      "commandString": "dimension post"\
    },\
    {\
      "commandString": "dimension post off"\
    },\
    {\
      "commandString": "dimension post diameter"\
    },\
    {\
      "commandString": "dimension post radius"\
    },\
    {\
      "commandString": "dimension post square"\
    },\
    {\
      "commandString": "dimension stacked"\
    },\
    {\
      "commandString": "dimension stacked on"\
    },\
    {\
      "commandString": "dimension stacked off"\
    },\
    {\
      "commandString": "dimension stacked toggle"\
    },\
    {\
      "commandString": "dimension arclength"\
    },\
    {\
      "commandString": "dimension arclength on"\
    },\
    {\
      "commandString": "dimension arclength off"\
    },\
    {\
      "commandString": "dimension arclength toggle"\
    },\
    {\
      "commandString": "dimension vertical"\
    },\
    {\
      "commandString": "dimension vertical off"\
    },\
    {\
      "commandString": "dimension vertical mixed"\
    },\
    {\
      "commandString": "dimension vertical on"\
    },\
    {\
      "commandString": "dimension extension"\
    },\
    {\
      "commandString": "dimension extension off"\
    },\
    {\
      "commandString": "dimension extension on"\
    },\
    {\
      "commandString": "dimension extension toggle"\
    },\
    {\
      "commandString": "dimension extension left"\
    },\
    {\
      "commandString": "dimension extension left on"\
    },\
    {\
      "commandString": "dimension extension left off"\
    },\
    {\
      "commandString": "dimension extension left toggle"\
    },\
    {\
      "commandString": "dimension extension right"\
    },\
    {\
      "commandString": "dimension extension right on"\
    },\
    {\
      "commandString": "dimension extension right off"\
    },\
    {\
      "commandString": "dimension extension right toggle"\
    },\
    {\
      "commandString": "dimension extension top"\
    },\
    {\
      "commandString": "dimension extension top on"\
    },\
    {\
      "commandString": "dimension extension top off"\
    },\
    {\
      "commandString": "dimension extension top toggle"\
    },\
    {\
      "commandString": "dimension extension bottom"\
    },\
    {\
      "commandString": "dimension extension bottom on"\
    },\
    {\
      "commandString": "dimension extension bottom off"\
    },\
    {\
      "commandString": "dimension extension bottom toggle"\
    },\
    {\
      "commandString": "reset"\
    },\
    {\
      "commandString": "increment"\
    },\
    {\
      "commandString": "increment text"\
    },\
    {\
      "commandString": "increment ed"\
    },\
    {\
      "commandString": "group"\
    },\
    {\
      "commandString": "group add"\
    },\
    {\
      "commandString": "group add immediate"\
    },\
    {\
      "commandString": "group add nosettings"\
    },\
    {\
      "commandString": "group drop"\
    },\
    {\
      "commandString": "group drop nosettings"\
    },\
    {\
      "commandString": "group selection"\
    },\
    {\
      "commandString": "group holes"\
    },\
    {\
      "commandString": "group createquick"\
    },\
    {\
      "commandString": "group activatequick"\
    },\
    {\
      "commandString": "usercommand"\
    },\
    {\
      "commandString": "null"\
    },\
    {\
      "commandString": "locele"\
    },\
    {\
      "commandString": "digitizer"\
    },\
    {\
      "commandString": "digitizer partition"\
    },\
    {\
      "commandString": "digitizer setup"\
    },\
    {\
      "commandString": "digitizer download"\
    },\
    {\
      "commandString": "find"\
    },\
    {\
      "commandString": "review"\
    },\
    {\
      "commandString": "detach"\
    },\
    {\
      "commandString": "detach database"\
    },\
    {\
      "commandString": "detach library"\
    },\
    {\
      "commandString": "detach databaseicon"\
    },\
    {\
      "commandString": "ucc"\
    },\
    {\
      "commandString": "iupdate"\
    },\
    {\
      "commandString": "iupdate 1"\
    },\
    {\
      "commandString": "iupdate 2"\
    },\
    {\
      "commandString": "iupdate 3"\
    },\
    {\
      "commandString": "iupdate 4"\
    },\
    {\
      "commandString": "iupdate 5"\
    },\
    {\
      "commandString": "iupdate 6"\
    },\
    {\
      "commandString": "iupdate 7"\
    },\
    {\
      "commandString": "iupdate 8"\
    },\
    {\
      "commandString": "iupdate right"\
    },\
    {\
      "commandString": "iupdate left"\
    },\
    {\
      "commandString": "iupdate both"\
    },\
    {\
      "commandString": "iupdate all"\
    },\
    {\
      "commandString": "iupdate view"\
    },\
    {\
      "commandString": "iupdate grid"\
    },\
    {\
      "commandString": "iupdate file"\
    },\
    {\
      "commandString": "iupdate fence"\
    },\
    {\
      "commandString": "iupdate fence inside"\
    },\
    {\
      "commandString": "iupdate fence outside"\
    },\
    {\
      "commandString": "version"\
    },\
    {\
      "commandString": "wset"\
    },\
    {\
      "commandString": "wset add"\
    },\
    {\
      "commandString": "wset copy"\
    },\
    {\
      "commandString": "wset drop"\
    },\
    {\
      "commandString": "snap"\
    },\
    {\
      "commandString": "snap on"\
    },\
    {\
      "commandString": "snap off"\
    },\
    {\
      "commandString": "snap project"\
    },\
    {\
      "commandString": "snap keypoint"\
    },\
    {\
      "commandString": "snap construction"\
    },\
    {\
      "commandString": "snap construction on"\
    },\
    {\
      "commandString": "snap construction off"\
    },\
    {\
      "commandString": "snap construction toggle"\
    },\
    {\
      "commandString": "snap acs"\
    },\
    {\
      "commandString": "snap acs on"\
    },\
    {\
      "commandString": "snap acs off"\
    },\
    {\
      "commandString": "snap acs toggle"\
    },\
    {\
      "commandString": "snap intersection"\
    },\
    {\
      "commandString": "snap nearest"\
    },\
    {\
      "commandString": "snap midpoint"\
    },\
    {\
      "commandString": "snap center"\
    },\
    {\
      "commandString": "snap origin"\
    },\
    {\
      "commandString": "snap bisector"\
    },\
    {\
      "commandString": "snap multisnap1"\
    },\
    {\
      "commandString": "snap multisnap2"\
    },\
    {\
      "commandString": "snap multisnap3"\
    },\
    {\
      "commandString": "snap perpendicular"\
    },\
    {\
      "commandString": "snap tangency"\
    },\
    {\
      "commandString": "snap pttangent"\
    },\
    {\
      "commandString": "snap ptperpendicular"\
    },\
    {\
      "commandString": "snap parallel"\
    },\
    {\
      "commandString": "snap ptthrough"\
    },\
    {\
      "commandString": "snap pointon"\
    },\
    {\
      "commandString": "activesnap"\
    },\
    {\
      "commandString": "activesnap on"\
    },\
    {\
      "commandString": "activesnap off"\
    },\
    {\
      "commandString": "activesnap project"\
    },\
    {\
      "commandString": "activesnap keypoint"\
    },\
    {\
      "commandString": "activesnap construction"\
    },\
    {\
      "commandString": "activesnap construction on"\
    },\
    {\
      "commandString": "activesnap construction off"\
    },\
    {\
      "commandString": "activesnap construction toggle"\
    },\
    {\
      "commandString": "activesnap acs"\
    },\
    {\
      "commandString": "activesnap acs on"\
    },\
    {\
      "commandString": "activesnap acs off"\
    },\
    {\
      "commandString": "activesnap acs toggle"\
    },\
    {\
      "commandString": "activesnap intersection"\
    },\
    {\
      "commandString": "activesnap nearest"\
    },\
    {\
      "commandString": "activesnap midpoint"\
    },\
    {\
      "commandString": "activesnap center"\
    },\
    {\
      "commandString": "activesnap origin"\
    },\
    {\
      "commandString": "activesnap bisector"\
    },\
    {\
      "commandString": "activesnap multisnap1"\
    },\
    {\
      "commandString": "activesnap multisnap2"\
    },\
    {\
      "commandString": "activesnap multisnap3"\
    },\
    {\
      "commandString": "activesnap perpendicular"\
    },\
    {\
      "commandString": "activesnap tangency"\
    },\
    {\
      "commandString": "activesnap pttangent"\
    },\
    {\
      "commandString": "activesnap ptperpendicular"\
    },\
    {\
      "commandString": "activesnap parallel"\
    },\
    {\
      "commandString": "activesnap ptthrough"\
    },\
    {\
      "commandString": "activesnap pointon"\
    },\
    {\
      "commandString": "nocommand"\
    },\
    {\
      "commandString": "display"\
    },\
    {\
      "commandString": "display hilite"\
    },\
    {\
      "commandString": "display erase"\
    },\
    {\
      "commandString": "display set"\
    },\
    {\
      "commandString": "type"\
    },\
    {\
      "commandString": "undo"\
    },\
    {\
      "commandString": "undo all"\
    },\
    {\
      "commandString": "undo all noconfirm"\
    },\
    {\
      "commandString": "undo mark"\
    },\
    {\
      "commandString": "undo nowarn"\
    },\
    {\
      "commandString": "redo"\
    },\
    {\
      "commandString": "redo element"\
    },\
    {\
      "commandString": "mark"\
    },\
    {\
      "commandString": "chamfer"\
    },\
    {\
      "commandString": "submenu"\
    },\
    {\
      "commandString": "popmenu"\
    },\
    {\
      "commandString": "beep"\
    },\
    {\
      "commandString": "level"\
    },\
    {\
      "commandString": "level create"\
    },\
    {\
      "commandString": "level delete"\
    },\
    {\
      "commandString": "level library"\
    },\
    {\
      "commandString": "level library attach"\
    },\
    {\
      "commandString": "level library detach"\
    },\
    {\
      "commandString": "level library import"\
    },\
    {\
      "commandString": "level library export"\
    },\
    {\
      "commandString": "level library sync"\
    },\
    {\
      "commandString": "level table"\
    },\
    {\
      "commandString": "level table readonly"\
    },\
    {\
      "commandString": "level filter"\
    },\
    {\
      "commandString": "level filter create"\
    },\
    {\
      "commandString": "level filter delete"\
    },\
    {\
      "commandString": "level filter group"\
    },\
    {\
      "commandString": "level filter import"\
    },\
    {\
      "commandString": "level filter child"\
    },\
    {\
      "commandString": "level filter set"\
    },\
    {\
      "commandString": "level filter set name"\
    },\
    {\
      "commandString": "level filter set description"\
    },\
    {\
      "commandString": "level filter set color"\
    },\
    {\
      "commandString": "level filter set style"\
    },\
    {\
      "commandString": "level filter set weight"\
    },\
    {\
      "commandString": "level filter set material"\
    },\
    {\
      "commandString": "level filter set display"\
    },\
    {\
      "commandString": "level filter set freeze"\
    },\
    {\
      "commandString": "level filter set plot"\
    },\
    {\
      "commandString": "level filter set used"\
    },\
    {\
      "commandString": "level filter set priority"\
    },\
    {\
      "commandString": "level filter set transparency"\
    },\
    {\
      "commandString": "level set"\
    },\
    {\
      "commandString": "level set frozen"\
    },\
    {\
      "commandString": "level set frozen on"\
    },\
    {\
      "commandString": "level set frozen off"\
    },\
    {\
      "commandString": "level set frozen toggle"\
    },\
    {\
      "commandString": "level set display"\
    },\
    {\
      "commandString": "level set display on"\
    },\
    {\
      "commandString": "level set display off"\
    },\
    {\
      "commandString": "level set display toggle"\
    },\
    {\
      "commandString": "level set lock"\
    },\
    {\
      "commandString": "level set lock on"\
    },\
    {\
      "commandString": "level set lock off"\
    },\
    {\
      "commandString": "level set lock toggle"\
    },\
    {\
      "commandString": "level set plot"\
    },\
    {\
      "commandString": "level set plot on"\
    },\
    {\
      "commandString": "level set plot off"\
    },\
    {\
      "commandString": "level set plot toggle"\
    },\
    {\
      "commandString": "level set name"\
    },\
    {\
      "commandString": "level set number"\
    },\
    {\
      "commandString": "level set description"\
    },\
    {\
      "commandString": "level set bylevel"\
    },\
    {\
      "commandString": "level set bylevel color"\
    },\
    {\
      "commandString": "level set bylevel style"\
    },\
    {\
      "commandString": "level set bylevel weight"\
    },\
    {\
      "commandString": "level set bylevel material"\
    },\
    {\
      "commandString": "level set override"\
    },\
    {\
      "commandString": "level set override color"\
    },\
    {\
      "commandString": "level set override color on"\
    },\
    {\
      "commandString": "level set override color off"\
    },\
    {\
      "commandString": "level set override color toggle"\
    },\
    {\
      "commandString": "level set override style"\
    },\
    {\
      "commandString": "level set override style on"\
    },\
    {\
      "commandString": "level set override style off"\
    },\
    {\
      "commandString": "level set override style toggle"\
    },\
    {\
      "commandString": "level set override weight"\
    },\
    {\
      "commandString": "level set override weight on"\
    },\
    {\
      "commandString": "level set override weight off"\
    },\
    {\
      "commandString": "level set override weight toggle"\
    },\
    {\
      "commandString": "level set override material"\
    },\
    {\
      "commandString": "level set override material on"\
    },\
    {\
      "commandString": "level set override material off"\
    },\
    {\
      "commandString": "level set override material toggle"\
    },\
    {\
      "commandString": "level set priority"\
    },\
    {\
      "commandString": "level set transparency"\
    },\
    {\
      "commandString": "level set vpfrozen"\
    },\
    {\
      "commandString": "level set vpfrozen on"\
    },\
    {\
      "commandString": "level set vpfrozen off"\
    },\
    {\
      "commandString": "level set vpfrozen toggle"\
    },\
    {\
      "commandString": "level set autonumber"\
    },\
    {\
      "commandString": "level set autonumber on"\
    },\
    {\
      "commandString": "level set autonumber off"\
    },\
    {\
      "commandString": "level set autonumber toggle"\
    },\
    {\
      "commandString": "level set active"\
    },\
    {\
      "commandString": "level draw"\
    },\
    {\
      "commandString": "level usage"\
    },\
    {\
      "commandString": "level element"\
    },\
    {\
      "commandString": "level element move"\
    },\
    {\
      "commandString": "level element copy"\
    },\
    {\
      "commandString": "level element select"\
    },\
    {\
      "commandString": "level element delete"\
    },\
    {\
      "commandString": "level element bylevel"\
    },\
    {\
      "commandString": "level element bylevel set"\
    },\
    {\
      "commandString": "level element bylevel unset"\
    },\
    {\
      "commandString": "level purge"\
    },\
    {\
      "commandString": "level copy"\
    },\
    {\
      "commandString": "level renumber"\
    },\
    {\
      "commandString": "choose"\
    },\
    {\
      "commandString": "choose all"\
    },\
    {\
      "commandString": "choose none"\
    },\
    {\
      "commandString": "choose previous"\
    },\
    {\
      "commandString": "choose last"\
    },\
    {\
      "commandString": "choose group"\
    },\
    {\
      "commandString": "choose group set"\
    },\
    {\
      "commandString": "choose group set nochildgroups"\
    },\
    {\
      "commandString": "choose group set childgroups"\
    },\
    {\
      "commandString": "choose group add"\
    },\
    {\
      "commandString": "choose group add nochildgroups"\
    },\
    {\
      "commandString": "choose group add childgroups"\
    },\
    {\
      "commandString": "choose group remove"\
    },\
    {\
      "commandString": "choose group remove nochildgroups"\
    },\
    {\
      "commandString": "choose group remove childgroups"\
    },\
    {\
      "commandString": "print"\
    },\
    {\
      "commandString": "page"\
    },\
    {\
      "commandString": "page setup"\
    },\
    {\
      "commandString": "help"\
    },\
    {\
      "commandString": "help context"\
    },\
    {\
      "commandString": "ungroup"\
    },\
    {\
      "commandString": "load"\
    },\
    {\
      "commandString": "load da"\
    },\
    {\
      "commandString": "load daicon"\
    },\
    {\
      "commandString": "nonprivilegedtoolerr"\
    },\
    {\
      "commandString": "start"\
    },\
    {\
      "commandString": "readonlyerr"\
    },\
    {\
      "commandString": "dialog"\
    },\
    {\
      "commandString": "dialog locks"\
    },\
    {\
      "commandString": "dialog toolbox"\
    },\
    {\
      "commandString": "dialog toolbox fillet"\
    },\
    {\
      "commandString": "dialog toolbox arc"\
    },\
    {\
      "commandString": "dialog toolbox text"\
    },\
    {\
      "commandString": "dialog toolbox change"\
    },\
    {\
      "commandString": "dialog toolbox modify"\
    },\
    {\
      "commandString": "dialog toolbox drop"\
    },\
    {\
      "commandString": "dialog toolbox acs"\
    },\
    {\
      "commandString": "dialog toolbox database"\
    },\
    {\
      "commandString": "dialog toolbox reference"\
    },\
    {\
      "commandString": "dialog toolbox references"\
    },\
    {\
      "commandString": "dialog toolbox measure"\
    },\
    {\
      "commandString": "dialog toolbox cloud"\
    },\
    {\
      "commandString": "dialog toolbox fence"\
    },\
    {\
      "commandString": "dialog toolbox detailingsymbols"\
    },\
    {\
      "commandString": "dialog toolbox xyztxt"\
    },\
    {\
      "commandString": "dialog toolbox visualization"\
    },\
    {\
      "commandString": "dialog toolbox primary"\
    },\
    {\
      "commandString": "dialog toolbox line"\
    },\
    {\
      "commandString": "dialog toolbox linear"\
    },\
    {\
      "commandString": "dialog toolbox polygons"\
    },\
    {\
      "commandString": "dialog toolbox groups"\
    },\
    {\
      "commandString": "dialog toolbox manipulate"\
    },\
    {\
      "commandString": "dialog toolbox cells"\
    },\
    {\
      "commandString": "dialog toolbox selection"\
    },\
    {\
      "commandString": "dialog toolbox points"\
    },\
    {\
      "commandString": "dialog toolbox 2dviewing"\
    },\
    {\
      "commandString": "dialog toolbox 3dviewing"\
    },\
    {\
      "commandString": "dialog toolbox dimension"\
    },\
    {\
      "commandString": "dialog toolbox dimensions"\
    },\
    {\
      "commandString": "dialog toolbox isometric"\
    },\
    {\
      "commandString": "dialog toolbox tags"\
    },\
    {\
      "commandString": "dialog toolbox annotate"\
    },\
    {\
      "commandString": "dialog toolbox annotation"\
    },\
    {\
      "commandString": "dialog toolbox standard"\
    },\
    {\
      "commandString": "dialog toolbox redline"\
    },\
    {\
      "commandString": "dialog toolbox mainclassic"\
    },\
    {\
      "commandString": "dialog toolbox common"\
    },\
    {\
      "commandString": "dialog toolbox links"\
    },\
    {\
      "commandString": "dialog toolbox dimangular"\
    },\
    {\
      "commandString": "dialog toolbox attributes"\
    },\
    {\
      "commandString": "dialog toolbox viewcontrol"\
    },\
    {\
      "commandString": "dialog toolbox tasknavigation"\
    },\
    {\
      "commandString": "dialog toolbox viewrotate"\
    },\
    {\
      "commandString": "dialog toolbox viewdisplaymode"\
    },\
    {\
      "commandString": "dialog toolbox viewperspective"\
    },\
    {\
      "commandString": "dialog toolbox viewproperties"\
    },\
    {\
      "commandString": "dialog toolbox locks"\
    },\
    {\
      "commandString": "dialog toolbox clipvolume"\
    },\
    {\
      "commandString": "dialog toolbox viewgroups"\
    },\
    {\
      "commandString": "dialog toolbox history"\
    },\
    {\
      "commandString": "dialog toolbox digitalsignatures"\
    },\
    {\
      "commandString": "dialog toolbox maintask"\
    },\
    {\
      "commandString": "dialog toolbox animation"\
    },\
    {\
      "commandString": "dialog toolbox basegeometry"\
    },\
    {\
      "commandString": "dialog toolbox changetracking"\
    },\
    {\
      "commandString": "dialog toolbox configuration"\
    },\
    {\
      "commandString": "dialog toolbox coordinatesystems"\
    },\
    {\
      "commandString": "dialog toolbox customlinestyles"\
    },\
    {\
      "commandString": "dialog toolbox featuresolids"\
    },\
    {\
      "commandString": "dialog toolbox models"\
    },\
    {\
      "commandString": "dialog toolbox screenmenus"\
    },\
    {\
      "commandString": "dialog toolbox ole"\
    },\
    {\
      "commandString": "dialog toolbox viewwindow"\
    },\
    {\
      "commandString": "dialog toolbox projectnavigation"\
    },\
    {\
      "commandString": "dialog toolbox properties"\
    },\
    {\
      "commandString": "dialog toolbox raster"\
    },\
    {\
      "commandString": "dialog toolbox security"\
    },\
    {\
      "commandString": "dialog toolbox sheetcomposition"\
    },\
    {\
      "commandString": "dialog toolbox itemtypes"\
    },\
    {\
      "commandString": "dialog toolbox uicustomization"\
    },\
    {\
      "commandString": "dialog toolbox view"\
    },\
    {\
      "commandString": "dialog toolbox geographic"\
    },\
    {\
      "commandString": "dialog toolbox savedview"\
    },\
    {\
      "commandString": "dialog toolbox manipulateclassic"\
    },\
    {\
      "commandString": "dialog toolbox changeclassic"\
    },\
    {\
      "commandString": "dialog toolbox linearclassic"\
    },\
    {\
      "commandString": "dialog toolbox groupsclassic"\
    },\
    {\
      "commandString": "dialog toolbox modifyclassic"\
    },\
    {\
      "commandString": "dialog toolbox textclassic"\
    },\
    {\
      "commandString": "dialog toolbox clashdetection"\
    },\
    {\
      "commandString": "dialog toolbox pointcloud"\
    },\
    {\
      "commandString": "dialog toolbox terrainmodel"\
    },\
    {\
      "commandString": "dialog attributes"\
    },\
    {\
      "commandString": "dialog readout"\
    },\
    {\
      "commandString": "dialog command"\
    },\
    {\
      "commandString": "dialog focus"\
    },\
    {\
      "commandString": "dialog focus command"\
    },\
    {\
      "commandString": "dialog standardalert"\
    },\
    {\
      "commandString": "dialog accusnap"\
    },\
    {\
      "commandString": "dialog snapvertical"\
    },\
    {\
      "commandString": "dialog advisory"\
    },\
    {\
      "commandString": "dialog closetoolboxes"\
    },\
    {\
      "commandString": "dialog tasknavigation"\
    },\
    {\
      "commandString": "dialog database"\
    },\
    {\
      "commandString": "dialog viewrotation"\
    },\
    {\
      "commandString": "dialog cellmaintenance"\
    },\
    {\
      "commandString": "dialog cellmaintenance on"\
    },\
    {\
      "commandString": "dialog cellmaintenance off"\
    },\
    {\
      "commandString": "dialog cellmaintenance toggle"\
    },\
    {\
      "commandString": "dialog cellmaintenance popup"\
    },\
    {\
      "commandString": "dialog activeangle"\
    },\
    {\
      "commandString": "dialog plot"\
    },\
    {\
      "commandString": "dialog preview"\
    },\
    {\
      "commandString": "dialog aboutdigitalrights"\
    },\
    {\
      "commandString": "dialog viewsettings"\
    },\
    {\
      "commandString": "dialog viewsettings on"\
    },\
    {\
      "commandString": "dialog viewsettings off"\
    },\
    {\
      "commandString": "dialog viewsettings toggle"\
    },\
    {\
      "commandString": "dialog viewsettings popup"\
    },\
    {\
      "commandString": "dialog cmdbrowse"\
    },\
    {\
      "commandString": "dialog cmdbrowse on"\
    },\
    {\
      "commandString": "dialog cmdbrowse off"\
    },\
    {\
      "commandString": "dialog cmdbrowse toggle"\
    },\
    {\
      "commandString": "dialog cmdbrowse popup"\
    },\
    {\
      "commandString": "dialog activescale"\
    },\
    {\
      "commandString": "dialog color"\
    },\
    {\
      "commandString": "dialog grid"\
    },\
    {\
      "commandString": "dialog camera"\
    },\
    {\
      "commandString": "dialog aboutconfiguration"\
    },\
    {\
      "commandString": "dialog funckeys"\
    },\
    {\
      "commandString": "dialog mdl"\
    },\
    {\
      "commandString": "dialog openfile"\
    },\
    {\
      "commandString": "dialog digitizing"\
    },\
    {\
      "commandString": "dialog aboutworkmode"\
    },\
    {\
      "commandString": "dialog display"\
    },\
    {\
      "commandString": "dialog toolsettings"\
    },\
    {\
      "commandString": "dialog image"\
    },\
    {\
      "commandString": "dialog aboutustn"\
    },\
    {\
      "commandString": "dialog locktoggles"\
    },\
    {\
      "commandString": "dialog saveas"\
    },\
    {\
      "commandString": "dialog dialogmessages"\
    },\
    {\
      "commandString": "dialog buttonmap"\
    },\
    {\
      "commandString": "dialog buttonmap2"\
    },\
    {\
      "commandString": "dialog lstylesetup"\
    },\
    {\
      "commandString": "dialog lstyleedit"\
    },\
    {\
      "commandString": "dialog licensemore"\
    },\
    {\
      "commandString": "dialog morewindows"\
    },\
    {\
      "commandString": "dialog updatesequence"\
    },\
    {\
      "commandString": "dialog snaps"\
    },\
    {\
      "commandString": "dialog export"\
    },\
    {\
      "commandString": "dialog multisnap"\
    },\
    {\
      "commandString": "dialog cbook"\
    },\
    {\
      "commandString": "dialog select"\
    },\
    {\
      "commandString": "dialog select row"\
    },\
    {\
      "commandString": "dialog licensing"\
    },\
    {\
      "commandString": "dialog hline"\
    },\
    {\
      "commandString": "dialog saveimage"\
    },\
    {\
      "commandString": "dialog cvesettings"\
    },\
    {\
      "commandString": "dialog keyboardshortcuts"\
    },\
    {\
      "commandString": "dialog exportdgn"\
    },\
    {\
      "commandString": "dialog exportdwg"\
    },\
    {\
      "commandString": "dialog exportdxf"\
    },\
    {\
      "commandString": "dialog exportdgnlib"\
    },\
    {\
      "commandString": "dialog exportrdl"\
    },\
    {\
      "commandString": "dialog exportv7"\
    },\
    {\
      "commandString": "dialog exportv8"\
    },\
    {\
      "commandString": "mdl"\
    },\
    {\
      "commandString": "mdl load"\
    },\
    {\
      "commandString": "mdl unload"\
    },\
    {\
      "commandString": "mdl debug"\
    },\
    {\
      "commandString": "mdl command"\
    },\
    {\
      "commandString": "mdl heap"\
    },\
    {\
      "commandString": "mdl dlogload"\
    },\
    {\
      "commandString": "mdl silentload"\
    },\
    {\
      "commandString": "mdl keyin"\
    },\
    {\
      "commandString": "mdl silentunload"\
    },\
    {\
      "commandString": "mdl method"\
    },\
    {\
      "commandString": "clr"\
    },\
    {\
      "commandString": "clr load"\
    },\
    {\
      "commandString": "clr load app"\
    },\
    {\
      "commandString": "clr load configlist"\
    },\
    {\
      "commandString": "clr unload"\
    },\
    {\
      "commandString": "clr unload app"\
    },\
    {\
      "commandString": "clr unload domain"\
    },\
    {\
      "commandString": "clr dialog"\
    },\
    {\
      "commandString": "clr gc"\
    },\
    {\
      "commandString": "clr gc collect"\
    },\
    {\
      "commandString": "clr gc gettotalmemory"\
    },\
    {\
      "commandString": "cbook"\
    },\
    {\
      "commandString": "cbook new"\
    },\
    {\
      "commandString": "cbook save"\
    },\
    {\
      "commandString": "cbook saveas"\
    },\
    {\
      "commandString": "cbook delete"\
    },\
    {\
      "commandString": "cbook open"\
    },\
    {\
      "commandString": "cbook import"\
    },\
    {\
      "commandString": "cbook export"\
    },\
    {\
      "commandString": "cbook color"\
    },\
    {\
      "commandString": "cbook color new"\
    },\
    {\
      "commandString": "cbook color delete"\
    },\
    {\
      "commandString": "cbook color select"\
    },\
    {\
      "commandString": "cbook color modify"\
    },\
    {\
      "commandString": "cbook color rename"\
    },\
    {\
      "commandString": "cbook test"\
    },\
    {\
      "commandString": "forms"\
    },\
    {\
      "commandString": "forms on"\
    },\
    {\
      "commandString": "forms off"\
    },\
    {\
      "commandString": "forms display"\
    },\
    {\
      "commandString": "forms mode"\
    },\
    {\
      "commandString": "forms mode text"\
    },\
    {\
      "commandString": "forms mode dialog"\
    },\
    {\
      "commandString": "forms mode none"\
    },\
    {\
      "commandString": "freeze"\
    },\
    {\
      "commandString": "thaw"\
    },\
    {\
      "commandString": "dmsg"\
    },\
    {\
      "commandString": "dmsg closedialog"\
    },\
    {\
      "commandString": "dmsg cancel"\
    },\
    {\
      "commandString": "dmsg assert"\
    },\
    {\
      "commandString": "dmsg dialogdebug"\
    },\
    {\
      "commandString": "dmsg dialogdebug on"\
    },\
    {\
      "commandString": "dmsg dialogdebug off"\
    },\
    {\
      "commandString": "dmsg dialogdebug toggle"\
    },\
    {\
      "commandString": "dmsg itemdebug"\
    },\
    {\
      "commandString": "dmsg itemdebug on"\
    },\
    {\
      "commandString": "dmsg itemdebug off"\
    },\
    {\
      "commandString": "dmsg itemdebug toggle"\
    },\
    {\
      "commandString": "dmsg handlerdebug"\
    },\
    {\
      "commandString": "dmsg handlerdebug on"\
    },\
    {\
      "commandString": "dmsg handlerdebug off"\
    },\
    {\
      "commandString": "dmsg handlerdebug toggle"\
    },\
    {\
      "commandString": "dmsg handlerdebug before"\
    },\
    {\
      "commandString": "dmsg handlerdebug before on"\
    },\
    {\
      "commandString": "dmsg handlerdebug before off"\
    },\
    {\
      "commandString": "dmsg handlerdebug before toggle"\
    },\
    {\
      "commandString": "dmsg handlerdebug after"\
    },\
    {\
      "commandString": "dmsg handlerdebug after on"\
    },\
    {\
      "commandString": "dmsg handlerdebug after off"\
    },\
    {\
      "commandString": "dmsg handlerdebug after toggle"\
    },\
    {\
      "commandString": "dmsg verbosedebug"\
    },\
    {\
      "commandString": "dmsg verbosedebug on"\
    },\
    {\
      "commandString": "dmsg verbosedebug off"\
    },\
    {\
      "commandString": "dmsg verbosedebug toggle"\
    },\
    {\
      "commandString": "dmsg auxmsgdebug"\
    },\
    {\
      "commandString": "dmsg auxmsgdebug on"\
    },\
    {\
      "commandString": "dmsg auxmsgdebug off"\
    },\
    {\
      "commandString": "dmsg auxmsgdebug toggle"\
    },\
    {\
      "commandString": "dmsg cleardebug"\
    },\
    {\
      "commandString": "dmsg openmsgfile"\
    },\
    {\
      "commandString": "dmsg appendmsgfile"\
    },\
    {\
      "commandString": "dmsg closemsgfile"\
    },\
    {\
      "commandString": "dmsg cursor"\
    },\
    {\
      "commandString": "dmsg cursor blink"\
    },\
    {\
      "commandString": "dmsg cursor blink on"\
    },\
    {\
      "commandString": "dmsg cursor blink off"\
    },\
    {\
      "commandString": "dmsg cursor blink toggle"\
    },\
    {\
      "commandString": "dmsg cursor left"\
    },\
    {\
      "commandString": "dmsg cursor right"\
    },\
    {\
      "commandString": "dmsg cursor up"\
    },\
    {\
      "commandString": "dmsg cursor down"\
    },\
    {\
      "commandString": "dmsg cursor wordleft"\
    },\
    {\
      "commandString": "dmsg cursor wordright"\
    },\
    {\
      "commandString": "dmsg cursor linebegin"\
    },\
    {\
      "commandString": "dmsg cursor lineend"\
    },\
    {\
      "commandString": "dmsg cursor pageup"\
    },\
    {\
      "commandString": "dmsg cursor pagedown"\
    },\
    {\
      "commandString": "dmsg cursor databegin"\
    },\
    {\
      "commandString": "dmsg cursor dataend"\
    },\
    {\
      "commandString": "dmsg cursor nextfield"\
    },\
    {\
      "commandString": "dmsg cursor previousfield"\
    },\
    {\
      "commandString": "dmsg cursor deleteleft"\
    },\
    {\
      "commandString": "dmsg cursor deleteright"\
    },\
    {\
      "commandString": "dmsg cursor deleteleftword"\
    },\
    {\
      "commandString": "dmsg cursor deleterightword"\
    },\
    {\
      "commandString": "dmsg cursor deletedatabegin"\
    },\
    {\
      "commandString": "dmsg cursor deletedataend"\
    },\
    {\
      "commandString": "dmsg cursor selectall"\
    },\
    {\
      "commandString": "dmsg cursor localdirection"\
    },\
    {\
      "commandString": "dmsg cursor globaldirection"\
    },\
    {\
      "commandString": "dmsg cursor toggleinsertmode"\
    },\
    {\
      "commandString": "dmsg cursor nextwindow"\
    },\
    {\
      "commandString": "dmsg cursor previouswindow"\
    },\
    {\
      "commandString": "dmsg cursor deselectall"\
    },\
    {\
      "commandString": "dmsg cursor nextdocument"\
    },\
    {\
      "commandString": "dmsg cursor previousdocument"\
    },\
    {\
      "commandString": "dmsg cursor nextpane"\
    },\
    {\
      "commandString": "dmsg cursor previouspane"\
    },\
    {\
      "commandString": "dmsg cursor previousprioritywindow"\
    },\
    {\
      "commandString": "dmsg cursor focusup"\
    },\
    {\
      "commandString": "dmsg cursor focusdown"\
    },\
    {\
      "commandString": "dmsg clipboard"\
    },\
    {\
      "commandString": "dmsg clipboard cut"\
    },\
    {\
      "commandString": "dmsg clipboard copy"\
    },\
    {\
      "commandString": "dmsg clipboard paste"\
    },\
    {\
      "commandString": "dmsg clipboard undo"\
    },\
    {\
      "commandString": "dmsg clipboard redo"\
    },\
    {\
      "commandString": "dmsg clipboard clear"\
    },\
    {\
      "commandString": "dmsg clipboard delete"\
    },\
    {\
      "commandString": "dmsg clipboard inserttext"\
    },\
    {\
      "commandString": "dmsg action"\
    },\
    {\
      "commandString": "dmsg action okay"\
    },\
    {\
      "commandString": "dmsg action cancel"\
    },\
    {\
      "commandString": "dmsg action sysmenupull"\
    },\
    {\
      "commandString": "dmsg action sysmenurestore"\
    },\
    {\
      "commandString": "dmsg action sysmenumove"\
    },\
    {\
      "commandString": "dmsg action sysmenusize"\
    },\
    {\
      "commandString": "dmsg action sysmenuminimize"\
    },\
    {\
      "commandString": "dmsg action sysmenumaximize"\
    },\
    {\
      "commandString": "dmsg action sysmenulower"\
    },\
    {\
      "commandString": "dmsg action sysmenuclose"\
    },\
    {\
      "commandString": "dmsg action showaccelerators"\
    },\
    {\
      "commandString": "dmsg action select"\
    },\
    {\
      "commandString": "dmsg action addmode"\
    },\
    {\
      "commandString": "dmsg action addmode on"\
    },\
    {\
      "commandString": "dmsg action addmode off"\
    },\
    {\
      "commandString": "dmsg action addmode toggle"\
    },\
    {\
      "commandString": "dmsg action keyin"\
    },\
    {\
      "commandString": "dmsg action extendmode"\
    },\
    {\
      "commandString": "dmsg action extendmode on"\
    },\
    {\
      "commandString": "dmsg action extendmode off"\
    },\
    {\
      "commandString": "dmsg action extendmode toggle"\
    },\
    {\
      "commandString": "dmsg action menubar"\
    },\
    {\
      "commandString": "dmsg action menubar on"\
    },\
    {\
      "commandString": "dmsg action menubar off"\
    },\
    {\
      "commandString": "dmsg action menubar toggle"\
    },\
    {\
      "commandString": "dmsg action popup"\
    },\
    {\
      "commandString": "dmsg action popup on"\
    },\
    {\
      "commandString": "dmsg action popup off"\
    },\
    {\
      "commandString": "dmsg action popup toggle"\
    },\
    {\
      "commandString": "dmsg action sysmenusink"\
    },\
    {\
      "commandString": "dmsg action qpopup"\
    },\
    {\
      "commandString": "dmsg action qnextwindow"\
    },\
    {\
      "commandString": "dmsg action qprevwindow"\
    },\
    {\
      "commandString": "dmsg action docmenuclose"\
    },\
    {\
      "commandString": "dmsg action showmnemonics"\
    },\
    {\
      "commandString": "dmsg action funckey"\
    },\
    {\
      "commandString": "dmsg action sysmenuchngscrn"\
    },\
    {\
      "commandString": "dmsg showversions"\
    },\
    {\
      "commandString": "dmsg fileproperties"\
    },\
    {\
      "commandString": "dmsg createcolorbook"\
    },\
    {\
      "commandString": "dmsg navigation"\
    },\
    {\
      "commandString": "dmsg navigation dialog"\
    },\
    {\
      "commandString": "dmsg navigation dialog on"\
    },\
    {\
      "commandString": "dmsg navigation dialog off"\
    },\
    {\
      "commandString": "dmsg navigation dialog toggle"\
    },\
    {\
      "commandString": "dmsg navigation menubar"\
    },\
    {\
      "commandString": "dmsg navigation menubar on"\
    },\
    {\
      "commandString": "dmsg navigation menubar off"\
    },\
    {\
      "commandString": "dmsg navigation menubar toggle"\
    },\
    {\
      "commandString": "dmsg focusdialog"\
    },\
    {\
      "commandString": "dmsg focusdialog locks"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox fillet"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox arc"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox text"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox change"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox modify"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox drop"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox acs"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox database"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox reference"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox references"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox measure"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox cloud"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox fence"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox detailingsymbols"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox xyztxt"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox visualization"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox primary"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox line"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox linear"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox polygons"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox groups"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox manipulate"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox cells"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox selection"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox points"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox 2dviewing"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox 3dviewing"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox dimension"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox dimensions"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox isometric"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox tags"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox annotate"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox annotation"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox standard"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox redline"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox mainclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox common"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox links"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox dimangular"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox attributes"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewcontrol"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox tasknavigation"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewrotate"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewdisplaymode"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewperspective"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewproperties"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox locks"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox clipvolume"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewgroups"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox history"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox digitalsignatures"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox maintask"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox animation"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox basegeometry"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox changetracking"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox configuration"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox coordinatesystems"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox customlinestyles"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox featuresolids"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox models"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox screenmenus"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox ole"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox viewwindow"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox projectnavigation"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox properties"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox raster"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox security"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox sheetcomposition"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox itemtypes"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox uicustomization"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox view"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox geographic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox savedview"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox manipulateclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox changeclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox linearclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox groupsclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox modifyclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox textclassic"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox clashdetection"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox pointcloud"\
    },\
    {\
      "commandString": "dmsg focusdialog toolbox terrainmodel"\
    },\
    {\
      "commandString": "dmsg focusdialog attributes"\
    },\
    {\
      "commandString": "dmsg focusdialog readout"\
    },\
    {\
      "commandString": "dmsg focusdialog command"\
    },\
    {\
      "commandString": "dmsg focusdialog focus"\
    },\
    {\
      "commandString": "dmsg focusdialog focus command"\
    },\
    {\
      "commandString": "dmsg focusdialog standardalert"\
    },\
    {\
      "commandString": "dmsg focusdialog accusnap"\
    },\
    {\
      "commandString": "dmsg focusdialog snapvertical"\
    },\
    {\
      "commandString": "dmsg focusdialog advisory"\
    },\
    {\
      "commandString": "dmsg focusdialog closetoolboxes"\
    },\
    {\
      "commandString": "dmsg focusdialog tasknavigation"\
    },\
    {\
      "commandString": "dmsg focusdialog database"\
    },\
    {\
      "commandString": "dmsg focusdialog viewrotation"\
    },\
    {\
      "commandString": "dmsg focusdialog cellmaintenance"\
    },\
    {\
      "commandString": "dmsg focusdialog cellmaintenance on"\
    },\
    {\
      "commandString": "dmsg focusdialog cellmaintenance off"\
    },\
    {\
      "commandString": "dmsg focusdialog cellmaintenance toggle"\
    },\
    {\
      "commandString": "dmsg focusdialog cellmaintenance popup"\
    },\
    {\
      "commandString": "dmsg focusdialog activeangle"\
    },\
    {\
      "commandString": "dmsg focusdialog plot"\
    },\
    {\
      "commandString": "dmsg focusdialog preview"\
    },\
    {\
      "commandString": "dmsg focusdialog aboutdigitalrights"\
    },\
    {\
      "commandString": "dmsg focusdialog viewsettings"\
    },\
    {\
      "commandString": "dmsg focusdialog viewsettings on"\
    },\
    {\
      "commandString": "dmsg focusdialog viewsettings off"\
    },\
    {\
      "commandString": "dmsg focusdialog viewsettings toggle"\
    },\
    {\
      "commandString": "dmsg focusdialog viewsettings popup"\
    },\
    {\
      "commandString": "dmsg focusdialog cmdbrowse"\
    },\
    {\
      "commandString": "dmsg focusdialog cmdbrowse on"\
    },\
    {\
      "commandString": "dmsg focusdialog cmdbrowse off"\
    },\
    {\
      "commandString": "dmsg focusdialog cmdbrowse toggle"\
    },\
    {\
      "commandString": "dmsg focusdialog cmdbrowse popup"\
    },\
    {\
      "commandString": "dmsg focusdialog activescale"\
    },\
    {\
      "commandString": "dmsg focusdialog color"\
    },\
    {\
      "commandString": "dmsg focusdialog grid"\
    },\
    {\
      "commandString": "dmsg focusdialog camera"\
    },\
    {\
      "commandString": "dmsg focusdialog aboutconfiguration"\
    },\
    {\
      "commandString": "dmsg focusdialog funckeys"\
    },\
    {\
      "commandString": "dmsg focusdialog mdl"\
    },\
    {\
      "commandString": "dmsg focusdialog openfile"\
    },\
    {\
      "commandString": "dmsg focusdialog digitizing"\
    },\
    {\
      "commandString": "dmsg focusdialog aboutworkmode"\
    },\
    {\
      "commandString": "dmsg focusdialog display"\
    },\
    {\
      "commandString": "dmsg focusdialog toolsettings"\
    },\
    {\
      "commandString": "dmsg focusdialog image"\
    },\
    {\
      "commandString": "dmsg focusdialog aboutustn"\
    },\
    {\
      "commandString": "dmsg focusdialog locktoggles"\
    },\
    {\
      "commandString": "dmsg focusdialog saveas"\
    },\
    {\
      "commandString": "dmsg focusdialog dialogmessages"\
    },\
    {\
      "commandString": "dmsg focusdialog buttonmap"\
    },\
    {\
      "commandString": "dmsg focusdialog buttonmap2"\
    },\
    {\
      "commandString": "dmsg focusdialog lstylesetup"\
    },\
    {\
      "commandString": "dmsg focusdialog lstyleedit"\
    },\
    {\
      "commandString": "dmsg focusdialog licensemore"\
    },\
    {\
      "commandString": "dmsg focusdialog morewindows"\
    },\
    {\
      "commandString": "dmsg focusdialog updatesequence"\
    },\
    {\
      "commandString": "dmsg focusdialog snaps"\
    },\
    {\
      "commandString": "dmsg focusdialog export"\
    },\
    {\
      "commandString": "dmsg focusdialog multisnap"\
    },\
    {\
      "commandString": "dmsg focusdialog cbook"\
    },\
    {\
      "commandString": "dmsg focusdialog select"\
    },\
    {\
      "commandString": "dmsg focusdialog select row"\
    },\
    {\
      "commandString": "dmsg focusdialog licensing"\
    },\
    {\
      "commandString": "dmsg focusdialog hline"\
    },\
    {\
      "commandString": "dmsg focusdialog saveimage"\
    },\
    {\
      "commandString": "dmsg focusdialog cvesettings"\
    },\
    {\
      "commandString": "dmsg focusdialog keyboardshortcuts"\
    },\
    {\
      "commandString": "dmsg focusdialog exportdgn"\
    },\
    {\
      "commandString": "dmsg focusdialog exportdwg"\
    },\
    {\
      "commandString": "dmsg focusdialog exportdxf"\
    },\
    {\
      "commandString": "dmsg focusdialog exportdgnlib"\
    },\
    {\
      "commandString": "dmsg focusdialog exportrdl"\
    },\
    {\
      "commandString": "dmsg focusdialog exportv7"\
    },\
    {\
      "commandString": "dmsg focusdialog exportv8"\
    },\
    {\
      "commandString": "dmsg colorsquare"\
    },\
    {\
      "commandString": "dmsg focusitem"\
    },\
    {\
      "commandString": "dmsg closealldialogs"\
    },\
    {\
      "commandString": "dmsg closeallframes"\
    },\
    {\
      "commandString": "dmsg resetframes"\
    },\
    {\
      "commandString": "dmsg dump"\
    },\
    {\
      "commandString": "dmsg dump locks"\
    },\
    {\
      "commandString": "dmsg dump toolbox"\
    },\
    {\
      "commandString": "dmsg dump toolbox fillet"\
    },\
    {\
      "commandString": "dmsg dump toolbox arc"\
    },\
    {\
      "commandString": "dmsg dump toolbox text"\
    },\
    {\
      "commandString": "dmsg dump toolbox change"\
    },\
    {\
      "commandString": "dmsg dump toolbox modify"\
    },\
    {\
      "commandString": "dmsg dump toolbox drop"\
    },\
    {\
      "commandString": "dmsg dump toolbox acs"\
    },\
    {\
      "commandString": "dmsg dump toolbox database"\
    },\
    {\
      "commandString": "dmsg dump toolbox reference"\
    },\
    {\
      "commandString": "dmsg dump toolbox references"\
    },\
    {\
      "commandString": "dmsg dump toolbox measure"\
    },\
    {\
      "commandString": "dmsg dump toolbox cloud"\
    },\
    {\
      "commandString": "dmsg dump toolbox fence"\
    },\
    {\
      "commandString": "dmsg dump toolbox detailingsymbols"\
    },\
    {\
      "commandString": "dmsg dump toolbox xyztxt"\
    },\
    {\
      "commandString": "dmsg dump toolbox visualization"\
    },\
    {\
      "commandString": "dmsg dump toolbox primary"\
    },\
    {\
      "commandString": "dmsg dump toolbox line"\
    },\
    {\
      "commandString": "dmsg dump toolbox linear"\
    },\
    {\
      "commandString": "dmsg dump toolbox polygons"\
    },\
    {\
      "commandString": "dmsg dump toolbox groups"\
    },\
    {\
      "commandString": "dmsg dump toolbox manipulate"\
    },\
    {\
      "commandString": "dmsg dump toolbox cells"\
    },\
    {\
      "commandString": "dmsg dump toolbox selection"\
    },\
    {\
      "commandString": "dmsg dump toolbox points"\
    },\
    {\
      "commandString": "dmsg dump toolbox 2dviewing"\
    },\
    {\
      "commandString": "dmsg dump toolbox 3dviewing"\
    },\
    {\
      "commandString": "dmsg dump toolbox dimension"\
    },\
    {\
      "commandString": "dmsg dump toolbox dimensions"\
    },\
    {\
      "commandString": "dmsg dump toolbox isometric"\
    },\
    {\
      "commandString": "dmsg dump toolbox tags"\
    },\
    {\
      "commandString": "dmsg dump toolbox annotate"\
    },\
    {\
      "commandString": "dmsg dump toolbox annotation"\
    },\
    {\
      "commandString": "dmsg dump toolbox standard"\
    },\
    {\
      "commandString": "dmsg dump toolbox redline"\
    },\
    {\
      "commandString": "dmsg dump toolbox mainclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox common"\
    },\
    {\
      "commandString": "dmsg dump toolbox links"\
    },\
    {\
      "commandString": "dmsg dump toolbox dimangular"\
    },\
    {\
      "commandString": "dmsg dump toolbox attributes"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewcontrol"\
    },\
    {\
      "commandString": "dmsg dump toolbox tasknavigation"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewrotate"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewdisplaymode"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewperspective"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewproperties"\
    },\
    {\
      "commandString": "dmsg dump toolbox locks"\
    },\
    {\
      "commandString": "dmsg dump toolbox clipvolume"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewgroups"\
    },\
    {\
      "commandString": "dmsg dump toolbox history"\
    },\
    {\
      "commandString": "dmsg dump toolbox digitalsignatures"\
    },\
    {\
      "commandString": "dmsg dump toolbox maintask"\
    },\
    {\
      "commandString": "dmsg dump toolbox animation"\
    },\
    {\
      "commandString": "dmsg dump toolbox basegeometry"\
    },\
    {\
      "commandString": "dmsg dump toolbox changetracking"\
    },\
    {\
      "commandString": "dmsg dump toolbox configuration"\
    },\
    {\
      "commandString": "dmsg dump toolbox coordinatesystems"\
    },\
    {\
      "commandString": "dmsg dump toolbox customlinestyles"\
    },\
    {\
      "commandString": "dmsg dump toolbox featuresolids"\
    },\
    {\
      "commandString": "dmsg dump toolbox models"\
    },\
    {\
      "commandString": "dmsg dump toolbox screenmenus"\
    },\
    {\
      "commandString": "dmsg dump toolbox ole"\
    },\
    {\
      "commandString": "dmsg dump toolbox viewwindow"\
    },\
    {\
      "commandString": "dmsg dump toolbox projectnavigation"\
    },\
    {\
      "commandString": "dmsg dump toolbox properties"\
    },\
    {\
      "commandString": "dmsg dump toolbox raster"\
    },\
    {\
      "commandString": "dmsg dump toolbox security"\
    },\
    {\
      "commandString": "dmsg dump toolbox sheetcomposition"\
    },\
    {\
      "commandString": "dmsg dump toolbox itemtypes"\
    },\
    {\
      "commandString": "dmsg dump toolbox uicustomization"\
    },\
    {\
      "commandString": "dmsg dump toolbox view"\
    },\
    {\
      "commandString": "dmsg dump toolbox geographic"\
    },\
    {\
      "commandString": "dmsg dump toolbox savedview"\
    },\
    {\
      "commandString": "dmsg dump toolbox manipulateclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox changeclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox linearclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox groupsclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox modifyclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox textclassic"\
    },\
    {\
      "commandString": "dmsg dump toolbox clashdetection"\
    },\
    {\
      "commandString": "dmsg dump toolbox pointcloud"\
    },\
    {\
      "commandString": "dmsg dump toolbox terrainmodel"\
    },\
    {\
      "commandString": "dmsg dump attributes"\
    },\
    {\
      "commandString": "dmsg dump readout"\
    },\
    {\
      "commandString": "dmsg dump command"\
    },\
    {\
      "commandString": "dmsg dump focus"\
    },\
    {\
      "commandString": "dmsg dump focus command"\
    },\
    {\
      "commandString": "dmsg dump standardalert"\
    },\
    {\
      "commandString": "dmsg dump accusnap"\
    },\
    {\
      "commandString": "dmsg dump snapvertical"\
    },\
    {\
      "commandString": "dmsg dump advisory"\
    },\
    {\
      "commandString": "dmsg dump closetoolboxes"\
    },\
    {\
      "commandString": "dmsg dump tasknavigation"\
    },\
    {\
      "commandString": "dmsg dump database"\
    },\
    {\
      "commandString": "dmsg dump viewrotation"\
    },\
    {\
      "commandString": "dmsg dump cellmaintenance"\
    },\
    {\
      "commandString": "dmsg dump cellmaintenance on"\
    },\
    {\
      "commandString": "dmsg dump cellmaintenance off"\
    },\
    {\
      "commandString": "dmsg dump cellmaintenance toggle"\
    },\
    {\
      "commandString": "dmsg dump cellmaintenance popup"\
    },\
    {\
      "commandString": "dmsg dump activeangle"\
    },\
    {\
      "commandString": "dmsg dump plot"\
    },\
    {\
      "commandString": "dmsg dump preview"\
    },\
    {\
      "commandString": "dmsg dump aboutdigitalrights"\
    },\
    {\
      "commandString": "dmsg dump viewsettings"\
    },\
    {\
      "commandString": "dmsg dump viewsettings on"\
    },\
    {\
      "commandString": "dmsg dump viewsettings off"\
    },\
    {\
      "commandString": "dmsg dump viewsettings toggle"\
    },\
    {\
      "commandString": "dmsg dump viewsettings popup"\
    },\
    {\
      "commandString": "dmsg dump cmdbrowse"\
    },\
    {\
      "commandString": "dmsg dump cmdbrowse on"\
    },\
    {\
      "commandString": "dmsg dump cmdbrowse off"\
    },\
    {\
      "commandString": "dmsg dump cmdbrowse toggle"\
    },\
    {\
      "commandString": "dmsg dump cmdbrowse popup"\
    },\
    {\
      "commandString": "dmsg dump activescale"\
    },\
    {\
      "commandString": "dmsg dump color"\
    },\
    {\
      "commandString": "dmsg dump grid"\
    },\
    {\
      "commandString": "dmsg dump camera"\
    },\
    {\
      "commandString": "dmsg dump aboutconfiguration"\
    },\
    {\
      "commandString": "dmsg dump funckeys"\
    },\
    {\
      "commandString": "dmsg dump mdl"\
    },\
    {\
      "commandString": "dmsg dump openfile"\
    },\
    {\
      "commandString": "dmsg dump digitizing"\
    },\
    {\
      "commandString": "dmsg dump aboutworkmode"\
    },\
    {\
      "commandString": "dmsg dump display"\
    },\
    {\
      "commandString": "dmsg dump toolsettings"\
    },\
    {\
      "commandString": "dmsg dump image"\
    },\
    {\
      "commandString": "dmsg dump aboutustn"\
    },\
    {\
      "commandString": "dmsg dump locktoggles"\
    },\
    {\
      "commandString": "dmsg dump saveas"\
    },\
    {\
      "commandString": "dmsg dump dialogmessages"\
    },\
    {\
      "commandString": "dmsg dump buttonmap"\
    },\
    {\
      "commandString": "dmsg dump buttonmap2"\
    },\
    {\
      "commandString": "dmsg dump lstylesetup"\
    },\
    {\
      "commandString": "dmsg dump lstyleedit"\
    },\
    {\
      "commandString": "dmsg dump licensemore"\
    },\
    {\
      "commandString": "dmsg dump morewindows"\
    },\
    {\
      "commandString": "dmsg dump updatesequence"\
    },\
    {\
      "commandString": "dmsg dump snaps"\
    },\
    {\
      "commandString": "dmsg dump export"\
    },\
    {\
      "commandString": "dmsg dump multisnap"\
    },\
    {\
      "commandString": "dmsg dump cbook"\
    },\
    {\
      "commandString": "dmsg dump select"\
    },\
    {\
      "commandString": "dmsg dump select row"\
    },\
    {\
      "commandString": "dmsg dump licensing"\
    },\
    {\
      "commandString": "dmsg dump hline"\
    },\
    {\
      "commandString": "dmsg dump saveimage"\
    },\
    {\
      "commandString": "dmsg dump cvesettings"\
    },\
    {\
      "commandString": "dmsg dump keyboardshortcuts"\
    },\
    {\
      "commandString": "dmsg dump exportdgn"\
    },\
    {\
      "commandString": "dmsg dump exportdwg"\
    },\
    {\
      "commandString": "dmsg dump exportdxf"\
    },\
    {\
      "commandString": "dmsg dump exportdgnlib"\
    },\
    {\
      "commandString": "dmsg dump exportrdl"\
    },\
    {\
      "commandString": "dmsg dump exportv7"\
    },\
    {\
      "commandString": "dmsg dump exportv8"\
    },\
    {\
      "commandString": "dmsg sinkall"\
    },\
    {\
      "commandString": "dmsg sinkall on"\
    },\
    {\
      "commandString": "dmsg sinkall off"\
    },\
    {\
      "commandString": "dmsg sinkall toggle"\
    },\
    {\
      "commandString": "dmsg focusdebug"\
    },\
    {\
      "commandString": "dmsg closetoolboxes"\
    },\
    {\
      "commandString": "dmsg closetoolboxes docked"\
    },\
    {\
      "commandString": "dmsg closetoolboxes undocked"\
    },\
    {\
      "commandString": "dmsg closetoolboxes all"\
    },\
    {\
      "commandString": "dmsg iconborders"\
    },\
    {\
      "commandString": "dmsg iconborders on"\
    },\
    {\
      "commandString": "dmsg iconborders off"\
    },\
    {\
      "commandString": "dmsg iconborders toggle"\
    },\
    {\
      "commandString": "dmsg updatenonviewcontents"\
    },\
    {\
      "commandString": "dmsg reopenalldialogs"\
    },\
    {\
      "commandString": "dmsg dialogfont"\
    },\
    {\
      "commandString": "dmsg activatetoolbypath"\
    },\
    {\
      "commandString": "dmsg activatetoolbyhash"\
    },\
    {\
      "commandString": "dmsg tasknavigationtoggle"\
    },\
    {\
      "commandString": "dmsg allowtoolselection"\
    },\
    {\
      "commandString": "dmsg synchnamedtoggleicons"\
    },\
    {\
      "commandString": "dmsg updatedialog"\
    },\
    {\
      "commandString": "dmsg postprocessnamedtoolactivation"\
    },\
    {\
      "commandString": "dmsg suspendtaskrefreshes"\
    },\
    {\
      "commandString": "dmsg resumetaskrefreshes"\
    },\
    {\
      "commandString": "dmsg colorscheme"\
    },\
    {\
      "commandString": "dmsg activeview"\
    },\
    {\
      "commandString": "dmsg debugitemrects"\
    },\
    {\
      "commandString": "dmsg debugitemrects on"\
    },\
    {\
      "commandString": "dmsg debugitemrects off"\
    },\
    {\
      "commandString": "dmsg debugitemrects toggle"\
    },\
    {\
      "commandString": "dmsg debugitemoverlap"\
    },\
    {\
      "commandString": "dmsg debugitemoverlap on"\
    },\
    {\
      "commandString": "dmsg debugitemoverlap off"\
    },\
    {\
      "commandString": "dmsg debugitemoverlap toggle"\
    },\
    {\
      "commandString": "dmsg debugitemoverrun"\
    },\
    {\
      "commandString": "dmsg debugitemoverrun on"\
    },\
    {\
      "commandString": "dmsg debugitemoverrun off"\
    },\
    {\
      "commandString": "dmsg debugitemoverrun toggle"\
    },\
    {\
      "commandString": "dmsg messageboxes"\
    },\
    {\
      "commandString": "dmsg messageboxes standardalert"\
    },\
    {\
      "commandString": "dmsg messageboxes mediumalert"\
    },\
    {\
      "commandString": "dmsg messageboxes largealert"\
    },\
    {\
      "commandString": "dmsg messageboxes largeyesno"\
    },\
    {\
      "commandString": "dmsg messageboxes standardinfo"\
    },\
    {\
      "commandString": "dmsg messageboxes mediuminfo"\
    },\
    {\
      "commandString": "dmsg messageboxes largeinfo"\
    },\
    {\
      "commandString": "dmsg messageboxes standardync"\
    },\
    {\
      "commandString": "dmsg messageboxes mediumync"\
    },\
    {\
      "commandString": "dmsg messageboxes standardyanc"\
    },\
    {\
      "commandString": "dmsg messageboxes standardyanac"\
    },\
    {\
      "commandString": "dmsg messageboxes standardyan"\
    },\
    {\
      "commandString": "dmsg messageboxes standardyn"\
    },\
    {\
      "commandString": "dmsg messageboxes mediumyn"\
    },\
    {\
      "commandString": "dmsg messageboxes standardopt"\
    },\
    {\
      "commandString": "dmsg messageboxes standardoptokc"\
    },\
    {\
      "commandString": "dmsg messageboxes standardoptokcw"\
    },\
    {\
      "commandString": "dmsg messageboxes v7designfile"\
    },\
    {\
      "commandString": "dmsg messageboxes dwgaecfile"\
    },\
    {\
      "commandString": "dmsg messageboxes resetmenuoptions"\
    },\
    {\
      "commandString": "dmsg messageboxes balloontooltip"\
    },\
    {\
      "commandString": "dmsg messageboxes worksetconflict"\
    },\
    {\
      "commandString": "dmsg messageboxes unassociatedfile"\
    },\
    {\
      "commandString": "dmsg messageboxes invalidactiveworkset"\
    },\
    {\
      "commandString": "dmsg messageboxes worksetnotfound"\
    },\
    {\
      "commandString": "dmsg messageboxes attachsourcefiles"\
    },\
    {\
      "commandString": "dmsg messageboxes v7celllibconvert"\
    },\
    {\
      "commandString": "dmsg advisory"\
    },\
    {\
      "commandString": "dmsg advisory standard"\
    },\
    {\
      "commandString": "dmsg advisory academic"\
    },\
    {\
      "commandString": "dmsg password"\
    },\
    {\
      "commandString": "dmsg password standard"\
    },\
    {\
      "commandString": "dmsg modelchoose"\
    },\
    {\
      "commandString": "dmsg deletingusedstyles"\
    },\
    {\
      "commandString": "dmsg customscale"\
    },\
    {\
      "commandString": "dmsg customsheetsize"\
    },\
    {\
      "commandString": "dmsg createdrawing"\
    },\
    {\
      "commandString": "dmsg ribbon"\
    },\
    {\
      "commandString": "dmsg ribbon openbackstage"\
    },\
    {\
      "commandString": "dmsg ribbon setactivetab"\
    },\
    {\
      "commandString": "dmsg setuivisiblekey"\
    },\
    {\
      "commandString": "dmsg clearuivisiblekey"\
    },\
    {\
      "commandString": "dmsg setuienabledkey"\
    },\
    {\
      "commandString": "dmsg clearuienabledkey"\
    },\
    {\
      "commandString": "dmsg updateribbonsize"\
    },\
    {\
      "commandString": "dmsg setribbonsize"\
    },\
    {\
      "commandString": "dmsg setribbonsize standard"\
    },\
    {\
      "commandString": "dmsg setribbonsize medium"\
    },\
    {\
      "commandString": "dmsg setribbonsize touch"\
    },\
    {\
      "commandString": "dmsg dumpxcommands"\
    },\
    {\
      "commandString": "dmsg senduisyncmessage"\
    },\
    {\
      "commandString": "dmsg readdialogcensus"\
    },\
    {\
      "commandString": "close"\
    },\
    {\
      "commandString": "close element"\
    },\
    {\
      "commandString": "close design"\
    },\
    {\
      "commandString": "render"\
    },\
    {\
      "commandString": "render view"\
    },\
    {\
      "commandString": "render view hidden"\
    },\
    {\
      "commandString": "render view filled"\
    },\
    {\
      "commandString": "render view smooth"\
    },\
    {\
      "commandString": "render all"\
    },\
    {\
      "commandString": "render all hidden"\
    },\
    {\
      "commandString": "render all filled"\
    },\
    {\
      "commandString": "render all smooth"\
    },\
    {\
      "commandString": "render fence"\
    },\
    {\
      "commandString": "render fence hidden"\
    },\
    {\
      "commandString": "render fence filled"\
    },\
    {\
      "commandString": "render fence smooth"\
    },\
    {\
      "commandString": "render element"\
    },\
    {\
      "commandString": "render element hidden"\
    },\
    {\
      "commandString": "render element filled"\
    },\
    {\
      "commandString": "render element smooth"\
    },\
    {\
      "commandString": "render icon"\
    },\
    {\
      "commandString": "exchangefile"\
    },\
    {\
      "commandString": "resourcefile"\
    },\
    {\
      "commandString": "resourcefile open"\
    },\
    {\
      "commandString": "preview"\
    },\
    {\
      "commandString": "qvision"\
    },\
    {\
      "commandString": "qvision cleardag"\
    },\
    {\
      "commandString": "qvision status"\
    },\
    {\
      "commandString": "displayset"\
    },\
    {\
      "commandString": "displayset set"\
    },\
    {\
      "commandString": "displayset set selection"\
    },\
    {\
      "commandString": "displayset set group"\
    },\
    {\
      "commandString": "displayset set group nochildgroups"\
    },\
    {\
      "commandString": "displayset set group childgroups"\
    },\
    {\
      "commandString": "displayset add"\
    },\
    {\
      "commandString": "displayset add selection"\
    },\
    {\
      "commandString": "displayset add group"\
    },\
    {\
      "commandString": "displayset add group nochildgroups"\
    },\
    {\
      "commandString": "displayset add group childgroups"\
    },\
    {\
      "commandString": "displayset remove"\
    },\
    {\
      "commandString": "displayset remove selection"\
    },\
    {\
      "commandString": "displayset remove group"\
    },\
    {\
      "commandString": "displayset remove group nochildgroups"\
    },\
    {\
      "commandString": "displayset remove group childgroups"\
    },\
    {\
      "commandString": "displayset clear"\
    },\
    {\
      "commandString": "order"\
    },\
    {\
      "commandString": "order element"\
    },\
    {\
      "commandString": "order element front"\
    },\
    {\
      "commandString": "mlinestyle"\
    },\
    {\
      "commandString": "mlinestyle active"\
    },\
    {\
      "commandString": "multisnap"\
    },\
    {\
      "commandString": "multisnap 1"\
    },\
    {\
      "commandString": "multisnap 2"\
    },\
    {\
      "commandString": "multisnap 3"\
    },\
    {\
      "commandString": "multisnap guimvup"\
    },\
    {\
      "commandString": "multisnap guimvdn"\
    },\
    {\
      "commandString": "multisnap guiselall"\
    },\
    {\
      "commandString": "multisnap guiselnone"\
    },\
    {\
      "commandString": "multisnap guiresdef"\
    },\
    {\
      "commandString": "note"\
    },\
    {\
      "commandString": "note upgrade"\
    },\
    {\
      "commandString": "newsession"\
    },\
    {\
      "commandString": "export"\
    },\
    {\
      "commandString": "export dwg"\
    },\
    {\
      "commandString": "export dxf"\
    },\
    {\
      "commandString": "export v8"\
    },\
    {\
      "commandString": "export v7"\
    },\
    {\
      "commandString": "dgnaudit"\
    },\
    {\
      "commandString": "dgnaudit run"\
    },\
    {\
      "commandString": "dgnaudit logfile"\
    },\
    {\
      "commandString": "dgnaudit logfile set"\
    },\
    {\
      "commandString": "dgnaudit logfile clear"\
    },\
    {\
      "commandString": "dgnaudit tablecounts"\
    },\
    {\
      "commandString": "dgnaudit internalids"\
    },\
    {\
      "commandString": "dgnaudit graphicgroup"\
    },\
    {\
      "commandString": "dgnaudit textnode"\
    },\
    {\
      "commandString": "dgnaudit modelrefs"\
    },\
    {\
      "commandString": "sectionclip"\
    },\
    {\
      "commandString": "sectionclip createstep"\
    },\
    {\
      "commandString": "sectionclip toggleclip"\
    },\
    {\
      "commandString": "sectionclip flipdirection"\
    },\
    {\
      "commandString": "sectionclip clipallsides"\
    },\
    {\
      "commandString": "sectionclip unclipallsides"\
    },\
    {\
      "commandString": "sectionclip apply"\
    },\
    {\
      "commandString": "sectionclip fitview"\
    },\
    {\
      "commandString": "sectionclip createdynamicview"\
    },\
    {\
      "commandString": "sectionclip namedboundaryfitview"\
    },\
    {\
      "commandString": "consolidate"\
    },\
    {\
      "commandString": "inputmanager"\
    },\
    {\
      "commandString": "inputmanager menu"\
    },\
    {\
      "commandString": "inputmanager runtool"\
    },\
    {\
      "commandString": "inputmanager transparency"\
    },\
    {\
      "commandString": "inputmanager home"\
    },\
    {\
      "commandString": "inputmanager training"\
    },\
    {\
      "commandString": "inputmanager training off"\
    },\
    {\
      "commandString": "inputmanager training on"\
    },\
    {\
      "commandString": "inputmanager training refresh"\
    },\
    {\
      "commandString": "inputmanager training hint"\
    },\
    {\
      "commandString": "inputmanager popupitem"\
    },\
    {\
      "commandString": "inputmanager popuprawitem"\
    },\
    {\
      "commandString": "inputmanager currenttask"\
    },\
    {\
      "commandString": "inputmanager cmdbrowse"\
    },\
    {\
      "commandString": "task"\
    },\
    {\
      "commandString": "task menu"\
    },\
    {\
      "commandString": "task active"\
    },\
    {\
      "commandString": "task init"\
    },\
    {\
      "commandString": "task reload"\
    },\
    {\
      "commandString": "task back"\
    },\
    {\
      "commandString": "task forward"\
    },\
    {\
      "commandString": "task sendtaskchangedasync"\
    },\
    {\
      "commandString": "task reloadmain"\
    },\
    {\
      "commandString": " xgraphics"\
    },\
    {\
      "commandString": " xgraphics dump"\
    },\
    {\
      "commandString": " xgraphics symboldump"\
    },\
    {\
      "commandString": " xgraphics iddump"\
    },\
    {\
      "commandString": " xgraphics compress"\
    },\
    {\
      "commandString": " xgraphics statistics"\
    },\
    {\
      "commandString": " xgraphics quick"\
    },\
    {\
      "commandString": " xgraphics quick add"\
    },\
    {\
      "commandString": " xgraphics quick delete"\
    },\
    {\
      "commandString": " xgraphics quick force"\
    },\
    {\
      "commandString": " xgraphics quick unforce"\
    },\
    {\
      "commandString": " xgraphics quick statistics"\
    },\
    {\
      "commandString": " xgraphics quick unstatistics"\
    },\
    {\
      "commandString": " xgraphics quick dump"\
    },\
    {\
      "commandString": " xgraphics synch"\
    },\
    {\
      "commandString": " xgraphics unify"\
    },\
    {\
      "commandString": " xgraphics debugbody"\
    },\
    {\
      "commandString": "ribbon"\
    },\
    {\
      "commandString": "ribbon activatekeytips"\
    },\
    {\
      "commandString": "keyboardshortcuts"\
    },\
    {\
      "commandString": "keyboardshortcuts displaymenu"\
    },\
    {\
      "commandString": "keyboardshortcuts new"\
    },\
    {\
      "commandString": "keyboardshortcuts newchild"\
    },\
    {\
      "commandString": "keyboardshortcuts delete"\
    },\
    {\
      "commandString": "keyboardshortcuts editchar"\
    },\
    {\
      "commandString": "keyboardshortcuts editlabel"\
    },\
    {\
      "commandString": "keyboardshortcuts editkeyin"\
    },\
    {\
      "commandString": "keyboardshortcuts up"\
    },\
    {\
      "commandString": "keyboardshortcuts down"\
    },\
    {\
      "commandString": "keyboardshortcuts close"\
    },\
    {\
      "commandString": "keyboardshortcuts apply"\
    },\
    {\
      "commandString": "calculator"\
    },\
    {\
      "commandString": "calculator format"\
    },\
    {\
      "commandString": "calculator format int"\
    },\
    {\
      "commandString": "calculator format double"\
    },\
    {\
      "commandString": "calculator declare"\
    },\
    {\
      "commandString": "calculator declare int"\
    },\
    {\
      "commandString": "calculator declare double"\
    },\
    {\
      "commandString": "calculator show"\
    },\
    {\
      "commandString": "calculator show variables"\
    },\
    {\
      "commandString": "calculator show functions"\
    },\
    {\
      "commandString": "uccalc"\
    },\
    {\
      "commandString": "preprocessor"\
    },\
    {\
      "commandString": "preprocessor format"\
    },\
    {\
      "commandString": "preprocessor format int"\
    },\
    {\
      "commandString": "preprocessor format double"\
    },\
    {\
      "commandString": "preprocessor toggle"\
    },\
    {\
      "commandString": "preprocessor on"\
    },\
    {\
      "commandString": "preprocessor off"\
    },\
    {\
      "commandString": "preprocessor start"\
    },\
    {\
      "commandString": "preprocessor end"\
    },\
    {\
      "commandString": "preprocessor status"\
    },\
    {\
      "commandString": "file"\
    },\
    {\
      "commandString": "file associateworkset"\
    },\
    {\
      "commandString": "file disassociateworkset"\
    },\
    {\
      "commandString": "runxcommand"\
    },\
    {\
      "commandString": "v8workspace"\
    },\
    {\
      "commandString": "v8workspace convert"\
    },\
    {\
      "commandString": "backgroundmap"\
    },\
    {\
      "commandString": "backgroundmap cachedelete"\
    },\
    {\
      "commandString": "backgroundmap showproviders"\
    },\
    {\
      "commandString": "backgroundmap statistics"\
    },\
    {\
      "commandString": "backgroundmap resetstatistics"\
    },\
    {\
      "commandString": "backgroundmap showtermsofuse"\
    },\
    {\
      "commandString": "exit"\
    },\
    {\
      "commandString": "exit query"\
    },\
    {\
      "commandString": "exit nouc"\
    },\
    {\
      "commandString": "quit"\
    },\
    {\
      "commandString": "quit query"\
    },\
    {\
      "commandString": "quit nouc"\
    },\
    {\
      "commandString": "ex"\
    },\
    {\
      "commandString": "qu"\
    }\
  ]';
