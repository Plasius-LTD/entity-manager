import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

const ciWorkflow = readWorkflow("ci");
const cdWorkflow = readWorkflow("cd");
const releasePrepareWorkflow = readWorkflow("release-prepare");
const npmConfig = readFileSync(new URL("../.npmrc", import.meta.url), "utf8");
const configurableSelfHostedRunner =
  "runs-on: ${{ fromJSON(vars.CD_RUNNER_LABELS || '[\"self-hosted\",\"Linux\",\"X64\"]') }}";
const hostedProductionRunner = "runs-on: ubuntu-latest";
const exactCiWorkflowEndpoint =
  'actions/workflows/ci.yml/runs"';

describe("workflow trust boundaries", () => {
  it("runs both production release jobs on GitHub-hosted production runners", () => {
    expect(cdWorkflow).toContain(hostedProductionRunner);
    expect(releasePrepareWorkflow).toContain(hostedProductionRunner);
    expect(cdWorkflow).not.toContain(configurableSelfHostedRunner);
    expect(releasePrepareWorkflow).not.toContain(configurableSelfHostedRunner);
    expect(cdWorkflow).toContain("environment: production");
    expect(releasePrepareWorkflow).toContain("environment: production");
  });

  it("validates same-repository pull requests without exposing self-hosted runners to forks", () => {
    expect(ciWorkflow).not.toContain("pull_request_target:");
    expect(ciWorkflow).toMatch(/pull_request:\s*\n\s+branches: \[main\]/u);
    expect(ciWorkflow).toContain("name: Trusted head admission");
    expect(ciWorkflow).toContain("External fork pull requests cannot be merged");
    expect(ciWorkflow.match(/needs: trusted_head/gu)).toHaveLength(2);
    expect(
      ciWorkflow.match(
        /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/gu,
      ),
    ).toHaveLength(2);
    expect(
      ciWorkflow.match(
        /runs-on: \$\{\{ fromJSON\(github\.event_name == 'pull_request' && '\["ubuntu-latest"\]' \|\| '\["self-hosted","Linux","X64"\]'\) \}\}/gu,
      ),
    ).toHaveLength(2);
  });

  it("keeps production release workflows off pull-request triggers", () => {
    expect(cdWorkflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(releasePrepareWorkflow).toMatch(/on:\s*\n\s+workflow_call:/u);
    expect(cdWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
    expect(releasePrepareWorkflow).not.toMatch(/\n\s+pull_request(?:_target)?:/u);
  });

  it("separates release preparation from exact-main publication", () => {
    expect(cdWorkflow).toContain("phase:");
    expect(cdWorkflow).toContain("- prepare");
    expect(cdWorkflow).toContain("- publish");
    expect(cdWorkflow).toContain(
      "if: inputs.phase == 'prepare'",
    );
    expect(cdWorkflow).toContain(
      "if: inputs.phase == 'publish'",
    );
    expect(cdWorkflow).toContain("ref: ${{ github.sha }}");
    expect(cdWorkflow).toContain("${{ github.ref }}");
    expect(cdWorkflow).toContain("refs/heads/main");
    expect(cdWorkflow).toContain("github.sha");
    expect(cdWorkflow).toContain("expected_commit_sha");
    expect(cdWorkflow).toContain("release_tag");
    expect(releasePrepareWorkflow).toContain(
      "COMMIT_SHA=$(git rev-parse HEAD)",
    );
    expect(releasePrepareWorkflow).not.toContain(
      'git log -n 1 --format=%H -- "${PACKAGE_JSON}"',
    );
  });

  it("requires successful exact-SHA main CI before staging and publishing", () => {
    expect(cdWorkflow).toContain(exactCiWorkflowEndpoint);
    expect(cdWorkflow).toContain("-f branch=main");
    expect(cdWorkflow).toContain("-f event=push");
    expect(cdWorkflow).toContain('-f head_sha="${EXPECTED_SHA}"');
    expect(cdWorkflow).toContain('-f status=success');
    expect(cdWorkflow).toContain("git merge-base --is-ancestor");
  });

  it("self-dispatches a second run from the exact prepared main commit", () => {
    expect(cdWorkflow).toContain("actions/workflows/cd.yml/dispatches");
    expect(cdWorkflow).toContain('"phase": "publish"');
    expect(cdWorkflow).toContain('"ref": "main"');
    expect(cdWorkflow).toContain("actions: write");
    expect(cdWorkflow).toContain("refs/heads/main");
  });

  it("uses only supported phase-isolated concurrency controls", () => {
    expect(cdWorkflow).toContain(
      "group: npm-cd-${{ github.repository }}-${{ inputs.phase == 'publish'",
    );
    expect(cdWorkflow).toContain("inputs.expected_commit_sha");
    expect(cdWorkflow).not.toContain("queue:");
    expect(cdWorkflow).toContain("cancel-in-progress: false");
  });

  it("lands release metadata through a unique non-force-pushed pull request", () => {
    expect(releasePrepareWorkflow).not.toContain(
      'git push origin "HEAD:${BASE_BRANCH}"',
    );
    expect(releasePrepareWorkflow).not.toContain("--force-with-lease");
    expect(releasePrepareWorkflow).toContain(
      'BRANCH="release/${TAG}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(releasePrepareWorkflow).toContain(
      'git push --set-upstream origin "HEAD:${BRANCH}"',
    );
    expect(releasePrepareWorkflow.match(/npm version .*--ignore-scripts/gu)).toHaveLength(
      2,
    );
  });

  it("derives and binds the npm distribution tag to the prepared version", () => {
    expect(releasePrepareWorkflow).toContain("effective_preid");
    expect(cdWorkflow).toContain(
      "${{ needs.prepare_release.outputs.effective_preid }}",
    );
    expect(cdWorkflow).toContain("derived_preid");
    expect(cdWorkflow).toContain("effective_preid");
    expect(cdWorkflow).toContain(
      "does not match the pre-release identity derived from",
    );
    expect(cdWorkflow).toContain(
      "PREID: ${{ steps.release.outputs.effective_preid }}",
    );
  });

  it("fails closed when an existing GitHub release has the wrong prerelease state", () => {
    expect(cdWorkflow.match(/--json isDraft,isPrerelease/gu)).toHaveLength(2);
    expect(
      cdWorkflow.match(/does not match the version-derived prerelease state/gu),
    ).toHaveLength(2);
    expect(
      cdWorkflow.match(
        /if \[ "\$\{IS_PRERELEASE\}" != "\$\{EXPECTED_PRERELEASE\}" \]; then/gu,
      ),
    ).toHaveLength(2);
    expect(cdWorkflow).toContain("--draft=false --latest --prerelease=false");
  });

  it("binds idempotent npm publication to exact registry bytes and distribution tag", () => {
    expect(cdWorkflow).toContain(
      'TARBALL_INTEGRITY="sha512-$(openssl dgst -sha512 -binary',
    );
    expect(cdWorkflow).toContain("dist.integrity");
    expect(cdWorkflow).toContain(
      "Existing npm package integrity does not match the immutable publication tarball.",
    );
    expect(cdWorkflow).toContain(
      "Published npm package integrity differs from the attested immutable tarball.",
    );
    expect(cdWorkflow).toContain("dist-tags");
    expect(cdWorkflow).toContain(
      "Existing npm distribution tag does not point at the exact package version.",
    );
    expect(cdWorkflow).toContain("Verify exact npm registry publication");
    expect(
      cdWorkflow.indexOf("- name: Verify exact npm registry publication"),
    ).toBeGreaterThan(
      cdWorkflow.indexOf("- name: Publish package through npm OIDC"),
    );
    expect(
      cdWorkflow.indexOf("- name: Verify exact npm registry publication"),
    ).toBeLessThan(cdWorkflow.indexOf("- name: Publish GitHub Release"));
  });

  it("passes only the release-preparation App secret to the reusable workflow", () => {
    expect(cdWorkflow).not.toContain("secrets: inherit");
    expect(cdWorkflow).toContain(
      "RELEASE_PREP_APP_PRIVATE_KEY: ${{ secrets.RELEASE_PREP_APP_PRIVATE_KEY }}",
    );
    expect(releasePrepareWorkflow).toMatch(
      /secrets:\s*\n\s+RELEASE_PREP_APP_PRIVATE_KEY:\s*\n(?:\s+description:.*\n)?\s+required: true/u,
    );
    expect(cdWorkflow).toContain(
      "prepare_release:\n    if: inputs.phase == 'prepare'\n    permissions:\n      contents: read",
    );
    expect(releasePrepareWorkflow).toContain(
      "permissions:\n  contents: read",
    );
  });

  it("uses npm trusted publishing without a long-lived write token", () => {
    expect(cdWorkflow).toContain("id-token: write");
    expect(cdWorkflow).toContain("24.18.0");
    expect(cdWorkflow).toContain("11.5.1");
    expect(cdWorkflow).toContain("package-manager-cache: false");
    expect(cdWorkflow).toContain("npm publish");
    expect(cdWorkflow).not.toContain("NPM_TOKEN");
    expect(cdWorkflow).not.toContain("NODE_AUTH_TOKEN");
    expect(cdWorkflow).toContain("--provenance");
    expect(npmConfig).not.toContain("_authToken");
    expect(npmConfig).not.toContain("NODE_AUTH_TOKEN");
  });

  it("keeps dependency code outside the OIDC mutation job", () => {
    const validationJob = cdWorkflow.slice(
      cdWorkflow.indexOf("\n  validate_and_pack:"),
      cdWorkflow.indexOf("\n  publish:"),
    );
    const privilegedJob = cdWorkflow.slice(cdWorkflow.indexOf("\n  publish:"));
    const privilegedActions = [
      ...privilegedJob.matchAll(/^\s+uses:\s+(\S+)$/gmu),
    ].map((match) => match[1] ?? "");

    expect(cdWorkflow).toContain("validate_and_pack:");
    expect(cdWorkflow).toContain("needs: validate_and_pack");
    expect(cdWorkflow).toContain("uses: actions/upload-artifact@v7");
    expect(cdWorkflow).toContain("npm pack --ignore-scripts --json");
    expect(cdWorkflow).toContain("uses: actions/download-artifact@v8");
    expect(cdWorkflow).toContain("artifact-ids:");
    expect(cdWorkflow).toContain("digest-mismatch: error");
    expect(cdWorkflow).toContain("tarball_sha256");
    expect(cdWorkflow).toContain("sbom_sha256");
    expect(privilegedJob).toContain('const prohibited = "legal/cla-registry.csv"');
    expect(privilegedJob).toContain('.normalize("NFKC")');
    expect(privilegedJob).toContain(
      "Package tarball contains prohibited path metadata.",
    );
    expect(validationJob.indexOf("id: upload_package")).toBeLessThan(
      validationJob.indexOf("codecov/codecov-action"),
    );
    expect(validationJob.indexOf("id: upload_sbom")).toBeLessThan(
      validationJob.indexOf("codecov/codecov-action"),
    );
    expect(validationJob).not.toContain("environment: production");
    expect(validationJob).not.toContain("id-token: write");
    expect(validationJob).not.toContain("contents: write");
    expect(privilegedJob).not.toContain("npm ci");
    expect(privilegedJob).not.toContain("npm run ");
    expect(privilegedJob).not.toContain("codecov/codecov-action");
    expect(privilegedActions.length).toBeGreaterThan(0);
    expect(privilegedActions.every((action) => action.startsWith("actions/"))).toBe(
      true,
    );
    expect(privilegedJob).toContain(
      'npm publish "${TARBALL}" --ignore-scripts',
    );
    expect(privilegedJob).toContain('--tag "${DIST_TAG}"');
  });
});
