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

const advisories = Object.values(audit.vulnerabilities).flatMap(({ via }) =>
  via.filter((entry) => typeof entry === "object"),
);
if (advisories.length)
  throw new Error(
    `Dependency advisories: ${[...new Set(advisories.map(({ url }) => url))].join(", ")}`,
  );
if (Object.keys(audit.vulnerabilities).length && !advisories.length)
  throw new Error("npm audit reported affected packages without their root advisory.");
console.log("No dependency advisories.");
