import Arweave from "arweave";
import type { JWKInterface } from "arweave/node/lib/wallet";
import type { ArweaveTag, UploadResult } from "./types";

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

  constructor(jwkJson: string, gateway: string) {
    this.jwk = JSON.parse(jwkJson) as JWKInterface;
    this.gateway = gateway.replace(/\/$/, "");

    const url = new URL(gateway);
    this.arweave = Arweave.init({
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80,
      protocol: url.protocol.replace(":", "") as "https" | "http",
    });
  }

  async uploadFile(
    filePath: string,
    data: Uint8Array | ArrayBuffer,
    sessionTags: ArweaveTag[]
  ): Promise<UploadResult> {
    const contentType = inferContentType(filePath);
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

    const tx = await this.arweave.createTransaction({ data: uint8 }, this.jwk);

    tx.addTag("Content-Type", contentType);
    for (const tag of sessionTags) {
      tx.addTag(tag.name, tag.value);
    }

    await this.arweave.transactions.sign(tx, this.jwk);

    const response = await this.arweave.transactions.post(tx);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(
        `Transaction rejected with status ${response.status}: ${response.statusText}`
      );
    }

    const allTags: [string, string][] = [
      ["Content-Type", contentType],
      ...sessionTags.map((t): [string, string] => [t.name, t.value]),
    ];

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
    const address = await this.arweave.wallets.jwkToAddress(this.jwk);
    const winstons = await this.arweave.wallets.getBalance(address);
    return this.arweave.ar.winstonToAr(winstons);
  }

  async getWalletAddress(): Promise<string> {
    return this.arweave.wallets.jwkToAddress(this.jwk);
  }
}
