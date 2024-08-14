const fs = require("fs");
const path = require("path");

const dependencies = ["handle-routes", "handle-psm"];

/**
 * Copies internal ABIS from node_modules to the ./src/abi folder.
 * This is done so that typechain can work on ./src/abi as the input folder.
 * @param {string} dependency
 */
const copyDependency = (dependency) => {
  const srcRoutes = path.join(
    __dirname,
    "node_modules",
    "@handle-fi",
    dependency,
    "build",
    "contracts"
  );
  const dstRoutes = path.join(__dirname, "src", "abis", "handle", dependency);
  // Only the top level ABIs are copied over.
  // TODO: make "dependencies" an object with name and directories properties.
  const topLevelContracts = fs.readdirSync(srcRoutes);
  const unfilteredAbis = topLevelContracts
    .map((p) =>
      fs.readdirSync(path.join(srcRoutes, p)).map((file) => path.join(p, file))
    )
    .flat();
  // filter abis from build info
  const abis = unfilteredAbis.filter(
    (abi) => abi.endsWith(".json") && !abi.endsWith(".dbg.json")
  );

  // create dstRoutes if not exists
  if (!fs.existsSync(dstRoutes)) fs.mkdirSync(dstRoutes);

  // copy each file into dstRoutes directory
  abis.forEach((abi) => {
    fs.copyFileSync(
      path.join(srcRoutes, abi),
      path.join(dstRoutes, abi.split(path.sep)[1])
    );
    console.log(`${abi} copied to src/abis`);
  });
};

dependencies.map(copyDependency);
