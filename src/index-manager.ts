import { randomUUID } from "crypto";
import type { Vault } from "obsidian";
import type { ArchiveIndex, DocumentRecord, VersionRecord } from "./types";

const INDEX_VERSION = 2;

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
      return { version: INDEX_VERSION, documents: [] };
    }
    try {
      const content = await this.vault.read(file);
      const raw = JSON.parse(content) as Record<string, unknown>;
      return this.migrate(raw);
    } catch {
      return { version: INDEX_VERSION, documents: [] };
    }
  }

  async addOrAppendVersion(
    uuid: string,
    filePath: string,
    isNewDocument: boolean,
    version: VersionRecord
  ): Promise<void> {
    const index = await this.readIndex();

    if (isNewDocument) {
      index.documents.push({ uuid, filePath, versions: [version] });
    } else {
      const doc = index.documents.find((d) => d.uuid === uuid);
      if (doc) {
        doc.filePath = filePath;
        doc.versions.push(version);
      } else {
        index.documents.push({ uuid, filePath, versions: [version] });
      }
    }

    await this.writeIndex(index);
  }

  async deleteVersion(uuid: string, txId: string): Promise<void> {
    const index = await this.readIndex();
    const docIdx = index.documents.findIndex((d) => d.uuid === uuid);
    if (docIdx === -1) return;

    const doc = index.documents[docIdx];
    doc.versions = doc.versions.filter((v) => v.txId !== txId);

    if (doc.versions.length === 0) {
      index.documents.splice(docIdx, 1);
    }

    await this.writeIndex(index);
  }

  async deleteDocument(uuid: string): Promise<void> {
    const index = await this.readIndex();
    index.documents = index.documents.filter((d) => d.uuid !== uuid);
    await this.writeIndex(index);
  }

  async updateDocumentLabel(uuid: string, label: string): Promise<void> {
    const index = await this.readIndex();
    const doc = index.documents.find((d) => d.uuid === uuid);
    if (!doc) return;
    if (label.trim() === "") {
      delete doc.label;
    } else {
      doc.label = label.trim();
    }
    await this.writeIndex(index);
  }

  private migrate(raw: Record<string, unknown>): ArchiveIndex {
    if (raw.version === INDEX_VERSION && Array.isArray(raw.documents)) {
      return raw as unknown as ArchiveIndex;
    }

    // Migrate from v1 flat records array
    const v1Records = Array.isArray(raw.records) ? raw.records : [];
    const documents: DocumentRecord[] = (
      v1Records as Record<string, unknown>[]
    ).map((r) => ({
      uuid: randomUUID(),
      filePath: String(r.filePath ?? ""),
      versions: [
        {
          txId: String(r.txId ?? ""),
          gatewayUrl: String(r.gatewayUrl ?? ""),
          contentType: String(r.contentType ?? ""),
          fileSize: Number(r.fileSize ?? 0),
          tags: Array.isArray(r.tags) ? (r.tags as [string, string][]) : [],
          uploadedAt: String(r.uploadedAt ?? new Date().toISOString()),
        },
      ],
    }));

    return { version: INDEX_VERSION, documents };
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
