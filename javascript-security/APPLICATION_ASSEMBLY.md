# Express application assembly

The analyzer reconstructs a selected application's registration graph without
executing target source or installing target dependencies. `analysisProfile.entrypoint`
is a source-relative path supplied by the trusted analysis manifest. In its absence,
a literal `node file.js` / `nodemon file.js` package start script or an existing
literal package `main` can select the entrypoint. Shell syntax is never executed.
A missing or unsupported entrypoint keeps application coverage partial.

## Modeled behavior

- CommonJS and ES module references, app/router aliases, explicit registrar calls,
  router mount prefixes, registration order, and chained `app.route().get().post()`.
- Express default case-insensitive matching, `app.use` optional trailing slashes,
  literal app case/strict settings, and router-local constructor options. App
  routing settings are captured when its underlying router first initializes;
  changing a setting later does not retrofit earlier middleware layers. Computed
  options and path variants that receive different guards remain partial.
- Consign 0.1.6 literal `include`, `then`, `exclude`, and `into` calls. Package
  declarations identify the assumed library version; lockfile versions take
  precedence. Package metadata contributes to the source digest.
- Uninvoked functions, unreferenced server copies, and unmounted routers stay out
of the selected active graph. Their snapshot records remain available with
  explicit reachability evidence.
- Earlier overlapping routes are identified separately from registration matching.
  An unresolved dispatch path prevents a later route's context from being certified.
- Standard Multer 1.4 middleware factories have version-aware continuation
  summaries. These summaries add no authentication or authorization guard.
  Custom storage/filter callbacks and unreviewed versions remain unresolved.

## Completion and limits

`applicationAssembly.status: complete` means the supported static registration
graph was reconstructed for the selected source configuration. It does not assert
that the configuration is deployed, that every request executes successfully, or
that the application is secure. Each route separately reports `reachability`,
`globalMountResolution`, registration reasons, effective paths, and predecessors.

Consign uses `fs.readdirSync` directory order. The analyzer records deterministic
source-snapshot enumeration and `runtimeOrderVerified: false`. A directory that
installs middleware across files remains partial because changing enumeration order
can change protection. Explicit file includes preserve declared order. Repeated
registration, unusual exclusions, dynamic paths/options, parameter middleware,
deferred registration callbacks, source parsing limits, and computed app methods
produce explicit unresolved reasons.

## Evidence

`test/application.test.cjs` checks startup selection, dormant copies, aliases,
router mounting, conditional registration, chained methods, source provenance,
Multer summaries, and dispatch overlaps. One test executes only authored minimal
fixtures through the pinned `consign@0.1.6` development dependency, records app
registrations using an in-memory fake app, and compares guard-before-route and
route-before-guard order with the static model. Analyzed application source is never executed.

Reviewed primary implementations:

- [Consign source](https://github.com/jarradseers/consign/blob/master/lib/consign.js)
  and the exact installed `consign@0.1.6` source used by the isolated fixture.
- [Multer 1.4.5-lts.1 factory](https://github.com/expressjs/multer/blob/v1.4.5-lts.1/index.js)
  and [continuation implementation](https://github.com/expressjs/multer/blob/v1.4.5-lts.1/lib/make-middleware.js).
