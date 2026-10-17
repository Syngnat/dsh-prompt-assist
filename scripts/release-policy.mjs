import assert from 'node:assert/strict';
import semver from 'semver';
export const REPOSITORY = 'Syngnat/dsh-prompt-assist';
export const INSTALL_SPEC = `github:${REPOSITORY}`;
export function releasePlan({branch, version, clean, candidateSha, publishedSha, ci}) {
  assert.ok(branch && branch !== 'main' && branch !== 'HEAD', 'Prepare releases on a named development/candidate branch, never main.');
  assert.ok(semver.valid(version) === version && !semver.prerelease(version) && !version.includes('+'), 'A stable canonical package version is required.');
  assert.ok(clean, 'Commit all candidate changes before release.');
  assert.match(candidateSha, /^[a-f0-9]{40}$/);
  if (publishedSha !== undefined) assert.equal(publishedSha, candidateSha, 'The pushed candidate must match the checked-out commit.');
  if (ci !== undefined) assert.ok(ci.some(run => run.name === 'Build and test' && run.event === 'push' && run.status === 'completed' && run.conclusion === 'success' && run.headSha === candidateSha), 'Successful Build and test CI for this exact candidate is required.');
  return {repository:REPOSITORY, branch, version, tag:`v${version}`, candidateSha, installSpec:INSTALL_SPEC};
}
export function verifyPublication(plan, {mainSha, tagSha, latestTag, draft, prerelease, defaultBranch}) {
  assert.equal(defaultBranch, 'main');
  assert.equal(mainSha, plan.candidateSha, 'main differs from the verified candidate');
  assert.equal(tagSha, plan.candidateSha, 'tag differs from the verified candidate');
  assert.equal(latestTag, plan.tag, 'Latest GitHub Release differs from main');
  assert.equal(draft, false);assert.equal(prerelease, false);
}
export function requireVersionAdvance(version, latestTag) {
  const latest = semver.valid(latestTag?.replace(/^v/, ''));
  assert.ok(latest && semver.gt(version, latest), 'The next stable version must be newer than the published stable version.');
}
export function assertRepositoryRemote(url) {
  assert.ok(['https://github.com/Syngnat/dsh-prompt-assist.git','https://github.com/Syngnat/dsh-prompt-assist','git@github.com:Syngnat/dsh-prompt-assist.git'].includes(url), 'origin must be the intended public repository');
}
