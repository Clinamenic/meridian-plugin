import { App, Notice, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import type MeridianPlugin from "./main";
import type { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  walletJwk: "",
  indexFilePath: "meridian/index.json",
  allowedExtensions: "md,pdf,png,jpg,jpeg,gif,webp,mp4,mp3,txt,csv,json",
  defaultGateway: "https://arweave.net",
};

export class MeridianSettingTab extends PluginSettingTab {
  plugin: MeridianPlugin;

  constructor(app: App, plugin: MeridianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Meridian" });

    new Setting(containerEl)
      .setName("Arweave wallet (JWK)")
      .setDesc(
        "Paste the full contents of your Arweave wallet JSON file. " +
          "This key is stored in your plugin data and used to sign transactions."
      )
      .addTextArea((text: TextAreaComponent) => {
        text
          .setPlaceholder('{"kty":"RSA","n":"..."}')
          .setValue(this.plugin.settings.walletJwk)
          .onChange(async (value) => {
            this.plugin.settings.walletJwk = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
        text.inputEl.style.fontFamily = "var(--font-monospace)";
        text.inputEl.style.fontSize = "var(--font-ui-smaller)";
      });

    new Setting(containerEl)
      .setName("Validate wallet")
      .setDesc("Check that the pasted JWK is valid JSON with the expected fields.")
      .addButton((btn) =>
        btn.setButtonText("Validate").onClick(() => {
          const result = validateJwk(this.plugin.settings.walletJwk);
          if (result === true) {
            new Notice("Wallet JWK is valid.");
          } else {
            new Notice(`Invalid wallet: ${result}`);
          }
        })
      );

    containerEl.createEl("h3", { text: "Archive Index" });

    new Setting(containerEl)
      .setName("Index file path")
      .setDesc(
        "Vault-relative path where the JSON archive index will be stored. " +
          "The parent folder will be created automatically if it does not exist."
      )
      .addText((text) =>
        text
          .setPlaceholder("meridian/index.json")
          .setValue(this.plugin.settings.indexFilePath)
          .onChange(async (value) => {
            this.plugin.settings.indexFilePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "File Filters" });

    new Setting(containerEl)
      .setName("Allowed file extensions")
      .setDesc(
        "Comma-separated list of extensions to show in the upload modal (without leading dots). " +
          "Leave empty to show all files."
      )
      .addText((text) =>
        text
          .setPlaceholder("md,pdf,png,jpg")
          .setValue(this.plugin.settings.allowedExtensions)
          .onChange(async (value) => {
            this.plugin.settings.allowedExtensions = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Network" });

    new Setting(containerEl)
      .setName("Arweave gateway URL")
      .setDesc(
        "Base URL of the Arweave gateway used to construct file links after upload."
      )
      .addText((text) =>
        text
          .setPlaceholder("https://arweave.net")
          .setValue(this.plugin.settings.defaultGateway)
          .onChange(async (value) => {
            this.plugin.settings.defaultGateway = value.trim().replace(/\/$/, "");
            await this.plugin.saveSettings();
          })
      );
  }
}

export function validateJwk(raw: string): true | string {
  if (!raw || raw.trim() === "") {
    return "No wallet JWK has been provided.";
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Content is not valid JSON.";
  }
  if (parsed.kty !== "RSA") {
    return 'Expected "kty" field to be "RSA".';
  }
  const required = ["n", "e", "d", "p", "q", "dp", "dq", "qi"];
  for (const key of required) {
    if (!parsed[key]) {
      return `Missing required field "${key}".`;
    }
  }
  return true;
}

export function parseAllowedExtensions(raw: string): Set<string> {
  if (!raw || raw.trim() === "") return new Set();
  return new Set(
    raw
      .split(",")
      .map((ext) => ext.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean)
  );
}
