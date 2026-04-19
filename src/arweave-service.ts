import { requestUrl } from "obsidian";
import Arweave from "arweave/node";
import type { JWKInterface } from "arweave/node/lib/wallet";
import type { ArweaveTag, UploadResult } from "./types";
import type { PluginLogger } from "./logger";

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
    return this.doUploadFile(filePath, data, sessionTags);
  }

  private async doUploadFile(
    filePath: string,
    data: Uint8Array | ArrayBuffer,
    sessionTags: ArweaveTag[]
  ): Promise<UploadResult> {
    const contentType = inferContentType(filePath);
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

    this.logger.debug("uploadFile start", { filePath, contentType, byteLength: uint8.byteLength });

    // Fetch tx_anchor via requestUrl — bypasses arweave's HTTP layer entirely
    const anchorResp = await requestUrl({
      url: `${this.gateway}/tx_anchor`,
      throw: false,
    });
    if (anchorResp.status !== 200) {
      throw new Error(`Failed to fetch tx_anchor: HTTP ${anchorResp.status}`);
    }
    const last_tx = anchorResp.text.trim();
    this.logger.debug("tx_anchor", { value: last_tx.slice(0, 15) + "...", length: last_tx.length });

    // Fetch price via requestUrl
    const priceResp = await requestUrl({
      url: `${this.gateway}/price/${uint8.byteLength}`,
      throw: false,
    });
    if (priceResp.status !== 200) {
      throw new Error(`Failed to fetch price: HTTP ${priceResp.status}`);
    }
    const reward = priceResp.text.trim();
    this.logger.debug("reward", { reward });

    // Supply last_tx and reward directly so createTransaction makes no HTTP calls
    const tx = await this.arweave.createTransaction({ data: uint8, last_tx, reward }, this.jwk);

    this.logger.debug("Transaction created", {
      last_tx: tx.last_tx.slice(0, 15) + "...",
      reward: tx.reward,
      data_size: tx.data_size,
      format: tx.format,
      owner: tx.owner.slice(0, 15) + "...",
    });

    tx.addTag("Content-Type", contentType);
    for (const tag of sessionTags) {
      tx.addTag(tag.name, tag.value);
    }

    // Node crypto defaults to a max-length PSS salt; Arweave nodes expect salt length 32.
    await this.arweave.transactions.sign(tx, this.jwk, { saltLength: 32 });

    this.logger.debug("Transaction signed", {
      txId: tx.id,
      signatureLength: tx.signature.length,
      dataRoot: tx.data_root.slice(0, 15) + "...",
    });

    // Local sanity check — if this fails, the signing key or deepHash is wrong
    const locallyValid = await this.arweave.transactions
      .verify(tx)
      .catch((e: unknown) => {
        this.logger.debug("Local verify threw", String(e));
        return false;
      });
    this.logger.debug("Local transaction verification", { locallyValid });
    if (!locallyValid) {
      this.logger.error("Local transaction verification failed — check signing key");
    }

    // Post transaction via requestUrl — no arweave HTTP layer
    const totalChunks = tx.chunks?.chunks?.length ?? 1;
    this.logger.debug("Posting transaction", { gateway: this.gateway, totalChunks });

    if (totalChunks <= 1) {
      // Small file (≤ 256 KB): data included in the POST body
      await this.postTx(JSON.stringify(tx));
    } else {
      // Large file: post header without data, then upload each chunk
      const txHeader = { ...tx.toJSON(), data: "" };
      await this.postTx(JSON.stringify(txHeader));
      for (let i = 0; i < totalChunks; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunk = (tx as any).getChunk(i, uint8);
        await this.postChunk(JSON.stringify(chunk));
        this.logger.debug(`Chunk ${i + 1}/${totalChunks} posted`);
      }
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

  private async postTx(body: string): Promise<void> {
    this.logger.debug("POST /tx", { bodyLength: body.length, preview: body.slice(0, 80) });
    const resp = await requestUrl({
      url: `${this.gateway}/tx`,
      method: "POST",
      contentType: "application/json",
      body,
      throw: false,
    });
    this.logger.debug("POST /tx response", { status: resp.status, body: resp.text?.slice(0, 200) });
    if (resp.status !== 200 && resp.status !== 202) {
      this.logger.error("Upload failed — gateway response", {
        status: resp.status,
        body: resp.text,
      });
      const errMsg =
        (resp.json as Record<string, unknown> | null)?.error ??
        resp.text ??
        String(resp.status);
      throw new Error(`Transaction rejected with status ${resp.status}: ${errMsg}`);
    }
  }

  private async postChunk(body: string): Promise<void> {
    const resp = await requestUrl({
      url: `${this.gateway}/chunk`,
      method: "POST",
      contentType: "application/json",
      body,
      throw: false,
    });
    if (resp.status !== 200 && resp.status !== 202) {
      const errMsg =
        (resp.json as Record<string, unknown> | null)?.error ??
        resp.text ??
        String(resp.status);
      throw new Error(`Chunk rejected with status ${resp.status}: ${errMsg}`);
    }
  }

  async getAddressBalance(): Promise<string> {
    const address = await this.arweave.wallets.jwkToAddress(this.jwk);
    const resp = await requestUrl({
      url: `${this.gateway}/wallet/${address}/balance`,
      throw: false,
    });
    if (resp.status !== 200) {
      throw new Error(`Failed to fetch balance: HTTP ${resp.status}`);
    }
    return this.arweave.ar.winstonToAr(resp.text.trim());
  }

  async getWalletAddress(): Promise<string> {
    return this.arweave.wallets.jwkToAddress(this.jwk);
  }
}
