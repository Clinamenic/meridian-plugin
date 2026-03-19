export interface ArweaveTag {
  name: string;
  value: string;
}

export interface UploadResult {
  filePath: string;
  txId: string;
  gatewayUrl: string;
  contentType: string;
  fileSize: number;
  tags: ArweaveTag[];
  uploadedAt: string;
  error?: string;
}

export interface ArchiveRecord {
  filePath: string;
  txId: string;
  gatewayUrl: string;
  contentType: string;
  fileSize: number;
  tags: ArweaveTag[];
  uploadedAt: string;
}

export interface ArchiveIndex {
  version: number;
  records: ArchiveRecord[];
}

export interface PluginSettings {
  walletJwk: string;
  indexFilePath: string;
  allowedExtensions: string;
  defaultGateway: string;
}
