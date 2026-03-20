import { randomUUID } from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { App, Modal, Notice, setIcon } from "obsidian";
import { ArweaveService } from "./arweave-service";
import { IndexManager } from "./index-manager";
import type { ArweaveTag, DocumentRecord, IndexEntry, PluginSettings, VersionRecord } from "./types";

type UploadPhase = "select" | "tags" | "progress";
type ActiveTab = "upload" | "archive";

interface FsFile {
  path: string;
  name: string;
  size: number;
}

interface ResolvedFile {
  fsFile: FsFile;
  uuid: string;
  isNewDocument: boolean;
}

interface ResultEntry {
  resolvedFile: ResolvedFile;
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
    // fall through
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

function extractUuidFromFrontmatter(content: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const frontmatter = content.slice(3, end);
  const match = frontmatter.match(
    /^uuid:\s*([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*$/im
  );
  return match ? match[1] : null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export class UploadModal extends Modal {
  private settings: PluginSettings;
  private saveSettings: () => Promise<void>;
  private activeTab: ActiveTab = "upload";
  private uploadPhase: UploadPhase = "select";
  private selectedFiles: FsFile[] = [];
  private resolvedFiles: ResolvedFile[] = [];
  private sessionTags: ArweaveTag[] = [];
  private results: ResultEntry[] = [];

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

    const selectorBar = contentEl.createDiv("meridian-index-bar");
    selectorBar.createSpan({ cls: "meridian-index-label", text: "Index" });
    this.indexSelectorEl = selectorBar.createEl("select", { cls: "meridian-index-select" });
    this.rebuildIndexSelector();
    this.indexSelectorEl.addEventListener("change", async () => {
      this.settings.activeIndexId = this.indexSelectorEl.value;
      await this.saveSettings();
      if (this.activeTab === "archive") this.renderActiveTab();
    });

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
      const option = this.indexSelectorEl.createEl("option", {
        text: entry.name || entry.filePath,
      });
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
    this.tabContentEl.empty();
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
    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      nextBtn.setText("Checking...");
      try {
        await this.resolveFileVersions();
        this.uploadPhase = "tags";
        this.renderUploadTab();
      } catch (e) {
        nextBtn.disabled = false;
        nextBtn.setText("Next");
        new Notice(
          "Error checking file versions: " + (e instanceof Error ? e.message : String(e))
        );
      }
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

  private async resolveFileVersions(): Promise<void> {
    const indexManager = new IndexManager(this.app.vault, this.getActiveIndex().filePath);
    const index = await indexManager.readIndex();
    this.resolvedFiles = [];

    for (const fsFile of this.selectedFiles) {
      let uuid: string | null = null;
      let isNewDocument = true;

      // Try to extract UUID from frontmatter for markdown files
      if (fsFile.path.toLowerCase().endsWith(".md")) {
        try {
          const content = await fsPromises.readFile(fsFile.path, "utf-8");
          uuid = extractUuidFromFrontmatter(content);
        } catch {
          // ignore — treat as no UUID
        }
      }

      if (uuid) {
        // UUID found in frontmatter — look it up in the index
        const existingDoc = index.documents.find((d) => d.uuid === uuid);
        if (existingDoc) {
          isNewDocument = false;
          new Notice(
            `"${fsFile.name}" recognized as v${existingDoc.versions.length + 1} via frontmatter UUID.`
          );
        }
        // If not in index yet, this UUID becomes the new document's identifier
      } else {
        // No UUID — generate one, but first check if path matches an existing document
        uuid = randomUUID();
        const existingDoc = index.documents.find((d) => d.filePath === fsFile.path);
        if (existingDoc) {
          const lastUpload = existingDoc.versions[existingDoc.versions.length - 1];
          const confirmed = confirm(
            `"${fsFile.name}" was previously uploaded on ${shortDate(lastUpload.uploadedAt)}.\n\n` +
              `Add as v${existingDoc.versions.length + 1} of the same document?`
          );
          if (confirmed) {
            uuid = existingDoc.uuid;
            isNewDocument = false;
          }
        }
      }

      this.resolvedFiles.push({ fsFile, uuid: uuid!, isNewDocument });
    }
  }

  private buildTagsPhase(): void {
    const el = this.tabContentEl;
    const count = this.resolvedFiles.length;

    el.createEl("h2", { text: "Add Arweave tags" });
    el.createEl("p", {
      cls: "meridian-subtitle",
      text: `Key/value tags applied to all ${count} selected file${count === 1 ? "" : "s"}.`,
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
    btnRow.createEl("button", { text: "Back" }).addEventListener("click", () => {
      this.uploadPhase = "select";
      this.renderUploadTab();
    });
    btnRow.createEl("button", { text: "Upload", cls: "mod-cta" }).addEventListener("click", () => {
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
    summaryEl.setText(`0 / ${this.resolvedFiles.length} complete`);

    const resultsList = el.createDiv("upload-results");

    this.results = this.resolvedFiles.map((rf) => {
      const item = resultsList.createDiv("result-item");
      const statusEl = item.createSpan({ cls: "result-status pending", text: "Pending" });
      const infoEl = item.createDiv("result-info");
      const label = rf.isNewDocument ? rf.fsFile.name : `${rf.fsFile.name} (new version)`;
      infoEl.createDiv({ cls: "result-file", text: label });
      const detailEl = infoEl.createDiv({ cls: "result-txid" });
      return { resolvedFile: rf, status: "pending" as const, statusEl, detailEl };
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

    const indexManager = new IndexManager(this.app.vault, this.getActiveIndex().filePath);
    let successCount = 0;
    let errorCount = 0;
    let doneCount = 0;

    for (const resultEntry of this.results) {
      const { resolvedFile } = resultEntry;

      resultEntry.status = "uploading";
      if (resultEntry.statusEl) {
        resultEntry.statusEl.className = "result-status uploading";
        resultEntry.statusEl.setText("Uploading");
      }

      try {
        const buffer = await fsPromises.readFile(resolvedFile.fsFile.path);
        const result = await service.uploadFile(resolvedFile.fsFile.path, buffer, validTags);

        const version: VersionRecord = {
          txId: result.txId,
          gatewayUrl: result.gatewayUrl,
          contentType: result.contentType,
          fileSize: result.fileSize,
          tags: result.tags,
          uploadedAt: result.uploadedAt,
        };

        await indexManager.addOrAppendVersion(
          resolvedFile.uuid,
          resolvedFile.fsFile.path,
          resolvedFile.isNewDocument,
          version
        );

        resultEntry.status = "done";
        if (resultEntry.statusEl) {
          resultEntry.statusEl.className = "result-status done";
          resultEntry.statusEl.setText("Done");
        }
        if (resultEntry.detailEl) {
          resultEntry.detailEl.setText(result.txId);
          resultEntry.detailEl.title = result.gatewayUrl;
        }
        successCount++;
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
        errorCount++;
      }

      doneCount++;
      if (this._summaryEl) {
        this._summaryEl.setText(`${doneCount} / ${this.results.length} complete`);
      }
    }

    if (successCount > 0) {
      new Notice(
        `Meridian: ${successCount} file${successCount === 1 ? "" : "s"} uploaded and saved to index.`
      );
    }
    if (errorCount > 0) {
      new Notice(`Meridian: ${errorCount} file${errorCount === 1 ? "" : "s"} failed to upload.`);
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
      placeholder: "Search by filename, UUID, transaction ID, or tag...",
      cls: "meridian-search",
    });

    const countEl = el.createDiv({ cls: "meridian-archive-count" });
    const listEl = el.createDiv("meridian-archive-list");
    const indexManager = new IndexManager(this.app.vault, this.getActiveIndex().filePath);

    const loadAndRender = async (filter: string): Promise<void> => {
      listEl.empty();
      const index = await indexManager.readIndex();
      const query = filter.trim().toLowerCase();

      const docs = index.documents.filter((doc) => {
        if (!query) return true;
        if (doc.filePath.toLowerCase().includes(query)) return true;
        if (doc.uuid.toLowerCase().includes(query)) return true;
        return doc.versions.some(
          (v) =>
            v.txId.toLowerCase().includes(query) ||
            (v.tags ?? []).some(
              (t) => t[0].toLowerCase().includes(query) || t[1].toLowerCase().includes(query)
            )
        );
      });

      const total = index.documents.length;
      countEl.setText(
        query
          ? `${docs.length} of ${total} document${total === 1 ? "" : "s"}`
          : `${total} document${total === 1 ? "" : "s"}`
      );

      if (docs.length === 0) {
        listEl.createEl("p", {
          cls: "meridian-empty",
          text: query
            ? "No documents match your search."
            : "No documents archived yet. Upload files to get started.",
        });
        return;
      }

      const sorted = [...docs].sort((a, b) => {
        const aLatest = a.versions[a.versions.length - 1]?.uploadedAt ?? "";
        const bLatest = b.versions[b.versions.length - 1]?.uploadedAt ?? "";
        return bLatest.localeCompare(aLatest);
      });

      for (const doc of sorted) {
        this.renderDocumentRow(listEl, doc, indexManager, () =>
          loadAndRender(searchInput.value)
        );
      }
    };

    searchInput.addEventListener("input", () => loadAndRender(searchInput.value));
    loadAndRender("");
  }

  private renderDocumentRow(
    container: HTMLElement,
    doc: DocumentRecord,
    indexManager: IndexManager,
    onRefresh: () => void
  ): void {
    const filename = doc.filePath.split(/[/\\]/).pop() ?? doc.filePath;
    const latestVersion = doc.versions[doc.versions.length - 1];
    const versionCount = doc.versions.length;

    // Document header row
    const docRow = container.createDiv("meridian-doc-row");

    const chevronBtn = docRow.createEl("button", {
      cls: "meridian-chevron-btn",
      title: "Expand versions",
    });
    setIcon(chevronBtn, "chevron-right");

    const nameEl = docRow.createDiv({ cls: "meridian-col meridian-col-name", text: filename });
    nameEl.title = doc.filePath + `\nUUID: ${doc.uuid}`;

    const uuidEl = docRow.createDiv({ cls: "meridian-col meridian-col-uuid" });
    uuidEl.setText(doc.uuid.slice(0, 8) + "...");
    uuidEl.title = doc.uuid;

    docRow.createDiv({
      cls: "meridian-col meridian-col-versions",
      text: `${versionCount}v`,
    });

    docRow.createDiv({
      cls: "meridian-col meridian-col-date",
      text: latestVersion ? shortDate(latestVersion.uploadedAt) : "—",
    });

    const docActions = docRow.createDiv("meridian-archive-actions");
    const deleteDocBtn = docActions.createEl("button", {
      cls: "meridian-icon-btn meridian-icon-btn--danger",
      title: "Remove all versions from local index",
    });
    setIcon(deleteDocBtn, "trash-2");
    deleteDocBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = confirm(
        `Remove all ${versionCount} version${versionCount === 1 ? "" : "s"} of "${filename}" from the local index?\n\n` +
          `Arweave transactions are permanent and cannot be removed from the network.`
      );
      if (!confirmed) return;
      await indexManager.deleteDocument(doc.uuid);
      new Notice(`"${filename}" removed from index. Arweave transactions remain permanent.`);
      onRefresh();
    });

    // Versions container — hidden by default
    const versionsEl = container.createDiv({ cls: "meridian-doc-versions" });
    versionsEl.style.display = "none";

    const toggleExpand = (): void => {
      const isExpanded = versionsEl.style.display !== "none";
      versionsEl.style.display = isExpanded ? "none" : "block";
      chevronBtn.toggleClass("meridian-chevron--expanded", !isExpanded);
    };

    chevronBtn.addEventListener("click", toggleExpand);
    nameEl.style.cursor = "pointer";
    nameEl.addEventListener("click", toggleExpand);

    // Render versions — newest first
    const versionsNewestFirst = [...doc.versions].reverse();
    versionsNewestFirst.forEach((ver, idx) => {
      const versionNum = doc.versions.length - idx;
      const tagSummary =
        (ver.tags ?? []).length > 0
          ? "\n\nTags:\n" + ver.tags.map((t) => `  ${t[0]}: ${t[1]}`).join("\n")
          : "";

      const verRow = versionsEl.createDiv("meridian-version-row");

      verRow.createDiv({ cls: "meridian-version-num", text: `v${versionNum}` });

      const txEl = verRow.createDiv({ cls: "meridian-col meridian-col-txid" });
      txEl.setText(ver.txId.slice(0, 12) + "...");
      txEl.title = ver.txId + tagSummary;

      verRow.createDiv({ cls: "meridian-col meridian-col-date", text: shortDate(ver.uploadedAt) });

      const verActions = verRow.createDiv("meridian-archive-actions");

      const copyBtn = verActions.createEl("button", {
        cls: "meridian-icon-btn",
        title: "Copy transaction ID",
      });
      setIcon(copyBtn, "copy");
      copyBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(ver.txId);
        new Notice("Transaction ID copied.");
      });

      const openBtn = verActions.createEl("button", {
        cls: "meridian-icon-btn",
        title: "Open in Arweave gateway",
      });
      setIcon(openBtn, "external-link");
      openBtn.addEventListener("click", () => window.open(ver.gatewayUrl, "_blank"));

      const deleteVerBtn = verActions.createEl("button", {
        cls: "meridian-icon-btn meridian-icon-btn--danger",
        title: "Remove this version from local index",
      });
      setIcon(deleteVerBtn, "trash-2");
      deleteVerBtn.addEventListener("click", async () => {
        const confirmed = confirm(
          `Remove v${versionNum} of "${filename}" from the local index?\n\n` +
            `TX: ${ver.txId.slice(0, 12)}...\n\n` +
            `The Arweave transaction is permanent and cannot be removed from the network.`
        );
        if (!confirmed) return;
        await indexManager.deleteVersion(doc.uuid, ver.txId);
        new Notice(`v${versionNum} removed from index. The Arweave transaction remains permanent.`);
        onRefresh();
      });
    });
  }
}
