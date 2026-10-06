const { spawnSync } = require("child_process");

const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], {
  cwd: process.cwd(),
  windowsHide: true,
  encoding: "utf8",
});
if (result.error) throw result.error;
const audit = JSON.parse(result.stdout);
if (audit.error || !audit.metadata || ![0, 1].includes(result.status))
  throw new Error(audit.error?.summary || "npm audit did not return a dependency report.");

// The upstream braces exception is explicitly accepted until a patched release
// exists. Inherited package alerts may vary; accept only this root advisory.
const accepted = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const advisories = Object.values(audit.vulnerabilities).flatMap(({ via }) =>
  via.filter((entry) => typeof entry === "object"),
);
const unexpected = advisories.filter(({ url }) => url !== accepted);
if (unexpected.length)
  throw new Error(
    `Unaccepted dependency advisories: ${[...new Set(unexpected.map(({ url }) => url))].join(", ")}`,
  );
if (Object.keys(audit.vulnerabilities).length && !advisories.length)
  throw new Error("npm audit reported affected packages without their root advisory.");
console.log(
  advisories.length
    ? `Only the accepted upstream braces advisory remains (${Object.keys(audit.vulnerabilities).length} affected packages).`
    : "No dependency advisories.",
);
