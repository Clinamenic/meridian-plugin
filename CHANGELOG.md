# Changelog

## 0.6.0 - 2026-03-19

Commit: f849b12 (2026-03-19T19:20:40-07:00)

### Added

- feat(archive): document versioning — each archived file now tracks multiple `VersionRecord` entries under a single `DocumentRecord`, preserving the full upload history
- feat(archive): UUID resolution from YAML frontmatter for markdown files; falls back to path match against the index, then generates a fresh UUID
- feat(archive): multi-index support with a persistent index selector in the upload modal
- feat(archive): full Archive tab with search by filename, UUID, or transaction ID; expand/collapse per-document version list; per-version copy TX ID, open in gateway, and delete

### Fixed

- fix(archive): guard against missing `tags` field on imported `VersionRecord` entries so index files without tags no longer crash the archive tab silently

### Internal

- chore: repair malformed `versions.json` (entries 0.5.0 and 0.5.1 were written outside the JSON object)
- chore: sync `package.json` version to match `manifest.json` so `npm version` produces correct bumps going forward
