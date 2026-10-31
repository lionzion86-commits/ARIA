/* The estimator lives beside the weight resolver (netlify/functions), which
   uses it at checkout; the build scripts share the one copy. */
export * from "../../netlify/functions/_surfboard-weight.js";
