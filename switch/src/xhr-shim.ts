type XhrListener = EventListenerOrEventListenerObject;

function responseSize(value: unknown): number {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return value.size;
  }
  return 0;
}

export class FetchXMLHttpRequest {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = 4;

  readonly UNSENT = FetchXMLHttpRequest.UNSENT;
  readonly OPENED = FetchXMLHttpRequest.OPENED;
  readonly HEADERS_RECEIVED = FetchXMLHttpRequest.HEADERS_RECEIVED;
  readonly LOADING = FetchXMLHttpRequest.LOADING;
  readonly DONE = FetchXMLHttpRequest.DONE;

  onabort: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onload: ((event: any) => void) | null = null;
  onloadend: ((event: any) => void) | null = null;
  onloadstart: ((event: any) => void) | null = null;
  onprogress: ((event: any) => void) | null = null;
  onreadystatechange: ((event: any) => void) | null = null;
  ontimeout: ((event: any) => void) | null = null;

  readyState = FetchXMLHttpRequest.UNSENT;
  response: any = null;
  responseText = "";
  responseType: XMLHttpRequestResponseType = "";
  responseURL = "";
  responseXML: Document | null = null;
  status = 0;
  statusText = "";
  timeout = 0;
  upload = {};
  withCredentials = false;

  private method = "GET";
  private url = "";
  private async = true;
  private overrideType: string | null = null;
  private requestHeaders = new Headers();
  private responseHeaders = new Headers();
  private listeners = new Map<string, Set<XhrListener>>();
  private controller: AbortController | null = null;
  private aborted = false;
  private timedOut = false;

  open(
    method: string,
    url: string | URL,
    async = true,
    _user?: string | null,
    _password?: string | null,
  ): void {
    if (!async) {
      throw new Error("Synchronous XMLHttpRequest is unsupported in the Switch build.");
    }
    this.method = String(method).toUpperCase();
    this.url = String(url);
    this.async = async;
    this.aborted = false;
    this.timedOut = false;
    this.response = null;
    this.responseText = "";
    this.responseURL = "";
    this.status = 0;
    this.statusText = "";
    this.requestHeaders = new Headers();
    this.responseHeaders = new Headers();
    this.setReadyState(FetchXMLHttpRequest.OPENED);
  }

  setRequestHeader(name: string, value: string): void {
    if (this.readyState !== FetchXMLHttpRequest.OPENED) {
      throw new Error("XMLHttpRequest must be opened before setting request headers.");
    }
    this.requestHeaders.append(name, value);
  }

  overrideMimeType(mimeType: string): void {
    this.overrideType = String(mimeType);
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name);
  }

  getAllResponseHeaders(): string {
    const lines: string[] = [];
    this.responseHeaders.forEach((value, name) => lines.push(`${name}: ${value}`));
    return lines.length > 0 ? `${lines.join("\r\n")}\r\n` : "";
  }

  send(body: Document | XMLHttpRequestBodyInit | null = null): void {
    if (this.readyState !== FetchXMLHttpRequest.OPENED || !this.async) {
      throw new Error("XMLHttpRequest is not open.");
    }
    void this.performRequest(body);
  }

  abort(): void {
    this.aborted = true;
    this.controller?.abort();
  }

  /**
   * Releases the completed response body once its consumer has copied or
   * decoded it into the destination cache. Native XMLHttpRequest objects do
   * not expose this hook; the Switch loader uses it to avoid keeping large
   * SD-card ArrayBuffers alive until a later V8 collection.
   */
  releaseResponse(): void {
    this.response = null;
    this.responseText = "";
    this.responseXML = null;
  }

  addEventListener(type: string, listener: XhrListener | null): void {
    if (!listener) {
      return;
    }
    const listeners = this.listeners.get(type) ?? new Set<XhrListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: XhrListener | null): void {
    if (listener) {
      this.listeners.get(type)?.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type, event);
    return !event.defaultPrevented;
  }

  private async performRequest(body: Document | XMLHttpRequestBodyInit | null): Promise<void> {
    this.controller = new AbortController();
    this.emit("loadstart");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (this.timeout > 0) {
      timeoutId = setTimeout(() => {
        this.timedOut = true;
        this.controller?.abort();
      }, this.timeout);
    }

    try {
      const response = await globalThis.fetch(this.url, {
        method: this.method,
        headers: this.requestHeaders,
        body: this.method === "GET" || this.method === "HEAD" ? undefined : (body as BodyInit | null),
        signal: this.controller.signal,
      });
      this.status = response.status || 200;
      this.statusText = response.statusText;
      this.responseURL = response.url || this.url;
      response.headers.forEach((value, name) => this.responseHeaders.set(name, value));
      if (this.overrideType) {
        this.responseHeaders.set("content-type", this.overrideType);
      }
      this.setReadyState(FetchXMLHttpRequest.HEADERS_RECEIVED);
      this.setReadyState(FetchXMLHttpRequest.LOADING);

      switch (this.responseType) {
        case "arraybuffer":
          this.response = await response.arrayBuffer();
          break;
        case "blob":
          this.response = await response.blob();
          break;
        case "json":
          this.response = await response.json();
          break;
        case "document":
          this.responseText = await response.text();
          this.response = this.responseText;
          break;
        case "":
        case "text":
        default:
          this.responseText = await response.text();
          this.response = this.responseText;
          break;
      }

      const loaded = responseSize(this.response);
      this.emit("progress", {
        lengthComputable: loaded > 0,
        loaded,
        total: loaded,
      });
      this.setReadyState(FetchXMLHttpRequest.DONE);
      this.emit("load");
      this.emit("loadend");
    } catch (error) {
      this.status = 0;
      this.statusText = "";
      this.setReadyState(FetchXMLHttpRequest.DONE);
      if (this.timedOut) {
        this.emit("timeout", { error });
      } else if (this.aborted) {
        this.emit("abort", { error });
      } else {
        this.emit("error", { error });
      }
      this.emit("loadend", { error });
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      this.controller = null;
    }
  }

  private setReadyState(readyState: number): void {
    this.readyState = readyState;
    this.emit("readystatechange");
  }

  private emit(type: string, detail: Record<string, unknown> | Event = {}): void {
    const event =
      detail instanceof Event
        ? detail
        : {
            type,
            target: this,
            currentTarget: this,
            lengthComputable: false,
            loaded: 0,
            total: 0,
            ...detail,
          };
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener.call(this, event as Event);
      } else {
        listener.handleEvent(event as Event);
      }
    }
    const handler = (this as any)[`on${type}`];
    if (typeof handler === "function") {
      handler.call(this, event);
    }
  }
}

export function installXmlHttpRequestShim(): void {
  const global = globalThis as any;
  if (global.XMLHttpRequest) {
    return;
  }
  global.XMLHttpRequest = FetchXMLHttpRequest;
}
