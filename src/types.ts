export interface ArweaveTag {
  name: string;
  value: string;
}

export interface VersionRecord {
  txId: string;
  gatewayUrl: string;
  contentType: string;
  fileSize: number;
  tags: [string, string][];
  uploadedAt: string;
}

export interface DocumentRecord {
  uuid: string;
  filePath: string;
  versions: VersionRecord[];
}

export interface ArchiveIndex {
  version: number;
  documents: DocumentRecord[];
}

export interface UploadResult {
  filePath: string;
  txId: string;
  gatewayUrl: string;
  contentType: string;
  fileSize: number;
  tags: [string, string][];
  uploadedAt: string;
}

export interface IndexEntry {
  id: string;
  name: string;
  filePath: string;
}

export interface PluginSettings {
  walletJwk: string;
  indexes: IndexEntry[];
  activeIndexId: string;
  allowedExtensions: string;
  defaultGateway: string;
}
