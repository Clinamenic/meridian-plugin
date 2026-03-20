import { App, Notice, PluginSettingTab, Setting, TextAreaComponent, setIcon } from "obsidian";
import type MeridianPlugin from "./main";
import type { IndexEntry, PluginSettings } from "./types";

export const DEFAULT_INDEX_ID = "default";

export const DEFAULT_SETTINGS: PluginSettings = {
  walletJwk: "",
  indexes: [{ id: DEFAULT_INDEX_ID, name: "Default", filePath: "meridian/index.json" }],
  activeIndexId: DEFAULT_INDEX_ID,
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

    // -------------------------------------------------------------------------
    // Wallet
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Archive indexes
    // -------------------------------------------------------------------------

    containerEl.createEl("h3", { text: "Archive Indexes" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Define one or more named index files. The active index is used by the modal and can be switched at any time.",
    });

    const indexListEl = containerEl.createDiv("meridian-settings-index-list");

    const renderIndexList = (): void => {
      indexListEl.empty();

      for (let i = 0; i < this.plugin.settings.indexes.length; i++) {
        const entry = this.plugin.settings.indexes[i];
        const isActive = this.plugin.settings.activeIndexId === entry.id;
        const row = indexListEl.createDiv({ cls: "meridian-settings-index-row" });

        const inputs = row.createDiv("meridian-settings-index-inputs");

        const nameInput = inputs.createEl("input", {
          type: "text",
          placeholder: "Name (e.g. Work)",
        });
        nameInput.value = entry.name;
        nameInput.addEventListener("change", async () => {
          this.plugin.settings.indexes[i].name = nameInput.value.trim();
          await this.plugin.saveSettings();
        });

        const pathInput = inputs.createEl("input", {
          type: "text",
          placeholder: "meridian/index.json",
        });
        pathInput.value = entry.filePath;
        pathInput.style.flex = "2";
        pathInput.addEventListener("change", async () => {
          this.plugin.settings.indexes[i].filePath = pathInput.value.trim();
          await this.plugin.saveSettings();
        });

        const actions = row.createDiv("meridian-settings-index-actions");

        if (isActive) {
          const badge = actions.createSpan({ cls: "meridian-active-badge", text: "Active" });
          badge.title = "This is the currently active index";
        } else {
          const setDefaultBtn = actions.createEl("button", { text: "Set active" });
          setDefaultBtn.addEventListener("click", async () => {
            this.plugin.settings.activeIndexId = entry.id;
            await this.plugin.saveSettings();
            renderIndexList();
          });
        }

        if (this.plugin.settings.indexes.length > 1) {
          const deleteBtn = actions.createEl("button", { cls: "meridian-settings-delete-btn" });
          deleteBtn.title = "Remove this index";
          setIcon(deleteBtn, "trash-2");
          deleteBtn.addEventListener("click", async () => {
            this.plugin.settings.indexes.splice(i, 1);
            if (this.plugin.settings.activeIndexId === entry.id) {
              this.plugin.settings.activeIndexId = this.plugin.settings.indexes[0].id;
            }
            await this.plugin.saveSettings();
            renderIndexList();
          });
        }
      }

      const addBtn = indexListEl.createEl("button", {
        text: "Add index",
        cls: "meridian-settings-add-btn",
      });
      addBtn.addEventListener("click", async () => {
        const newEntry: IndexEntry = {
          id: generateId(),
          name: "",
          filePath: "",
        };
        this.plugin.settings.indexes.push(newEntry);
        await this.plugin.saveSettings();
        renderIndexList();
      });
    };

    renderIndexList();

    // -------------------------------------------------------------------------
    // File filters
    // -------------------------------------------------------------------------

    containerEl.createEl("h3", { text: "File Filters" });

    new Setting(containerEl)
      .setName("Allowed file extensions")
      .setDesc(
        "Comma-separated list of extensions shown in the native file dialog filter (without leading dots). " +
          "Leave empty to allow all files."
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

    // -------------------------------------------------------------------------
    // Network
    // -------------------------------------------------------------------------

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

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
