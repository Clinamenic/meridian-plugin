import { Notice, Plugin } from "obsidian";
import { MeridianSettingTab, DEFAULT_SETTINGS, validateJwk } from "./settings";
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
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
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

    if (!this.settings.indexFilePath.trim()) {
      new Notice(
        "Meridian: No index file path configured. Go to Settings > Meridian."
      );
      return;
    }

    new UploadModal(this.app, this.settings).open();
  }
}
