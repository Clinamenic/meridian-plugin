import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { App, Modal, Notice, setIcon } from "obsidian";
import { ArweaveService } from "./arweave-service";
import { IndexManager } from "./index-manager";
import type { ArchiveRecord, ArweaveTag, IndexEntry, PluginSettings, UploadResult } from "./types";

type UploadPhase = "select" | "tags" | "progress";
type ActiveTab = "upload" | "archive";

interface FsFile {
  path: string;
  name: string;
  size: number;
}

interface ResultEntry {
  file: FsFile;
  status: "pending" | "uploading" | "done" | "error";
  statusEl?: HTMLElement;
  detailEl?: HTMLElement;
}

type ElectronDialog = {
  showOpenDialog: (
    opts: Record<string, unknown>
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
};

function getElectronDialog(): ElectronDialog | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).require("@electron/remote") as { dialog: ElectronDialog }).dialog;
  } catch {
    // fall through to legacy remote
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (window as any).require("electron") as {
      remote?: { dialog: ElectronDialog };
    };
    return electron.remote?.dialog ?? null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class UploadModal extends Modal {
  private settings: PluginSettings;
  private saveSettings: () => Promise<void>;
  private activeTab: ActiveTab = "upload";
  private uploadPhase: UploadPhase = "select";
  private selectedFiles: FsFile[] = [];
  private sessionTags: ArweaveTag[] = [];
  private results: ResultEntry[] = [];
  private uploadResults: UploadResult[] = [];

  private indexSelectorEl!: HTMLSelectElement;
  private tabContentEl!: HTMLElement;
  private uploadTabBtn!: HTMLElement;
  private archiveTabBtn!: HTMLElement;
  private _summaryEl: HTMLElement | null = null;
  private _progressCloseBtn: HTMLButtonElement | null = null;

  constructor(app: App, settings: PluginSettings, saveSettings: () => Promise<void>) {
    super(app);
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.modalEl.addClass("meridian-modal");
  }

  private getActiveIndex(): IndexEntry {
    const { indexes, activeIndexId } = this.settings;
    return indexes.find((e) => e.id === activeIndexId) ?? indexes[0];
  }

  onOpen(): void {
    const { contentEl } = this;

    // Index selector bar
    const selectorBar = contentEl.createDiv("meridian-index-bar");
    selectorBar.createSpan({ cls: "meridian-index-label", text: "Index" });
    this.indexSelectorEl = selectorBar.createEl("select", { cls: "meridian-index-select" });
    this.rebuildIndexSelector();
    this.indexSelectorEl.addEventListener("change", async () => {
      this.settings.activeIndexId = this.indexSelectorEl.value;
      await this.saveSettings();
      if (this.activeTab === "archive") this.renderActiveTab();
    });

    // Tab bar
    const tabBar = contentEl.createDiv("meridian-tab-bar");
    this.uploadTabBtn = tabBar.createDiv({ cls: "meridian-tab meridian-tab--active", text: "Upload" });
    this.archiveTabBtn = tabBar.createDiv({ cls: "meridian-tab", text: "Archive" });

    this.tabContentEl = contentEl.createDiv("meridian-tab-content");

    this.uploadTabBtn.addEventListener("click", () => this.switchTab("upload"));
    this.archiveTabBtn.addEventListener("click", () => this.switchTab("archive"));

    this.renderActiveTab();
  }

  private rebuildIndexSelector(): void {
    this.indexSelectorEl.empty();
    for (const entry of this.settings.indexes) {
      const option = this.indexSelectorEl.createEl("option", { text: entry.name || entry.filePath });
      option.value = entry.id;
      if (entry.id === this.settings.activeIndexId) option.selected = true;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private switchTab(tab: ActiveTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.uploadTabBtn.toggleClass("meridian-tab--active", tab === "upload");
    this.archiveTabBtn.toggleClass("meridian-tab--active", tab === "archive");
    this.renderActiveTab();
  }

  private renderActiveTab(): void {
    this.tabContentEl.empty();
    if (this.activeTab === "upload") this.renderUploadTab();
    else this.renderArchiveTab();
  }

  // ---------------------------------------------------------------------------
  // Upload tab
  // ---------------------------------------------------------------------------

  private renderUploadTab(): void {
    if (this.uploadPhase === "select") this.buildSelectPhase();
    else if (this.uploadPhase === "tags") this.buildTagsPhase();
    else this.buildProgressPhase();
  }

  private buildSelectPhase(): void {
    const el = this.tabContentEl;

    el.createEl("h2", { text: "Select files" });
    el.createEl("p", {
      cls: "meridian-subtitle",
      text: "Choose files from your filesystem to archive on Arweave.",
    });

    const browseBtn = el.createEl("button", {
      text: "Browse files...",
      cls: "mod-cta meridian-browse-btn",
    });
    browseBtn.addEventListener("click", () => this.openFileDialog());

    if (this.selectedFiles.length > 0) {
      const list = el.createDiv("meridian-selected-files");
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const f = this.selectedFiles[i];
        const item = list.createDiv("meridian-selected-item");
        const info = item.createDiv("meridian-selected-info");
        info.createDiv({ cls: "meridian-selected-name", text: f.name });
        info.createDiv({ cls: "meridian-selected-path", text: f.path });
        const right = item.createDiv("meridian-selected-right");
        right.createSpan({ cls: "file-size", text: formatBytes(f.size) });
        const removeBtn = right.createEl("button", { text: "Remove", cls: "meridian-remove-btn" });
        removeBtn.addEventListener("click", () => {
          this.selectedFiles.splice(i, 1);
          this.buildSelectPhase();
        });
      }
    }

    const btnRow = el.createDiv("modal-button-container");
    if (this.selectedFiles.length > 0) {
      btnRow.createSpan({
        cls: "meridian-count-label",
        text: `${this.selectedFiles.length} file${this.selectedFiles.length === 1 ? "" : "s"} selected`,
      });
    }
    const nextBtn = btnRow.createEl("button", { text: "Next", cls: "mod-cta" });
    nextBtn.disabled = this.selectedFiles.length === 0;
    nextBtn.addEventListener("click", () => {
      this.uploadPhase = "tags";
      this.renderUploadTab();
    });
  }

  private async openFileDialog(): Promise<void> {
    const dialog = getElectronDialog();
    if (!dialog) {
      new Notice("Could not access the system file dialog.");
      return;
    }

    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      title: "Select files to upload to Arweave",
    });

    if (result.canceled || result.filePaths.length === 0) return;

    for (const filePath of result.filePaths) {
      if (this.selectedFiles.some((f) => f.path === filePath)) continue;
      try {
        const stat = fs.statSync(filePath);
        this.selectedFiles.push({
          path: filePath,
          name: filePath.split(/[/\\]/).pop() ?? filePath,
          size: stat.size,
        });
      } catch {
        new Notice(`Could not read file info: ${filePath}`);
      }
    }

    this.buildSelectPhase();
  }

  private buildTagsPhase(): void {
    const el = this.tabContentEl;

    el.createEl("h2", { text: "Add Arweave tags" });
    el.createEl("p", {
      cls: "meridian-subtitle",
      text: `Key/value tags applied to all ${this.selectedFiles.length} selected file${this.selectedFiles.length === 1 ? "" : "s"}.`,
    });

    const tagContainer = el.createDiv("tag-container");

    const renderTagRow = (tag: ArweaveTag, index: number): void => {
      const row = tagContainer.createDiv("tag-row");

      const keyInput = row.createEl("input", { type: "text", placeholder: "Key" });
      keyInput.value = tag.name;
      keyInput.addEventListener("input", () => {
        this.sessionTags[index].name = keyInput.value;
      });

      const valueInput = row.createEl("input", { type: "text", placeholder: "Value" });
      valueInput.value = tag.value;
      valueInput.addEventListener("input", () => {
        this.sessionTags[index].value = valueInput.value;
      });

      const removeBtn = row.createEl("button", { text: "Remove", cls: "tag-remove-btn" });
      removeBtn.addEventListener("click", () => {
        this.sessionTags.splice(index, 1);
        tagContainer.empty();
        this.sessionTags.forEach((t, i) => renderTagRow(t, i));
      });
    };

    this.sessionTags.forEach((tag, i) => renderTagRow(tag, i));

    const addTagBtn = el.createEl("button", { text: "Add tag", cls: "meridian-add-tag-btn" });
    addTagBtn.addEventListener("click", () => {
      const newTag: ArweaveTag = { name: "", value: "" };
      this.sessionTags.push(newTag);
      renderTagRow(newTag, this.sessionTags.length - 1);
    });

    const btnRow = el.createDiv("modal-button-container");
    const backBtn = btnRow.createEl("button", { text: "Back" });
    backBtn.addEventListener("click", () => {
      this.uploadPhase = "select";
      this.renderUploadTab();
    });

    const uploadBtn = btnRow.createEl("button", { text: "Upload", cls: "mod-cta" });
    uploadBtn.addEventListener("click", () => {
      this.uploadPhase = "progress";
      this.renderUploadTab();
      this.runUploads();
    });
  }

  private buildProgressPhase(): void {
    const el = this.tabContentEl;
    this.indexSelectorEl.disabled = true;

    el.createEl("h2", { text: "Uploading to Arweave" });

    const summaryEl = el.createDiv({ cls: "summary-stats" });
    summaryEl.setText(`0 / ${this.selectedFiles.length} complete`);

    const resultsList = el.createDiv("upload-results");

    this.results = this.selectedFiles.map((file) => {
      const item = resultsList.createDiv("result-item");
      const statusEl = item.createSpan({ cls: "result-status pending", text: "Pending" });
      const infoEl = item.createDiv("result-info");
      infoEl.createDiv({ cls: "result-file", text: file.name });
      const detailEl = infoEl.createDiv({ cls: "result-txid" });
      return { file, status: "pending" as const, statusEl, detailEl };
    });

    const btnRow = el.createDiv("modal-button-container");
    const closeBtn = btnRow.createEl("button", { text: "Close" });
    closeBtn.disabled = true;
    closeBtn.addEventListener("click", () => this.close());

    this._summaryEl = summaryEl;
    this._progressCloseBtn = closeBtn;
  }

  private async runUploads(): Promise<void> {
    const validTags = this.sessionTags.filter(
      (t) => t.name.trim() !== "" && t.value.trim() !== ""
    );

    let service: ArweaveService;
    try {
      service = new ArweaveService(this.settings.walletJwk, this.settings.defaultGateway);
    } catch {
      new Notice("Failed to initialize Arweave client. Check your wallet JWK in settings.");
      if (this._progressCloseBtn) this._progressCloseBtn.disabled = false;
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
        const buffer = await fsPromises.readFile(resultEntry.file.path);
        const result = await service.uploadFile(resultEntry.file.path, buffer, validTags);

        resultEntry.status = "done";
        if (resultEntry.statusEl) {
          resultEntry.statusEl.className = "result-status done";
          resultEntry.statusEl.setText("Done");
        }
        if (resultEntry.detailEl) {
          resultEntry.detailEl.setText(result.txId);
          resultEntry.detailEl.title = result.gatewayUrl;
        }
        this.uploadResults.push(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        resultEntry.status = "error";
        if (resultEntry.statusEl) {
          resultEntry.statusEl.className = "result-status error";
          resultEntry.statusEl.setText("Error");
        }
        if (resultEntry.detailEl) {
          resultEntry.detailEl.className = "result-error";
          resultEntry.detailEl.setText(message);
        }
        this.uploadResults.push({
          filePath: resultEntry.file.path,
          txId: "",
          gatewayUrl: "",
          contentType: "",
          fileSize: resultEntry.file.size,
          tags: validTags.map((t): [string, string] => [t.name, t.value]),
          uploadedAt: new Date().toISOString(),
          error: message,
        });
      }

      doneCount++;
      if (this._summaryEl) {
        this._summaryEl.setText(`${doneCount} / ${this.results.length} complete`);
      }
    }

    const successCount = this.uploadResults.filter((r) => !r.error).length;
    const errorCount = this.uploadResults.filter((r) => r.error).length;

    if (successCount > 0) {
      try {
        const indexManager = new IndexManager(this.app.vault, this.getActiveIndex().filePath);
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
      this._summaryEl.setText(`Complete: ${successCount} uploaded, ${errorCount} failed.`);
    }

    if (this._progressCloseBtn) this._progressCloseBtn.disabled = false;
    this.indexSelectorEl.disabled = false;
  }

  // ---------------------------------------------------------------------------
  // Archive tab
  // ---------------------------------------------------------------------------

  private renderArchiveTab(): void {
    const el = this.tabContentEl;

    el.createEl("h2", { text: "Archive" });

    const searchInput = el.createEl("input", {
      type: "text",
      placeholder: "Search by filename, transaction ID, or tag...",
      cls: "meridian-search",
    });

    const countEl = el.createDiv({ cls: "meridian-archive-count" });
    const listEl = el.createDiv("meridian-archive-list");

    const indexManager = new IndexManager(this.app.vault, this.getActiveIndex().filePath);

    const loadAndRender = async (filter: string): Promise<void> => {
      listEl.empty();
      const index = await indexManager.readIndex();
      const query = filter.trim().toLowerCase();

      const records = index.records.filter((r) => {
        if (!query) return true;
        if (r.filePath.toLowerCase().includes(query)) return true;
        if (r.txId.toLowerCase().includes(query)) return true;
        if (r.tags.some((t) =>
          t[0].toLowerCase().includes(query) || t[1].toLowerCase().includes(query)
        )) return true;
        return false;
      });

      const total = index.records.length;
      countEl.setText(
        query
          ? `${records.length} of ${total} record${total === 1 ? "" : "s"}`
          : `${total} record${total === 1 ? "" : "s"}`
      );

      if (records.length === 0) {
        listEl.createEl("p", {
          cls: "meridian-empty",
          text: query
            ? "No records match your search."
            : "No records in the archive yet. Upload files to get started.",
        });
        return;
      }

      const sorted = [...records].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      for (const record of sorted) {
        this.renderArchiveRecord(listEl, record, async () => {
          const confirmed = confirm(
            `Remove this record from the local index?\n\n"${record.filePath}"\n\nNote: the Arweave transaction (${record.txId.slice(0, 12)}...) is permanent and cannot be removed from the network.`
          );
          if (!confirmed) return;
          await indexManager.deleteRecord(record.txId);
          new Notice("Record removed from local index. The Arweave transaction remains permanent.");
          loadAndRender(searchInput.value);
        });
      }
    };

    searchInput.addEventListener("input", () => loadAndRender(searchInput.value));
    loadAndRender("");
  }

  private renderArchiveRecord(
    container: HTMLElement,
    record: ArchiveRecord,
    onDelete: () => void
  ): void {
    const filename = record.filePath.split(/[/\\]/).pop() ?? record.filePath;
    const shortTxId = record.txId.slice(0, 12) + "...";
    const date = new Date(record.uploadedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const tagSummary =
      record.tags.length > 0
        ? "\n\nTags:\n" +
          record.tags.map((t) => `  ${t[0]}: ${t[1]}`).join("\n")
        : "";

    const item = container.createDiv("meridian-archive-item");

    const nameEl = item.createDiv({ cls: "meridian-col meridian-col-name", text: filename });
    nameEl.title = record.filePath + tagSummary;

    const txEl = item.createDiv({ cls: "meridian-col meridian-col-txid", text: shortTxId });
    txEl.title = record.txId;

    item.createDiv({ cls: "meridian-col meridian-col-date", text: date });

    const actions = item.createDiv("meridian-archive-actions");

    const copyBtn = actions.createEl("button", { cls: "meridian-icon-btn", title: "Copy transaction ID" });
    setIcon(copyBtn, "copy");
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(record.txId);
      new Notice("Transaction ID copied.");
    });

    const openBtn = actions.createEl("button", { cls: "meridian-icon-btn", title: "Open in Arweave gateway" });
    setIcon(openBtn, "external-link");
    openBtn.addEventListener("click", () => {
      window.open(record.gatewayUrl, "_blank");
    });

    const deleteBtn = actions.createEl("button", {
      cls: "meridian-icon-btn meridian-icon-btn--danger",
      title: "Remove from local index",
    });
    setIcon(deleteBtn, "trash-2");
    deleteBtn.addEventListener("click", onDelete);
  }
}
