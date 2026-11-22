export interface ContentProgress {
  readonly url: string;
  readonly received: number;
  readonly total: number;
}

const CHUNK_SIZE = 256 * 1024;
const REQUEST_TIMEOUT = 30_000;
const listeners = new Set<(progress: ContentProgress) => void>();
let activeRequests = 0;
const waitingRequests: (() => void)[] = [];

async function acquireRequest(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (activeRequests < 2) {
    activeRequests++;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const ready = (): void => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = (): void => {
      const index = waitingRequests.indexOf(ready);
      if (index >= 0) waitingRequests.splice(index, 1);
      reject(signal.reason);
    };
    waitingRequests.push(ready);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function releaseRequest(): void {
  const next = waitingRequests.shift();
  if (next) next();
  else activeRequests--;
}

export function subscribeContentProgress(listener: (progress: ContentProgress) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function progress(url: string, received: number, total: number): void {
  for (const listener of listeners) listener({ url, received, total });
}

function rangeHeader(response: Response, start: number): { end: number; total: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
  if (!match) throw new Error('资源分段响应缺少有效的 Content-Range。');
  const actualStart = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
  if (!Number.isSafeInteger(total) || total <= 0 || actualStart !== start ||
    end !== Math.min(start + CHUNK_SIZE - 1, total - 1)) {
    throw new Error('资源分段范围与请求不一致。');
  }
  return { end, total };
}

export async function loadResource(url: URL | string): Promise<ArrayBuffer> {
  const href = String(url);
  const controller = new AbortController();
  async function request(start: number, ranged: boolean): Promise<{ response: Response; bytes: Uint8Array<ArrayBuffer> }> {
    await acquireRequest(controller.signal);
    try {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
      const signal = AbortSignal.any([controller.signal, timeout]);
      const response = await fetch(href, {
        signal,
        ...(ranged ? { headers: { Range: `bytes=${start}-${start + CHUNK_SIZE - 1}` } } : {})
      });
      if (!response.ok) throw new Error(`资源读取失败：HTTP ${response.status}，${href}`);
      return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
    } finally {
      releaseRequest();
    }
  }
  try {
    const ranged = /^https?:/i.test(href);
    const first = await request(0, ranged);
    if (first.response.status === 200) {
      const length = first.response.headers.get('Content-Length');
      if (length && !first.response.headers.has('Content-Encoding') && Number(length) !== first.bytes.length) {
        throw new Error('资源响应长度不完整。');
      }
      progress(href, first.bytes.length, first.bytes.length);
      return first.bytes.buffer;
    }
    if (first.response.status !== 206) throw new Error(`不支持的资源响应：HTTP ${first.response.status}`);
    const { end, total } = rangeHeader(first.response, 0);
    if (first.bytes.length !== end + 1) throw new Error('资源首段长度不完整。');
    const result = new Uint8Array(total);
    result.set(first.bytes);
    let received = first.bytes.length;
    let next = end + 1;
    progress(href, received, total);
    async function worker(): Promise<void> {
      while (next < total) {
        const start = next;
        next += CHUNK_SIZE;
        const part = await request(start, true);
        if (part.response.status !== 206) throw new Error('资源后续分段未返回 HTTP 206。');
        const range = rangeHeader(part.response, start);
        if (range.total !== total || part.bytes.length !== range.end - start + 1) {
          throw new Error('资源分段长度或总长度发生变化。');
        }
        const etag = first.response.headers.get('ETag');
        if (etag && part.response.headers.get('ETag') !== etag) throw new Error('下载期间资源版本发生变化。');
        result.set(part.bytes, start);
        received += part.bytes.length;
        progress(href, received, total);
      }
    }
    await Promise.all([worker(), worker()]);
    return result.buffer;
  } catch (cause) {
    controller.abort(cause);
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`资源加载失败：${href}。${reason} 请检查网络后刷新重试。`, { cause });
  }
}

export async function loadJsonResource(url: URL | string): Promise<unknown> {
  const bytes = await loadResource(url);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function loadCompressedResource(url: URL | string): Promise<ArrayBuffer> {
  const bytes = await loadResource(url);
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  } catch (cause) {
    throw new Error(`资源解压失败：${String(url)}`, { cause });
  }
}

export async function loadCompressedJsonResource(url: URL | string): Promise<unknown> {
  const bytes = await loadCompressedResource(url);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
