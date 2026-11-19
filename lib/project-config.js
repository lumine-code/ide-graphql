const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const extensions = ["ts", "cts", "mts", "js", "cjs", "mjs", "json", "yaml", "yml", "toml"];
const standardNames = new Set([
  ".graphqlrc",
  ...extensions.flatMap((extension) => [`.graphqlrc.${extension}`, `graphql.config.${extension}`]),
]);
const legacyNames = new Set([
  ".graphqlconfig",
  ".graphqlconfig.json",
  ".graphqlconfig.yaml",
  ".graphqlconfig.yml",
]);
const discoveryOverrides = new Set([
  ".config.json",
  ".config.yaml",
  ".config.yml",
  ".config.js",
  ".config.ts",
  ".config.cjs",
  ".config.mjs",
]);

async function hasProjectConfig(rootPath, legacy) {
  const home = os.homedir();
  const root = path.resolve(rootPath);
  let directory = root;
  while (true) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      let manifest;
      for (const entry of entries) {
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        const name = process.platform === "win32" ? entry.name.toLowerCase() : entry.name;
        if (standardNames.has(name) || (legacy && legacyNames.has(name))) return true;
        // Cosmiconfig lets projects override their configuration discovery.
        if (directory === root && discoveryOverrides.has(name)) return true;
        if (name === "package.json") manifest = entry.name;
      }
      if (manifest) {
        const contents = await fs.readFile(path.join(directory, manifest), "utf8");
        const config = JSON.parse(contents) || {};
        if (Object.hasOwn(config, "graphql")) return true;
        if (directory === root && Object.hasOwn(config, "cosmiconfig")) return true;
      }
    } catch (error) {
      // Defer unreadable or malformed configuration to the language server.
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) return true;
    }
    const parent = path.dirname(directory);
    if (directory === parent || !path.relative(home, directory)) return false;
    directory = parent;
  }
}

module.exports = hasProjectConfig;
