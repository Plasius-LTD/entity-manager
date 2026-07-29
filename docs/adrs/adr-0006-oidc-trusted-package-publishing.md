# ADR-0006: Exact-main OIDC trusted package publishing

- Status: Accepted
- Date: 2026-07-28

## Context

`@plasius/entity-manager` is published from GitHub Actions. The former workflow
prepared a new version commit and published it inside the workflow run that had
been dispatched from the preceding commit. Checking out the new commit did not
change the workflow run's source identity, so npm provenance could identify the
dispatch parent instead of the package and tag commit.

Long-lived npm write tokens also create avoidable credential and rotation risk.
npm trusted publishing supports short-lived OIDC authentication when the
publication job uses a GitHub-hosted runner, an exact workflow and environment
binding, Node.js 22.14.0 or newer, and npm 11.5.1 or newer.

## Decision

Use a two-phase, two-run release protocol in `.github/workflows/cd.yml`:

1. An operator dispatches `phase: prepare` from `main`.
2. The reusable preparation workflow versions the package and changelog on an
   immutable, per-run-attempt branch, merges it through a pull request without
   force-pushing, then returns the protected branch's exact `HEAD`.
3. The prepare run waits for a successful push-triggered `ci.yml` run whose
   branch, event, head SHA, status, and conclusion all match that prepared
   commit.
4. If remote `main` still equals the prepared commit, the workflow dispatches a
   separate `phase: publish` run from `main` with the expected SHA and tag.
5. The publish run requires its event SHA and remote `main` to equal that
   expected SHA. A read-only hosted job repeats the exact-CI check, validates the
   source, creates the SBOM, and packs the package with lifecycle scripts
   disabled. It uploads the package tarball and SBOM as separate immutable
   direct artifacts.
6. The hosted `production` job downloads both exact artifact IDs, verifies the
   GitHub artifact digests, independently computed file SHA-256 values, package
   identity, release metadata, and safe tar members, then repeats the exact-main
   and CI checks immediately before the first release mutation.
7. The hosted `production` job publishes only the verified tarball, with
   lifecycle scripts disabled, through npm OIDC with the trusted
   publisher bound to `Plasius-LTD/entity-manager`, `cd.yml`, `production`, and
   the `npm publish` action. No npm write token is supplied or configured.
8. Before treating an existing version as an idempotent success, or finalizing
   the GitHub release after a new publication, the job requires npm's
   `dist.integrity` SHA-512 value to match the exact downloaded tarball and the
   version-derived npm distribution tag to point at that exact version.

The publication runtime is pinned to Node.js 24.18.0 and must report npm
11.5.1 or newer. Dependency caching is disabled in privileged release jobs.
Release tags are immutable: an existing tag must already point at the expected
SHA, and the workflow never deletes or rewrites a conflicting tag.
Preparation runs share one non-cancelling concurrency group. Publication runs
use the prepared SHA in a separate non-cancelling group, allowing the
self-dispatched publish run to start without waiting behind the preparation
run that created it while still deduplicating publication attempts for the same
SHA. The npm distribution tag and GitHub prerelease state are derived from the
final `package.json` version and must match the preparation hand-off.

The reusable workflow declares only `RELEASE_PREP_APP_PRIVATE_KEY`; the caller
maps that secret explicitly. Its ordinary `GITHUB_TOKEN` is read-only, while
release-branch, pull-request, and merge mutations use the short-lived,
narrowly-scoped GitHub App installation token. Package versioning runs with
npm lifecycle scripts disabled while that App token is present.

The job with `id-token: write` and repository mutation permission runs no
dependency installation, project build/test/pack script, package lifecycle
script, or third-party Codecov action. Those operations occur before the
production environment boundary in the read-only validation-and-pack job.
The package and SBOM artifacts are uploaded before Codecov runs, so that
third-party action cannot alter content selected for publication.

The parent Feature's inherited rollout control is
`platform.public-artifact-integrity.enabled`. Operational rollback disables
`cd.yml`; it does not restore token publishing. If `main` moves before
publication, the run fails without release mutation and can be prepared again
with `bump: none` after the branch is stable.

## Consequences

- npm provenance, the release tag, the package bytes, the successful CI run,
  and the CD workflow event all bind to the same commit.
- A conflicting pre-existing npm version cannot be silently blessed by a retry;
  exact-byte or distribution-tag mismatches stop release finalization.
- A reusable or leaked long-lived npm publish credential is no longer required.
- Releases use two workflow runs and may stop safely when another commit reaches
  `main` during the hand-off.
- Release preparation always produces a reviewable main push event, allowing
  the exact-commit CI requirement to remain fail-closed.
- The npm trusted-publisher configuration and GitHub `production` branch policy
  are required external admission controls and must be verified before CD is
  enabled.

## Alternatives considered

- Publish after checking out a child release commit in the original dispatch
  run: rejected because the workflow and provenance identity remain the parent.
- Trigger publication with `workflow_run`: rejected because GitHub sets that
  event's SHA to the latest default-branch commit, which can differ from the CI
  run's head SHA.
- Publish from a tag-triggered workflow: rejected because production package
  releases are governed as `cd.yml` runs from `main`.
- Retain an npm token fallback: rejected because it weakens the OIDC trust
  boundary and makes successful publication ambiguous.
