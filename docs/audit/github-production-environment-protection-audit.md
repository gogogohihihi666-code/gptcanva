# GitHub Production Environment Protection Audit

Date: 2026-07-12

## Scope And Result

Initial local HEAD: `6aea3f2` on `master`. The worktree was clean. Remote fetch succeeded and local `master` was 12 commits ahead of `origin/master` with no remote-only commits.

Final status: `SAFE_STOP_SECURITY_BOUNDARY`.

GitHub CLI is authenticated. The repository is public, owned by a user account, and uses `master` as its default branch. The `production` Environment now exists and its deployment policy is exactly `master`. The actual API response still reports administrator bypass as allowed and contains no required-reviewers rule. This audit therefore stops before any deployment authorization. No GitHub workflow, release, image publication, deployment, or push was triggered.

## Repository Identity

| Field | Result |
|---|---|
| Origin repository identity | `gogogohihihi666-code/gptcanva`, derived from the credential-free origin URL |
| Default branch | `master` |
| Visibility | `PUBLIC` |
| Owner type | `User` |
| GitHub CLI authentication | Available through Windows Credential Manager/keyring |
| GitHub plan capability | NOT_VERIFIED; authenticated user API did not return a plan field |
| Expected reviewer list | `OKWOOK_EXPECTED_PRODUCTION_REVIEWERS` was absent |

## Local Workflow Evidence

### Trigger relationship

```text
master push or pull request
  -> CI verify job
  -> npm ci, no-call tests, service build, client build

manual workflow dispatch with release_commit
  -> Docker image publication
  -> immutable sha-<commit> image tag

manual workflow dispatch with release_commit
  -> production Environment deployment job
  -> validation, SSH/SCP, Docker compose pull and up
```

There is no local `workflow_run`, `repository_dispatch`, or scheduled production deployment trigger.

### Ordinary CI

`.github/workflows/ci.yml` is triggered only by `master` push and pull requests. It has `contents: read` permissions and performs dependency installation, no-call tests, service build, and client build. It contains no registry login, image publication, SSH, SCP, webhook, production Environment, or production-secret reference.

Local conclusion: ordinary push does not deploy or publish an image.

### Image publication

`.github/workflows/docker-image.yml` is triggered only by `workflow_dispatch`. It validates a full lowercase 40-character commit SHA, checks out that exact reference, and uses tag `sha-<commit>`. It does publish an image through Docker Hub after manual dispatch. No floating `latest` tag is used by this workflow.

Local conclusion: image publication is manually initiated and separate from deployment.

### Production deployment

`.github/workflows/deploy.yml` is triggered only by `workflow_dispatch`. Its `deploy` job uses `environment: production`, has a non-cancelling `production-deployment` concurrency group, validates a full lowercase commit SHA, checks out that SHA, and constructs an immutable `sha-<commit>` image reference.

SSH and SCP occur only inside this manually dispatched deployment workflow. The workflow references deployment configuration through the `secrets` context, but local source cannot prove whether those names resolve from Environment secrets, repository secrets, organization secrets, or an Environment without protection rules.

## Unverified Production Environment Controls

GitHub API evidence: `production` exists. `GET /environments/production` reports `can_admins_bypass=true` and returns only `branch_policy` in `protection_rules`; no `required_reviewers` rule is present. The deployment branch-policy endpoint contains exactly one policy: `master`.

The following require GitHub-authenticated read access or an authorized human UI check:

| Control | Current result | Required passing state |
|---|---|---|
| `production` Environment exists | true | Exists before any deploy dispatch |
| Required reviewers | false in REST Environment response | Enabled with approved reviewer set |
| Reviewer list | No reviewer data available because required-reviewers rule is absent; expected list also missing | Exact set matches approved users/teams |
| Prevent self-review | NOT_VERIFIED; required-reviewers rule is absent | Enabled |
| Administrator bypass | true | Disabled |
| Deployment branch/tag policy | PASS, exact policy `master` | Only approved branch or protected release tags |
| Environment secrets | 0 | Deployment credentials scoped to `production` |
| Repository-level duplicate secrets | Repository-scoped count is 0; organization scope NOT_VERIFIED | Production credentials absent outside Environment scope |
| Repository visibility and plan capability | NOT_VERIFIED | Plan supports required reviewers for this visibility |

## Exact Human UI Checklist

Open the repository in GitHub, then go to `Settings` → `Environments` → `production`.

1. Open the existing `production` Environment.
2. Re-enable Required reviewers, add only the approved user accounts and teams, and use the page's save action. The REST API must then return a `required_reviewers` protection rule.
3. Enable Prevent self-review in that reviewer rule.
4. Disable administrator bypass for configured protection rules. The REST API must then return `can_admins_bypass=false`.
5. Configure Deployment branches and tags. Select only protected `master` or protected release tags. Do not permit all branches and tags.
6. Under Environment secrets, place deployment-only credentials there before a deployment is authorized. Current count is 0. Do not copy their values into repository-level secrets.
7. Confirm no unapproved user or team can approve production deployment.
8. Confirm the repository plan and visibility support required reviewers for this repository. If private-repository reviewer protection is unavailable, do not weaken the rule. Choose a plan upgrade or an external approval system in a separately approved decision.

After GitHub CLI is installed and authenticated, re-run this audit with a non-sensitive value such as:

```text
OKWOOK_EXPECTED_PRODUCTION_REVIEWERS=user:approved-user,team:approved-team
```

Only identifiers belong in that variable. No credential or secret value is needed.

## Local Gaps Worth A Separate Workflow Task

- The manual deployment workflow validates only SHA format. Branch membership and published-image existence depend on GitHub Environment policy and remote registry behavior. A future `G-fix-github-production-workflow-gates` task can add a verified branch-membership or artifact-attestation check after the Environment policy is confirmed.
- The Dockerfile contains a stale comment saying startup migrates the database, while the current production start path is separately gated. Clarify this comment in the build-warning/operations task; do not change workflow behavior in this audit.

## Safety Declaration

- GitHub workflow triggered: false
- Docker image published: false
- Deployment performed: false
- Git push: false
- Secret value read or printed: false
- Production server or database contacted: false
