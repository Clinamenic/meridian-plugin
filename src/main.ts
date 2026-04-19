import { Notice, Plugin, normalizePath } from "obsidian";
import {
  DEFAULT_INDEX_ID,
  DEFAULT_SETTINGS,
  MeridianArchiverSettingTab,
  validateJwk,
} from "./settings";
import { UploadModal } from "./upload-modal";
import type { PluginSettings } from "./types";

export default class MeridianArchiverPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("archive", "Open Meridian Archiver", () => {
      this.openUploadModal();
    });

    this.addCommand({
      id: "meridian-archiver-open-upload",
      name: "Open upload modal",
      callback: () => {
        this.openUploadModal();
      },
    });

    this.addSettingTab(new MeridianArchiverSettingTab(this.app, this));
  }

  onunload(): void {}

  /**
   * If the legacy plugin id `meridian` was used, copy its data.json once when this plugin has no saved data.
   */
  private async tryLoadLegacyPluginData(): Promise<
    (Partial<PluginSettings> & { indexFilePath?: string }) | null
  > {
    try {
      const rel = normalizePath(`${this.app.vault.configDir}/plugins/meridian/data.json`);
      if (!(await this.app.vault.adapter.exists(rel))) {
        return null;
      }
      const raw = await this.app.vault.adapter.read(rel);
      return JSON.parse(raw) as Partial<PluginSettings> & { indexFilePath?: string };
    } catch {
      return null;
    }
  }

  async loadSettings(): Promise<void> {
    let saved = (await this.loadData()) as Partial<PluginSettings> & {
      indexFilePath?: string;
    };

    if (!saved || Object.keys(saved).length === 0) {
      const legacy = await this.tryLoadLegacyPluginData();
      if (legacy) {
        saved = legacy;
      }
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

    // Migrate from the old single indexFilePath field
    if (saved?.indexFilePath && (!saved.indexes || saved.indexes.length === 0)) {
      this.settings.indexes = [
        { id: DEFAULT_INDEX_ID, name: "Default", filePath: saved.indexFilePath },
      ];
      this.settings.activeIndexId = DEFAULT_INDEX_ID;
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private openUploadModal(): void {
    const walletValid = validateJwk(this.settings.walletJwk);
    if (walletValid !== true) {
      new Notice(
        `Meridian Archiver: ${walletValid} Go to Settings > Meridian Archiver to configure your wallet.`
      );
      return;
    }

    if (!this.settings.indexes || this.settings.indexes.length === 0) {
      new Notice(
        "Meridian Archiver: No archive indexes configured. Go to Settings > Meridian Archiver."
      );
      return;
    }

    new UploadModal(this.app, this.settings, () => this.saveSettings()).open();
  }
}
