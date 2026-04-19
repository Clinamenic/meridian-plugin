import { requestUrl } from "obsidian";

/**
 * A fetch-compatible function that routes requests through Obsidian's requestUrl
 * to bypass CORS restrictions in Obsidian's Electron renderer process.
 *
 * The arweave library's api.js calls the global fetch directly. This replacement
 * is swapped in for the duration of any ArweaveService network call so all HTTP
 * traffic goes through Electron's net module, which has no same-origin policy.
 */
export async function corsFreeFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      (init.headers as [string, string][]).forEach(([k, v]) => {
        headers[k] = v;
      });
    } else {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }

  let body: string | ArrayBuffer | undefined;
  const rawBody = init?.body;
  if (rawBody !== null && rawBody !== undefined) {
    if (typeof rawBody === "string") {
      body = rawBody;
    } else if (rawBody instanceof ArrayBuffer) {
      body = rawBody;
    } else if (rawBody instanceof Uint8Array) {
      body = rawBody.buffer as ArrayBuffer;
    }
  }

  const resp = await requestUrl({ url, method, headers, body, throw: false });

  // Return a proper Response so callers can use .json(), .text(), .clone(), etc.
  return new Response(resp.arrayBuffer, {
    status: resp.status,
    headers: new Headers(resp.headers),
  });
}
