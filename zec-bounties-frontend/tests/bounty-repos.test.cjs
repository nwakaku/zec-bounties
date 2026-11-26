const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, require: requireFixture, URLSearchParams,
  }, { filename });
  return module.exports;
}

const repos = loadTs("lib/repos.ts");
const {
  filterAndSortBounties,
  readBountyBoardFilters,
  writeBountyBoardFilters,
} = loadTs(
  "lib/bounty-filters.ts",
  (id) => {
    assert.equal(id, "@/lib/repos");
    return repos;
  },
);

test("Namada dashboard URLs belong to Namada, not the wiki", () => {
  for (const url of [
    "https://namada.zechub.wiki/",
    "https://namada.zechub.wiki",
    "https://namada.zechub.wiki/?tab=validators",
    "https://namada.zechub.wiki/#metrics",
    "See (https://namada.zechub.wiki) for metrics.",
    "Dashboard: NAMADA.ZECHUB.WIKI/",
  ]) {
    assert.equal(repos.bountyRepo({ description: url }), "namada", url);
  }
});

test("wiki links still match with or without a trailing slash", () => {
  for (const url of [
    "https://zechub.wiki/",
    "https://zechub.wiki",
    "https://zechub.wiki/start",
    "Read zechub.wiki/ for details.",
    "https://www.zechub.wiki/",
    "https://www.zechub.wiki/start",
    "http://www.zechub.wiki",
    "https://www.zechub.wiki?tab=learn",
    "https://www.zechub.wiki#start",
    "Read WWW.ZECHUB.WIKI/ for details.",
  ])
    assert.equal(repos.bountyRepo({ description: url }), "zechub-wiki", url);
});

test("unrelated subdomains and lookalike hosts stay untagged", () => {
  for (const url of [
    "https://other.zechub.wiki/",
    "https://notzechub.wiki/",
    "https://namada.zechub.wiki.example.com/",
    "https://www.zechub.wiki.example.com/",
    "https://other.www.zechub.wiki/",
    "https://wwww.zechub.wiki/",
  ]) assert.equal(repos.bountyRepo({ description: url }), null, url);
});

test("explicit repository tags keep priority over description links", () => {
  assert.equal(repos.bountyRepo({ targetRepo: "zec-bounties", description: "https://namada.zechub.wiki/" }), "zec-bounties");
});

test("existing GitHub repository links keep their classifications", () => {
  for (const [name, expected] of [
    ["zechub", "zechub"], ["zechub-wiki", "zechub-wiki"],
    ["zec-bounties", "zec-bounties"], ["Namada", "namada"],
  ]) assert.equal(repos.bountyRepo({ description: `https://github.com/ZecHub/${name}` }), expected);
});

test("board filters can combine repository and team selections", () => {
  const bounties = [
    {
      id: "dashboard",
      description: "https://namada.zechub.wiki/",
      teamId: "team-a",
    },
    {
      id: "wiki",
      description: "https://zechub.wiki/",
      teamId: "team-a",
    },
    {
      id: "other",
      description: "No repository link",
      teamId: "team-a",
    },
  ].map((bounty) => ({
    ...bounty,
    dateCreated: "2026-10-01",
    status: "TO_DO",
  }));
  const params = new URLSearchParams("repo=namada&team=team-a");
  const filters = readBountyBoardFilters(params);
  const result = filterAndSortBounties(bounties, filters);
  assert.deepEqual(Array.from(result, (bounty) => bounty.id), ["dashboard"]);

  const untagged = filterAndSortBounties(bounties, {
    ...filters,
    repo: "untagged",
  });
  assert.deepEqual(Array.from(untagged, (bounty) => bounty.id), ["other"]);

  const updatedParams = writeBountyBoardFilters(
    new URLSearchParams(),
    filters,
  );
  assert.equal(updatedParams.get("repo"), "namada");
  assert.equal(updatedParams.get("team"), "team-a");
});
