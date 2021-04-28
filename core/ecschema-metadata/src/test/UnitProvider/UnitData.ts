/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

// Additional data like alternate display label not found in Units Schema
export const UNIT_EXTRA_DATA = [
  // Angles ( base unit radian )
  { name: "Units.RAD", altDisplayLabels: ["radian"] },
  // 1 rad = 180.0/PI °
  { name: "Units.ARC_DEG", altDisplayLabels: ["deg", "^"] },
  { name: "Units.ARC_MINUTE", altDisplayLabels: ["min"] },
  { name: "Units.ARC_SECOND", altDisplayLabels: ["sec"] },
  { name: "Units.GRAD", altDisplayLabels: ["gd"] },
  // Time ( base unit second )
  { name: "Units.S", altDisplayLabels: ["sec"] },
  { name: "Units.MIN", altDisplayLabels: [] },
  { name: "Units.HR", altDisplayLabels: ["hr"] },
  { name: "Units.DAY", altDisplayLabels: ["day"] },
  { name: "Units.WEEK", altDisplayLabels: ["week"] },
  { name: "Units.YR", altDisplayLabels: ["year"] },
  // conversion => specified unit to base unit of m
  { name: "Units.M", altDisplayLabels: ["meter"] },
  { name: "Units.MM", altDisplayLabels: ["MM"] },
  { name: "Units.CM", altDisplayLabels: ["CM"] },
  { name: "Units.DM", altDisplayLabels: ["DM"] },
  { name: "Units.KM", altDisplayLabels: ["KM"] },
  { name: "Units.UM", altDisplayLabels: [] },
  { name: "Units.MILLIINCH", altDisplayLabels: [] },
  { name: "Units.MICROINCH", altDisplayLabels: [] },
  { name: "Units.MILLIFOOT", altDisplayLabels: [] },
  { name: "Units.IN", altDisplayLabels: ["IN", "\""] },
  { name: "Units.FT", altDisplayLabels: ["F", "FT", "'"] },
  { name: "Units.CHAIN", altDisplayLabels: ["CHAIN"] },
  { name: "Units.YRD", altDisplayLabels: ["YRD", "yrd"] },
  { name: "Units.MILE", altDisplayLabels: ["mile", "Miles", "Mile"] },
  { name: "Units.US_SURVEY_FT", altDisplayLabels: ["ft", "SF", "USF", "ft (US Survey)"] },
  { name: "Units.US_SURVEY_YRD", altDisplayLabels: ["USY", "yards (US Survey)"] },
  { name: "Units.US_SURVEY_IN", altDisplayLabels: ["USI", "inches (US Survey)"] },
  { name: "Units.US_SURVEY_MILE", altDisplayLabels: ["miles (US Survey)", "mile (US Survey)", "USM"] },
  { name: "Units.US_SURVEY_CHAIN", altDisplayLabels: ["chains (US Survey)"] },
  // conversion => specified unit to base unit of m²
  { name: "Units.SQ_FT", altDisplayLabels: ["sf"] },
  { name: "Units.SQ_US_SURVEY_FT", altDisplayLabels: ["sussf"] },
  { name: "Units.SQ_M", altDisplayLabels: ["sm"] },
  // conversion => specified unit to base unit m³
  { name: "Units.CUB_FT", altDisplayLabels: ["cf"] },
  { name: "Units.CUB_US_SURVEY_FT", altDisplayLabels: ["cf"] },
  { name: "Units.CUB_YRD", altDisplayLabels: ["cy"] },
  { name: "Units.CUB_M", altDisplayLabels: ["cm"] },
];
