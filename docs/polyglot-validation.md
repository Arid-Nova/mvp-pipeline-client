# Polyglot contribution validation

The `capability-workflows` job in `.github/workflows/polyglot.yml` runs the bounded
JavaScript analyzer, browser/background dispatch probes, finite source-policy
engine, service capability guards, report UI tests, TypeScript checks and production
frontend compilation. The separate JVM job builds and tests the extraction-backed
Java services.

These checks execute authored synthetic Express/JWT fixtures on loopback. They do
not execute analyzed repositories, connect to production services, call a model
provider or download model weights. Test doubles replace optional Java/model/graph
integrations. Database and provider SDK packages satisfy existing service imports;
no database or API credential is required.

## Install the test dependencies

Use Node.js 22 and Python 3.13, matching CI. From the repository root:

```sh
python -m venv .venv
```

Activate `.venv` with `. .venv/bin/activate` on POSIX, or
`.\.venv\Scripts\Activate.ps1` in PowerShell, then install:

```sh
python -m pip install --disable-pip-version-check -r javascript-policy/requirements-test.txt
npm --prefix javascript-security ci --ignore-scripts --no-audit --no-fund
npm --prefix javascript-policy ci --ignore-scripts --no-audit --no-fund
npm --prefix coordinator ci --ignore-scripts --no-audit --no-fund
npm --prefix frontend ci --ignore-scripts --no-audit --no-fund
```

The checked-in test requirements contain only lightweight API, finite-solver and
service-import dependencies. Torch, transformers, Neo4j and model weights are not
part of this test environment. Package installation uses lockfiles and disables
package lifecycle scripts. The frontend has a pinned public transitive Git dependency;
CI rewrites its SSH transport to HTTPS so no SSH credential is needed.

## Canonical source and dispatch checks

Run these from the repository root. `--check` never rewrites generated copies:

```sh
python scripts/sync_javascript_workflow.py --check
python javascript-policy/sync.py --check
npm --prefix javascript-security test
npm --prefix coordinator run build
npm --prefix coordinator test
```

The TypeScript dispatch tests cover Java compatibility, explicit JS/TS dispatch,
source identity, scoped comparisons, generic-class language metadata, mixed-language
capability guards, and browser/coordinator Aegis behavior. Unsupported language
combinations must make no Java policy/vector/model call.

Run each Python command in its listed working directory with the activated test
environment. The policy suite also exercises the five real lightweight FastAPI
applications, finite Z3 witnesses and the explicitly configured synthetic HTTP
fixture executor.

| Working directory | Command | Locally verified tests on 2026-10-20 |
| --- | --- | ---: |
| `javascript-policy` | `python -m unittest discover -s tests -v` | 30 |
| `aegis` | `python -m unittest discover -s tests -v` | 22 |
| `formalmethod` | `python -m unittest discover -s tests -v` | 10 |
| `vectorgenerator` | `python -m unittest discover -s tests -v` | 5 |
| `scenariogenerator` | `python -m unittest discover -s tests -v` | 4 |

The bounded JavaScript analyzer passed 78 tests and the coordinator/browser probes
passed 26 tests in that local validation. Counts describe the checked revision,
not extraction accuracy or complete security coverage.

## Frontend type, report and production checks

Run in `frontend`:

```sh
npx --no-install tsc --noEmit
npm test -- --watchAll=false --runInBand --testMatch='**/ExpressSecurityReport.test.tsx' --testPathIgnorePatterns='node_modules'
```

Both source-evidence report tests passed. The explicit match also works when a
Windows checkout path contains mixed separators from the surrounding workspace.

For the production build, use `CI=false npm run build` on POSIX, or in PowerShell:

```powershell
$env:CI = 'false'
npm run build
```

Compilation and TypeScript errors remain fatal. `CI=false` is explicit because the
existing frontend emits source-map warnings from `mobile-drag-drop`/`posthog-js`,
existing lint warnings, and a large-bundle warning. The standard production build
succeeds; Create React App's strict `CI=true` warning policy rejects those warnings.
The contribution does not suppress individual diagnostics or claim a warning-free
frontend.

## Existing unrelated frontend failures

The unchanged `ChatbotPanel.test.tsx` suite has nine failures and seven passes.
The same nine failures were independently reproduced against clean upstream
`160760a` source using the same installed dependencies. They concern health/error
text, answer/confidence and follow-up metadata, context refresh, and citation
`aria-expanded` expectations. No chatbot files are changed by this contribution.
The targeted report tests and TypeScript/production builds are therefore the
relevant frontend gates in this workflow; the complete frontend test suite is not
claimed to pass.

To reproduce that separate baseline check from `frontend`:

```sh
npm test -- --watchAll=false --runInBand --testMatch='**/ChatbotPanel.test.tsx' --testPathIgnorePatterns='node_modules'
```
