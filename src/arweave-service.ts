import Arweave from "arweave";
import type { JWKInterface } from "arweave/node/lib/wallet";
import type { ArweaveTag, UploadResult } from "./types";
import type { PluginLogger } from "./logger";
import { corsFreeFetch } from "./cors-fetch";

const MIME_MAP: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "application/typescript",
  json: "application/json",
  xml: "application/xml",
  pdf: "application/pdf",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function inferContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export class ArweaveService {
  private arweave: Arweave;
  private jwk: JWKInterface;
  private gateway: string;
  private logger: PluginLogger;

  constructor(jwkJson: string, gateway: string, logger: PluginLogger) {
    this.jwk = JSON.parse(jwkJson) as JWKInterface;
    this.gateway = gateway.replace(/\/$/, "");
    this.logger = logger;

    const url = new URL(gateway);
    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
    const protocol = url.protocol.replace(":", "") as "https" | "http";

    this.logger.debug("ArweaveService init", { host, port, protocol });

    this.arweave = Arweave.init({ host, port, protocol });
  }

  async uploadFile(
    filePath: string,
    data: Uint8Array | ArrayBuffer,
    sessionTags: ArweaveTag[]
  ): Promise<UploadResult> {
    return this.withCorsSafeFetch(() => this.doUploadFile(filePath, data, sessionTags));
  }

  private async doUploadFile(
    filePath: string,
    data: Uint8Array | ArrayBuffer,
    sessionTags: ArweaveTag[]
  ): Promise<UploadResult> {
    const contentType = inferContentType(filePath);
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

    this.logger.debug("uploadFile start", { filePath, contentType, byteLength: uint8.byteLength });

    const walletAddress = await this.arweave.wallets.jwkToAddress(this.jwk);
    this.logger.debug("Wallet address", walletAddress);

    const tx = await this.arweave.createTransaction({ data: uint8 }, this.jwk);

    this.logger.debug("Transaction created", {
      last_tx: tx.last_tx,
      reward: tx.reward,
      data_size: tx.data_size,
      format: tx.format,
    });

    tx.addTag("Content-Type", contentType);
    for (const tag of sessionTags) {
      tx.addTag(tag.name, tag.value);
    }

    const saltLength = 32;
    this.logger.debug("Signing transaction", { saltLength });

    // Node crypto defaults to a max-length PSS salt; Arweave nodes expect salt length 32 (same as WebCrypto in arweave/web).
    await this.arweave.transactions.sign(tx, this.jwk, { saltLength });

    this.logger.debug("Transaction signed", { txId: tx.id });
    this.logger.debug("Posting transaction to gateway", this.gateway);

    const response = await this.arweave.transactions.post(tx);

    this.logger.debug("Gateway response", {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    });

    if (response.status !== 200 && response.status !== 202) {
      const bodyError =
        typeof response.data === "object" && response.data !== null
          ? (response.data as Record<string, unknown>).error ?? JSON.stringify(response.data)
          : String(response.data ?? "");
      throw new Error(
        `Transaction rejected with status ${response.status}: ${response.statusText}${bodyError ? ` — ${bodyError}` : ""}`
      );
    }

    const allTags: [string, string][] = [
      ["Content-Type", contentType],
      ...sessionTags.map((t): [string, string] => [t.name, t.value]),
    ];

    this.logger.debug("Upload succeeded", { txId: tx.id });

    return {
      filePath,
      txId: tx.id,
      gatewayUrl: `${this.gateway}/${tx.id}`,
      contentType,
      fileSize: data.byteLength,
      tags: allTags,
      uploadedAt: new Date().toISOString(),
    };
  }

  async getAddressBalance(): Promise<string> {
    return this.withCorsSafeFetch(async () => {
      const address = await this.arweave.wallets.jwkToAddress(this.jwk);
      const winstons = await this.arweave.wallets.getBalance(address);
      return this.arweave.ar.winstonToAr(winstons);
    });
  }

  async getWalletAddress(): Promise<string> {
    return this.arweave.wallets.jwkToAddress(this.jwk);
  }

  private async withCorsSafeFetch<T>(fn: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = corsFreeFetch as unknown as typeof globalThis.fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  }
}
