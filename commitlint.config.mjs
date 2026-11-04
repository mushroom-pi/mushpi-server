export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    (m) => /^Merge (branch|pull request|remote-tracking branch)/.test(m),
    (m) => m.startsWith('Revert "'),
    (m) => /^(fixup|squash)!/.test(m),
  ],
};
