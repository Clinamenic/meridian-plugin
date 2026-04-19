# Meridian Archiver

**Meridian Archiver** is an [Obsidian](https://obsidian.md/) plugin in the **Meridian** suite for cosmolocal knowledge management. It uploads vault files to Arweave and stores transaction metadata in a local archive index you control.

Repository name: **`meridian-archiver`** (one repo per Meridian plugin).

## Migrating from plugin id `meridian`

Release **1.0.0** renames the Obsidian plugin id from `meridian` to **`meridian-archiver`**. The plugin installs under `.obsidian/plugins/meridian-archiver/`.

- **Automatic:** If you install Meridian Archiver and this plugin has **no** `data.json` yet, settings are copied from `.obsidian/plugins/meridian/data.json` when that file exists.
- **Manual:** Copy `.obsidian/plugins/meridian/data.json` to `.obsidian/plugins/meridian-archiver/data.json`, then enable **Meridian Archiver** and disable or remove the old **Meridian** entry if it is still listed.

Your archive index file paths in settings are unchanged by the rename; only the default path for **new** installs is `meridian/archiver/index.json`.

## Installing with BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins from **GitHub Releases**, not from the repository tree. Each release must attach the built files `main.js`, `manifest.json`, and `styles.css`. This repository publishes those assets automatically when you push a **git tag** (see `.github/workflows/release.yml`).

- **Repository URL for BRAT:** `https://github.com/Clinamenic/meridian-plugin`
- **If BRAT reports that `main.js` is missing or the release is incomplete:** the version you selected does not have a **published** GitHub release with those assets yet (for example, the manifest was bumped locally but no matching `vX.Y.Z` tag was pushed), or GitHub Actions failed for that tag. Open [Releases](https://github.com/Clinamenic/meridian-plugin/releases) and confirm the release lists `main.js` under Assets (not only the source zip). Use the latest release, or ask a maintainer to publish a release for the version you need.

## Development

```bash
npm install
npm run build
```

Use `npm run dev` for a watch build during development.
