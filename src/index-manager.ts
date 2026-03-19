import type { Vault } from "obsidian";
import type { ArchiveIndex, ArchiveRecord, UploadResult } from "./types";

const INDEX_VERSION = 1;

export class IndexManager {
  private vault: Vault;
  private indexFilePath: string;

  constructor(vault: Vault, indexFilePath: string) {
    this.vault = vault;
    this.indexFilePath = indexFilePath;
  }

  async readIndex(): Promise<ArchiveIndex> {
    const file = this.vault.getFileByPath(this.indexFilePath);
    if (!file) {
      return { version: INDEX_VERSION, records: [] };
    }
    try {
      const content = await this.vault.read(file);
      const parsed = JSON.parse(content) as Partial<ArchiveIndex>;
      return {
        version: parsed.version ?? INDEX_VERSION,
        records: Array.isArray(parsed.records) ? parsed.records : [],
      };
    } catch {
      return { version: INDEX_VERSION, records: [] };
    }
  }

  async appendRecords(results: UploadResult[]): Promise<void> {
    const successfulResults = results.filter((r) => !r.error);
    if (successfulResults.length === 0) return;

    const newRecords: ArchiveRecord[] = successfulResults.map((r) => ({
      filePath: r.filePath,
      txId: r.txId,
      gatewayUrl: r.gatewayUrl,
      contentType: r.contentType,
      fileSize: r.fileSize,
      tags: r.tags,
      uploadedAt: r.uploadedAt,
    }));

    const index = await this.readIndex();
    index.records.push(...newRecords);

    await this.writeIndex(index);
  }

  private async writeIndex(index: ArchiveIndex): Promise<void> {
    const content = JSON.stringify(index, null, 2);

    await this.ensureParentFolder();

    const existingFile = this.vault.getFileByPath(this.indexFilePath);
    if (existingFile) {
      await this.vault.modify(existingFile, content);
    } else {
      await this.vault.create(this.indexFilePath, content);
    }
  }

  private async ensureParentFolder(): Promise<void> {
    const parts = this.indexFilePath.split("/");
    if (parts.length <= 1) return;

    const folderPath = parts.slice(0, -1).join("/");
    if (!this.vault.getFolderByPath(folderPath)) {
      await this.vault.createFolder(folderPath);
    }
  }
}
