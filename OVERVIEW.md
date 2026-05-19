# n8n-nodes-veridion — Project Overview

## What This Project Is

This repository is an **n8n community node package** for Veridion.

It currently implements three user-facing operations inside a single `Veridion` node:

1. `Enrich Company`
2. `Company Search`
3. `Supplier Search`

The package is intended to be published as `n8n-nodes-veridion` and loaded into n8n as a custom/community node.

---

## Current Repository Shape

```text
n8n-nodes-veridion/
├── credentials/
│   └── VeridionApi.credentials.ts
├── nodes/
│   └── Veridion/
│       ├── Veridion.node.ts
│       └── veridion.svg
├── scripts/
│   └── copy-icons.js
├── .github/
│   └── workflows/
│       └── publish.yml
├── eslint.config.js
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── OVERVIEW.md
```

---

## Build And Package Status

The build setup was cleaned up.

- `gulp` is no longer required
- icon copying is handled by `scripts/copy-icons.js`
- `package.json` build script is now:

```bash
tsc -p tsconfig.build.json && node scripts/copy-icons.js
```

- `n8n-core` and `n8n-workflow` were pinned to explicit versions to avoid broken installs:
  - `n8n-core: 2.16.1`
  - `n8n-workflow: 2.16.0`

Local status at the end of this session:

- `npm run build` passes
- `npm run lint` passes

---

## Implemented Functionality

### 1. Enrich Company

This operation was updated to match the live Match API documentation.

Important implementation details:

- request body uses an `identifiers` object
- supported identifier fields:
  - `legal_names`
  - `commercial_names`
  - `website`
  - `address_txt`
  - `phone_number`
  - `registry_id`
- the node validates inputs before calling the API
- the HTTP response is handled manually so `200`, `202`, and `400` can be treated explicitly

Behavior:

- `200`: returns enriched company data
- `202`: returns a no-match style response
- `400`: surfaces the API validation error

This operation was tested locally in n8n and worked.

### 2. Company Search

This operation was added based on the Search API documentation.

The node builds Veridion filter JSON internally from form fields instead of asking the user to write raw filters.

Current company-search inputs are centered around:

- country / region / city / postcode
- industries
- NAICS code + strictness
- employee count min/max
- revenue min/max
- year founded min/max
- keywords + strictness
- page size
- pagination token

### 3. Supplier Search

This operation was separated from company search so the UI better matches the product/supplier use case.

Current supplier-search inputs are centered around:

- product keyword group 1
- product keyword group 2
- product keyword group 3
- product exclude keywords
- supplier types
- country / region / city / postcode
- location strictness
- proximity address / radius / unit
- industries
- NAICS code + strictness
- employee count min/max
- revenue min/max
- year founded min/max
- page size
- pagination token

Important validation:

- supplier search requires at least one product keyword group
- supplier keyword groups use OR within a group and AND across groups

---

## Search Request Debugging Support

Search responses now expose the generated Veridion request body so the built filters can be inspected directly from n8n output.

This was added because the standard n8n `INPUT` panel only shows the incoming item from the previous node, not the internal request payload built by this node.

Debug output locations:

- in full-response / zero-result style output:
  - `_veridion_request`
- in company-item output:
  - `_veridion_search.request`

This debug request includes:

- URL
- query params
- request body
- generated `filters`

This was used during local debugging to confirm exactly what the node was sending to Veridion.

---

## Important Fixes Made During This Session

### Match API payload fix

The original match implementation did not match the documented payload shape closely enough.

It was updated to use the documented `identifiers` structure.

### Search operations added

The node originally only supported match/enrich.

It now supports:

- `Enrich Company`
- `Company Search`
- `Supplier Search`

### Raw JSON filter UI removed

The first version of search exposed raw `Filters JSON`.

That was replaced with proper n8n fields so users do not have to author Veridion filter JSON by hand.

### Search error handling improved

Search now uses manual status handling similar to the match operation so API validation errors are easier to debug.

### Optional numeric field bug fixed

There was a real issue with optional numeric search fields in n8n:

- blank optional numeric fields were being interpreted as `0`
- this caused unintended filters like:
  - `company_employee_count = 0`
  - `company_estimated_revenue = 0`
  - `company_year_founded = 0`

Fix:

