/* This module re-exports /condition.js (the one condition rule; see its
   header) for the builders and the Netlify functions. */
import "../../condition.js";

const api = globalThis.AriaCondition;
export const conditionOfTitle = api.conditionOfTitle;
export const gradeOfTitle = api.gradeOfTitle;
export const CONDITION_LABELS = api.LABELS;
export const NO_GRADE_NOTE = api.NO_GRADE_NOTE;
