/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FieldDefinitions, FieldValues, Form } from "../../ui-core";
import TestUtils, { handleError, selectChangeValueByText, stubScrollIntoView } from "../TestUtils";

describe("<Form />", () => {

  before(async () => {
    await TestUtils.initializeUiCore();
  });

  after(() => {
    TestUtils.terminateUiCore();
  });

  afterEach(cleanup);

  stubScrollIntoView();

  /* eslint-disable @typescript-eslint/naming-convention */

  const fields: FieldDefinitions = {
    SiteUrl: {
      label: "site",
      editor: "textbox",
      value: "",
    },
    Name: {
      label: "name",
      editor: "textbox",
      value: "John Smith",
    },
    Notes: {
      label: "notes",
      editor: "multilinetextbox",
      value: "",
    },
    Lock: {
      label: "lock",
      editor: "checkbox",  // value for "checkbox" should be a boolean
      value: true,
    },
    PickList: {
      label: "pickList",
      editor: "dropdown",
      value: "one",
      options: ["one", "two", "three", "four"],
    },
    PickList2: {
      label: "pickList2",
      editor: "dropdown",
      value: 1,
      options: {
        1: "apple", 2: "pear", 3: "orange", 4: "grape",
      },
    },
  };

  it("render with default button label with submit error", async () => {
    const fakeTimers = sinon.useFakeTimers();
    const form = render(<Form handleFormSubmit={async (_values: FieldValues) => { throw new Error("bad news"); }} fields={fields} />);
    expect(form).not.to.be.null;
    const button = form.container.querySelector("button") as HTMLButtonElement;
    expect(button).not.to.be.null;
    const span = button.querySelector("span");
    expect(span).not.to.be.null;
    expect(span!.innerHTML).to.be.eq("form.submitButtonLabel");
    expect(form.container.querySelector("div.core-form-alert")).to.be.null;
    // fire click to trigger handleFormSubmit processing
    fireEvent.click(button);
    await fakeTimers.tickAsync(500);
    fakeTimers.restore();
    expect(form.container.querySelector("div.core-form-alert")).not.to.be.null;
  });

  it("exercise Form and Fields", async () => {
    const fakeTimers = sinon.useFakeTimers();
    await TestUtils.initializeUiCore();
    let submitProcessed = false;

    const handleFormSubmit = async (values: FieldValues) => {
      expect(values.SiteUrl).to.be.eq("https://www.bentley.com/");
      expect(values.Name).to.be.eq("John Smith");
      expect(values.Lock).to.be.eq(false);
      expect(values.PickList).to.be.eq("four");
      expect(values.Notes).to.be.eq("hello world");
      submitProcessed = true;
    };
    const form = render(<Form handleFormSubmit={handleFormSubmit} fields={fields} submitButtonLabel="Submit" />);
    const siteUrlInput = form.container.querySelector("input#SiteUrl") as HTMLInputElement;
    expect(siteUrlInput).not.to.be.null;
    expect(siteUrlInput.value).to.be.eq("");
    fireEvent.change(siteUrlInput, { target: { value: "https://www.bentley.com/" } });
    expect(siteUrlInput.value).to.be.eq("https://www.bentley.com/");

    const nameInput = form.container.querySelector("input#Name") as HTMLInputElement;
    expect(nameInput).not.to.be.null;
    expect(nameInput.value).to.be.eq("John Smith");

    const notesInput = form.container.querySelector("textarea#Notes") as HTMLTextAreaElement;
    expect(notesInput).not.to.be.null;
    expect(notesInput.value).to.be.eq("");
    fireEvent.change(notesInput, { target: { value: "hello world" } });

    const lockInput = form.container.querySelector("input#Lock") as HTMLInputElement;
    expect(lockInput).not.to.be.null;
    expect(lockInput.value).to.be.eq("on");
    fireEvent.click(lockInput); // associated lock value should be false

    const pickList = form.container.querySelector(".iui-select#PickList") as HTMLSelectElement;
    expect(pickList).not.to.be.null;
    selectChangeValueByText(pickList, "four", handleError);

    const pickList2 = form.container.querySelector(".iui-select#PickList2") as HTMLSelectElement;
    expect(pickList2).not.to.be.null;
    selectChangeValueByText(pickList2, "grape", handleError);

    const button = form.container.querySelector("button") as HTMLButtonElement;
    expect(submitProcessed).to.be.eq(false);
    // fire click to trigger handleFormSubmit processing
    fireEvent.click(button);
    fakeTimers.tick(500);
    fakeTimers.restore();
    expect(submitProcessed).to.be.eq(true);
  });
});
