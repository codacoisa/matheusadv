# Repository Guidelines

## Project Structure & Module Organization

OfficeJur is a static monorepo composed of independent applications under
`apps/`: `portal`, `configuracoes`, `documentos`, `financeiro`, `calculos`,
`validador-projudi`, and experimental tools in `lab/tools/`. Shared navigation,
branding, synchronization helpers, and modal behavior live in `packages/ui`.
The installation identity is configured in `config/office.js`. Browser and
accessibility tests are in `tests/browser/`; build and validation utilities are
in `scripts/`.

## Build, Test, and Development Commands

Run from the repository root:

```bash
npm ci
npx playwright install chromium
npm run test:calculos              # Node tests for calculation engines
npm run test:browser               # Chromium navigation and axe-core checks
./scripts/build-site.sh            # Assemble the publishable _site/ artifact
node scripts/validate-site.mjs     # Check routes, assets, metadata, and output
node scripts/serve-static.mjs _site 4173  # Serve the built site locally
```

For module-specific work, use `cd apps/financeiro && npm test` or
`cd apps/validador-projudi && npm run check`. Do not edit generated `_site/`
files; change their source application or shared package instead.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons in JavaScript, and clear early returns.
Keep HTML, CSS, and JavaScript scoped to the owning module unless behavior is
genuinely shared. Use lowercase kebab-case for new directories and assets;
follow existing names such as `app-switcher.js` and `site-header.css`.
Preserve the existing browser-native, dependency-light approach.

## Testing Guidelines

Node’s built-in test runner is used for unit tests (`*.test.cjs` or
`*.test.mjs`). Playwright tests in `tests/browser/officejur.spec.mjs` cover all
published routes, shared UI behavior, runtime errors, and WCAG A/AA via
axe-core. Add a focused regression test for every user-visible bug and run the
relevant unit, browser, build, and validation commands before submitting.

## Commit & Pull Request Guidelines

Use `<type>: <description>` with a conventional type (`feat`, `fix`, `docs`,
`test`, `refactor`, `ui`, etc.), Brazilian Portuguese, an infinitive verb, and
a first line of at most 72 characters without a period. Add AI co-authorship
when applicable. Pull requests must explain the problem and solution, list
verification commands, include screenshots for UI changes, disclose material
AI use, and address the contributor assignment requirements in
`CONTRIBUTING.md` and the PR template.

## Security & Data Handling

Never commit real client data, credentials, tokens, protected documents, or
production exports. Report vulnerabilities through `SECURITY.md`, not public
issues. Register the source, version, license, and credits for any third-party
dependency or asset in `THIRD-PARTY-NOTICES.md`.
