import { Notice, Plugin } from "obsidian";
import { DEFAULT_INDEX_ID, DEFAULT_SETTINGS, MeridianSettingTab, validateJwk } from "./settings";
import { UploadModal } from "./upload-modal";
import type { PluginSettings } from "./types";

export default class MeridianPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("archive", "Open Meridian", () => {
      this.openUploadModal();
    });

    this.addCommand({
      id: "open-meridian-upload",
      name: "Open upload modal",
      callback: () => {
        this.openUploadModal();
      },
    });

    this.addSettingTab(new MeridianSettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<PluginSettings> & {
      indexFilePath?: string;
    };

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
        `Meridian: ${walletValid} Go to Settings > Meridian to configure your wallet.`
      );
      return;
    }

    if (!this.settings.indexes || this.settings.indexes.length === 0) {
      new Notice(
        "Meridian: No archive indexes configured. Go to Settings > Meridian."
      );
      return;
    }

    new UploadModal(this.app, this.settings, () => this.saveSettings()).open();
  }
}
