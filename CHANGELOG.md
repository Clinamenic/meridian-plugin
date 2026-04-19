# Changelog

## 1.0.0 - 2026-03-29

Commit: f7abb0a (2026-04-19T11:09:49-07:00)

### Breaking

- **Plugin identity:** Obsidian plugin `id` is now `meridian-archiver` (folder under `.obsidian/plugins/`). The display name is **Meridian Archiver**, part of the Meridian suite. Installing this release alongside the old `meridian` id installs a separate plugin; settings are not shared unless you migrate (see README).
- **Default archive index path** for new installs is now `meridian/archiver/index.json` (suite subfolder per plugin). Existing settings and migrated data keep your configured paths.

### Changed

- chore: rename npm package to `meridian-archiver`; align user-facing copy, commands, and CSS class prefix to `meridian-archiver-*`
- feat: on first run with empty plugin data, automatically import settings from `.obsidian/plugins/meridian/data.json` when present (legacy plugin id)

## 0.6.2 - 2026-03-21

Commit: 0bdd98f (2026-03-21T14:54:18-07:00)

### Fixed

- fix(archive): label editor no longer triggers a save when pressing Escape — the blur listener is now removed before clearing the DOM, so cancelling correctly discards changes
- fix(archive): pressing Enter no longer causes a duplicate concurrent save — the blur listener is removed at the start of the save path, preventing the DOM removal from firing a second write

## 0.6.1 - 2026-03-19

Commit: 5536f7c (2026-03-19T23:22:34-07:00)

### Added

- feat(archive): editable document labels — pencil icon button on each archive row opens an inline input; Enter or blur saves, Escape cancels; stored as optional `label` field on `DocumentRecord`

### Fixed

- fix(archive): delete button hover now uses a solid red background with white icon, replacing the previous red-on-red combination where icon and background blended together

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
