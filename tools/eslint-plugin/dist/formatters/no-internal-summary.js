/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
"use strict";

module.exports = function (results) {
  var uniqueMessages = new Set();

  results.forEach((result) => {
    result.messages.forEach((message) => {
      if (message.ruleId === "@bentley/no-internal")
        uniqueMessages.add(message.message);
    });
  });

  var byTag = {};
  // NOTE: this RegExp matches the message format in no-internal.js
  const re = new RegExp('"(.*)" is (.*).');
  uniqueMessages.forEach((msg) => {
    const match = msg.match(re);
    if (match) {
      const name = match[1];
      const tag = match[2];
      if (byTag.hasOwnProperty(tag))
        byTag[tag].push(name);
      else
        byTag[tag] = [name];
    }
  });

  Object.keys(byTag).sort().forEach((tag) => {
    console.log(`${tag}:`);
    byTag[tag].sort().forEach((symbol) => {
      console.log(`  ${symbol}`);
    });
    console.log();
  });
};