- optional numeric search fields were changed from `type: 'number'` to `type: 'string'`
- the node now parses them manually
- blank stays blank
- `0` is only sent if the user explicitly types `0`
- invalid values throw a clear node error

Affected fields include:

- employee count min/max
- estimated revenue min/max
- year founded min/max
- proximity radius

### Equal min/max range handling improved

Range building was adjusted so:

- min and max both blank => no filter
- min only or max only => partial/range logic
- min == max => send `equals` instead of an invalid `between`

### Stale n8n node instance issue identified

One confusing issue turned out not to be a code bug.

After changing node parameter types, an existing node instance inside n8n kept stale schema/state. Deleting the old `Veridion` node from the workflow and adding a fresh one made the updated parameter definitions apply correctly.

This is important to remember for future debugging.

---

## Local Testing Notes

### Node / environment

Working local setup used:

- Node `20.20.2`
- npm `10.8.2`
- n8n `2.8.4` self-hosted local install

Node 25 caused install/build problems for `n8n`, so Node 20 should be used when returning to this project.

### Start n8n locally

Use:

```bash
nvm use 20
N8N_CUSTOM_EXTENSIONS="/Users/veridion-jmm956m5yw/Library/Application Support/Claude/local-agent-mode-sessions/fd81911a-ca19-4a90-9ba2-bc61dba8f454/b38f9e64-aeca-41e3-9184-88a1a7b0664d/local_71fee3ae-b73a-4577-97f9-4d1b5919ac3b/outputs/n8n-nodes-veridion" n8n start
```

Then open:

```text
http://localhost:5678
```

### Credential / node loading

Confirmed locally:

- the custom node loads in n8n
- the credential can be created
- match/enrich was tested and worked
- supplier search worked after deleting and re-adding the node to avoid stale schema state

---

## Known Follow-Ups

These are the main things still worth checking or polishing later.

### 1. Company search page-size behavior

There is an open follow-up around `page_size`.

At one point, the user set page size to `10` but saw `100 items` returned in n8n output. That may indicate:

- stale node instance/config
- API behavior differing from expectation
- or a remaining bug in how the request is built/applied

The right way to verify this later is to inspect:

- `_veridion_request.qs.page_size`

If the request shows `10` but the API still returns `100`, the issue is likely API-side behavior or response handling rather than UI state.

### 2. Search field ordering and grouping

The search forms work, but the UX can still be improved.

Good next polish step:

- group fields into sections such as:
  - `Core Search`
  - `Location`
  - `Classification`
  - `Company Size`
  - `Products`

### 3. Placeholder clarity

Some placeholder text in supplier/company search can be visually misleading in the n8n UI. The forms are working, but placeholder examples should be reviewed and cleaned up to reduce confusion.

### 4. Publish workflow safety

The repository has a `publish.yml` workflow, but publishing should still be treated carefully before first release.

Remaining release-side checks:

- confirm auth setup:
  - npm trusted publishing, or
  - `NPM_TOKEN`
- confirm workflow gating strategy before using `main` as a release trigger

### 5. Documentation sync

Docs should stay aligned whenever field structure changes:

- `README.md`
- `OVERVIEW.md`
- any publish/release notes

---

## Safe Resume Checklist

When returning later, this is the shortest reliable path back in:

1. `nvm use 20`
2. `npm install` if needed
3. `npm run build`
4. `npm run lint`
5. start n8n with `N8N_CUSTOM_EXTENSIONS=... n8n start`
6. if a node behaves strangely after schema changes, delete it from the workflow and add it again fresh
7. inspect `_veridion_request` or `_veridion_search.request` for any search-filter debugging

---

## Short Session Log

This is the compact log of what changed in this work session.

1. Fixed the build setup by replacing the missing gulp-based icon step with `scripts/copy-icons.js`.
2. Pinned `n8n-core` and `n8n-workflow` to stable explicit versions.
3. Updated match/enrich request construction to the documented `identifiers` payload.
4. Added `Company Search`.
5. Added `Supplier Search`.
6. Replaced raw JSON search filters with direct form inputs.
7. Added request-debug output for search calls.
8. Improved search error handling so API validation issues are easier to inspect.
9. Fixed the optional numeric-field bug where blank values became zero.
10. Verified local n8n loading and successful local testing of the node, with the note that old node instances may need to be deleted and recreated after schema changes.
