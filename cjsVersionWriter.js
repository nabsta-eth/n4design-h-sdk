// This script is triggered by the CI to publish the CJS package.
const mode = process.env.CJS_VERSION_WRITER_MODE?.toLowerCase();
if (!mode || (mode !== "set" && mode !== "unset"))
  throw new Error("invalid usage");
const fs = require("fs");
const definition = JSON.parse(
  fs.readFileSync("./package.json", "utf-8").toString()
);
if (mode === "set") {
  definition.version = `${definition.version}-cjs`;
} else {
  definition.version = definition.version.replace("-cjs", "");
}
fs.writeFileSync("./package.json", JSON.stringify(definition, null, 2));
