// Shared by chrome-contract.mjs and chrome-styling.mjs, which both load a
// kit-shipped default (must exist) and an optional project-local overlay
// (missing is fine, malformed is not). A second copy of this distinction
// would drift from the first, the same reason scripts/lib/rules.mjs exists.

import { readFile } from "node:fs/promises";

function parse(filePath, raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error.message}`);
  }
}

/** Read and parse JSON. The file must exist — for the kit's own shipped contracts. */
export async function loadJSON(filePath) {
  return parse(filePath, await readFile(filePath, "utf8"));
}

/** Missing file -> null. A file that exists but fails to parse still throws. */
export async function loadOptionalJSON(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return parse(filePath, raw);
}
