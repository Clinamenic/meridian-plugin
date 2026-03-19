import { App, Modal, Notice, TFile } from "obsidian";
import { ArweaveService } from "./arweave-service";
import { IndexManager } from "./index-manager";
import { parseAllowedExtensions } from "./settings";
import type { ArweaveTag, PluginSettings, UploadResult } from "./types";

type Phase = "select" | "tags" | "progress";

interface FileEntry {
  file: TFile;
  selected: boolean;
  checkboxEl?: HTMLInputElement;
}

interface ResultEntry {
  file: TFile;
  status: "pending" | "uploading" | "done" | "error";
  txId?: string;
  gatewayUrl?: string;
  error?: string;
  statusEl?: HTMLElement;
  txIdEl?: HTMLElement;
}

export class UploadModal extends Modal {
  private settings: PluginSettings;
  private phase: Phase = "select";
  private fileEntries: FileEntry[] = [];
  private sessionTags: ArweaveTag[] = [];
  private results: ResultEntry[] = [];
  private uploadResults: UploadResult[] = [];

  constructor(app: App, settings: PluginSettings) {
    super(app);
    this.settings = settings;
    this.modalEl.addClass("meridian-modal");
  }

  onOpen(): void {
    this.buildPhase();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private buildPhase(): void {
    this.contentEl.empty();
    if (this.phase === "select") this.buildSelectPhase();
    else if (this.phase === "tags") this.buildTagsPhase();
    else this.buildProgressPhase();
  }

  // -------------------------------------------------------------------------
  // Phase 1: File Selection
  // -------------------------------------------------------------------------

  private buildSelectPhase(): void {
    const { contentEl } = this;

    const header = contentEl.createDiv("phase-header");
    header.createEl("h2", { text: "Select files to upload" });
    header.createEl("p", {
      text: "Choose which vault files to archive on Arweave.",
    });

    const allowedExts = parseAllowedExtensions(this.settings.allowedExtensions);
    const allFiles = this.app.vault.getFiles().sort((a, b) =>
      a.path.localeCompare(b.path)
    );

    const visibleFiles = allFiles.filter((f) => {
      if (allowedExts.size === 0) return true;
      const ext = f.extension.toLowerCase();
      return allowedExts.has(ext);
    });

    if (visibleFiles.length === 0) {
      contentEl.createEl("p", {
        text: "No files match the current extension filter. Check your plugin settings.",
        cls: "mod-warning",
      });
      const btnRow = contentEl.createDiv("modal-button-container");
      btnRow.createEl("button", { text: "Close" }).addEventListener("click", () =>
        this.close()
      );
      return;
    }

    if (this.fileEntries.length === 0) {
      this.fileEntries = visibleFiles.map((f) => ({ file: f, selected: false }));
    }

    const controls = contentEl.createDiv("select-controls");
    const selectAllBtn = controls.createEl("button", { text: "Select all" });
    const deselectAllBtn = controls.createEl("button", { text: "Deselect all" });

    selectAllBtn.addEventListener("click", () => {
      this.fileEntries.forEach((entry) => {
        entry.selected = true;
        if (entry.checkboxEl) entry.checkboxEl.checked = true;
      });
      updateNextBtn();
    });

    deselectAllBtn.addEventListener("click", () => {
      this.fileEntries.forEach((entry) => {
        entry.selected = false;
        if (entry.checkboxEl) entry.checkboxEl.checked = false;
      });
      updateNextBtn();
    });

    const list = contentEl.createDiv("file-list");

    for (const entry of this.fileEntries) {
      const item = list.createDiv("file-list-item");
      const label = item.createEl("label");
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = entry.selected;
      entry.checkboxEl = checkbox;

      checkbox.addEventListener("change", () => {
        entry.selected = checkbox.checked;
        updateNextBtn();
      });

      label.createSpan({ text: entry.file.path, cls: "file-path" });
      label.createSpan({
        text: formatBytes(entry.file.stat.size),
        cls: "file-size",
      });
    }

    const btnRow = contentEl.createDiv("modal-button-container");
    const nextBtn = btnRow.createEl("button", {
      text: "Next",
      cls: "mod-cta",
    });
    nextBtn.disabled = true;

    const updateNextBtn = () => {
      nextBtn.disabled = !this.fileEntries.some((e) => e.selected);
    };

    nextBtn.addEventListener("click", () => {
      this.phase = "tags";
      this.buildPhase();
    });
  }

  // -------------------------------------------------------------------------
  // Phase 2: Tag Entry
  // -------------------------------------------------------------------------

  private buildTagsPhase(): void {
    const { contentEl } = this;

    const selected = this.fileEntries.filter((e) => e.selected);

    const header = contentEl.createDiv("phase-header");
    header.createEl("h2", { text: "Add Arweave tags" });
    header.createEl("p", {
      text: `These key/value tags will be attached to all ${selected.length} selected file${selected.length === 1 ? "" : "s"}.`,
    });

    const tagContainer = contentEl.createDiv("tag-container");

    if (this.sessionTags.length === 0) {
      this.sessionTags = [];
    }

    const renderTagRow = (tag: ArweaveTag, index: number): void => {
      const row = tagContainer.createDiv("tag-row");
      row.dataset.index = String(index);

      const keyInput = row.createEl("input", {
        type: "text",
        placeholder: "Key",
      });
      keyInput.value = tag.name;
      keyInput.addEventListener("input", () => {
        this.sessionTags[index].name = keyInput.value;
      });

      const valueInput = row.createEl("input", {
        type: "text",
        placeholder: "Value",
      });
      valueInput.value = tag.value;
      valueInput.addEventListener("input", () => {
        this.sessionTags[index].value = valueInput.value;
      });

      const removeBtn = row.createEl("button", {
        text: "Remove",
        cls: "tag-remove-btn",
      });
      removeBtn.addEventListener("click", () => {
        this.sessionTags.splice(index, 1);
        tagContainer.empty();
        this.sessionTags.forEach((t, i) => renderTagRow(t, i));
      });
    };

    this.sessionTags.forEach((tag, i) => renderTagRow(tag, i));

    const addTagBtn = contentEl.createEl("button", { text: "Add tag" });
    addTagBtn.addEventListener("click", () => {
      const newTag: ArweaveTag = { name: "", value: "" };
      this.sessionTags.push(newTag);
      renderTagRow(newTag, this.sessionTags.length - 1);
    });

    const btnRow = contentEl.createDiv("modal-button-container");

    const backBtn = btnRow.createEl("button", { text: "Back" });
    backBtn.addEventListener("click", () => {
      this.phase = "select";
      this.buildPhase();
    });

    const uploadBtn = btnRow.createEl("button", {
      text: "Upload",
      cls: "mod-cta",
    });
    uploadBtn.addEventListener("click", () => {
      this.phase = "progress";
      this.buildPhase();
      this.runUploads();
    });
  }

  // -------------------------------------------------------------------------
  // Phase 3: Upload Progress
  // -------------------------------------------------------------------------

  private buildProgressPhase(): void {
    const { contentEl } = this;
    const selected = this.fileEntries.filter((e) => e.selected);

    const header = contentEl.createDiv("phase-header");
    header.createEl("h2", { text: "Uploading to Arweave" });

    const summaryEl = contentEl.createDiv("summary-stats");
    summaryEl.setText(`0 / ${selected.length} complete`);

    const resultsList = contentEl.createDiv("upload-results");

    this.results = selected.map((entry) => {
      const item = resultsList.createDiv("result-item");
      const statusEl = item.createSpan({ cls: "result-status pending", text: "Pending" });
      const infoEl = item.createDiv("result-info");
      infoEl.createDiv({ cls: "result-file", text: entry.file.path });
      const txIdEl = infoEl.createDiv({ cls: "result-txid", text: "" });

      return {
        file: entry.file,
        status: "pending" as const,
        statusEl,
        txIdEl,
      };
    });

    const btnRow = contentEl.createDiv("modal-button-container");
    const closeBtn = btnRow.createEl("button", { text: "Close" });
    closeBtn.disabled = true;
    closeBtn.addEventListener("click", () => this.close());

    this._summaryEl = summaryEl;
    this._closeBtn = closeBtn;
  }

  private _summaryEl: HTMLElement | null = null;
  private _closeBtn: HTMLButtonElement | null = null;

  private async runUploads(): Promise<void> {
    const validTags = this.sessionTags.filter(
      (t) => t.name.trim() !== "" && t.value.trim() !== ""
    );

    let service: ArweaveService;
    try {
      service = new ArweaveService(
        this.settings.walletJwk,
        this.settings.defaultGateway
      );
    } catch (e) {
      new Notice("Failed to initialize Arweave client. Check your wallet JWK in settings.");
      if (this._closeBtn) this._closeBtn.disabled = false;
      return;
    }

    let doneCount = 0;

    for (const resultEntry of this.results) {
      resultEntry.status = "uploading";
      if (resultEntry.statusEl) {
        resultEntry.statusEl.className = "result-status uploading";
        resultEntry.statusEl.setText("Uploading");
      }

      try {
        const data = await this.app.vault.readBinary(resultEntry.file);
        const result = await service.uploadFile(
          resultEntry.file.path,
          data,
          validTags
        );

        resultEntry.status = "done";
        resultEntry.txId = result.txId;
        resultEntry.gatewayUrl = result.gatewayUrl;

        if (resultEntry.statusEl) {
          resultEntry.statusEl.className = "result-status done";
          resultEntry.statusEl.setText("Done");
        }
        if (resultEntry.txIdEl) {
          resultEntry.txIdEl.setText(result.txId);
          resultEntry.txIdEl.title = result.gatewayUrl;
        }

        this.uploadResults.push(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        resultEntry.status = "error";
        resultEntry.error = message;

        if (resultEntry.statusEl) {
          resultEntry.statusEl.className = "result-status error";
          resultEntry.statusEl.setText("Error");
        }
        if (resultEntry.txIdEl) {
          resultEntry.txIdEl.className = "result-error";
          resultEntry.txIdEl.setText(message);
        }

        this.uploadResults.push({
          filePath: resultEntry.file.path,
          txId: "",
          gatewayUrl: "",
          contentType: "",
          fileSize: resultEntry.file.stat.size,
          tags: validTags,
          uploadedAt: new Date().toISOString(),
          error: message,
        });
      }

      doneCount++;
      if (this._summaryEl) {
        this._summaryEl.setText(
          `${doneCount} / ${this.results.length} complete`
        );
      }
    }

    const successCount = this.uploadResults.filter((r) => !r.error).length;
    const errorCount = this.uploadResults.filter((r) => r.error).length;

    if (successCount > 0) {
      try {
        const indexManager = new IndexManager(
          this.app.vault,
          this.settings.indexFilePath
        );
        await indexManager.appendRecords(this.uploadResults);
        new Notice(
          `Meridian: ${successCount} file${successCount === 1 ? "" : "s"} uploaded and saved to index.`
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        new Notice(`Upload succeeded but failed to update index: ${message}`);
      }
    }

    if (errorCount > 0) {
      new Notice(
        `Meridian: ${errorCount} file${errorCount === 1 ? "" : "s"} failed to upload.`
      );
    }

    if (this._summaryEl) {
      this._summaryEl.setText(
        `Complete: ${successCount} uploaded, ${errorCount} failed.`
      );
    }

    if (this._closeBtn) this._closeBtn.disabled = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
