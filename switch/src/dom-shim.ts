/**
 * Minimal DOM compatibility layer for Phaser 3 on nx.js.
 *
 * This is derived from the nx.js Phaser Breakout proof of concept in unmerged
 * PR #317, then narrowed for the v1 V8 runtime and Phaser 3.90.0. It is part of
 * the experiment, not evidence that Phaser is officially supported by nx.js.
 */
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";

function makeStyle(): Record<string, string> {
  return new Proxy(
    {},
    {
      get: (target, property) => Reflect.get(target, property) ?? "",
      set: (target, property, value) => Reflect.set(target, property, String(value)),
    },
  );
}

function safeSet(target: any, property: string, value: unknown): void {
  const own = Object.getOwnPropertyDescriptor(target, property);
  const inherited = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) ?? {}, property);
  const descriptor = own ?? inherited;
  if (descriptor?.get && !descriptor.set) {
    return;
  }
  try {
    target[property] = value;
  } catch {
    // Some nx.js host objects expose read-only browser-like properties.
  }
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON() {
      return { x: 0, y: 0, width, height };
    },
  } as DOMRect;
}

function collectElementsByTagName(roots: any[], requestedTagName: string): any[] {
  const tagName = String(requestedTagName).toUpperCase();
  const matches: any[] = [];
  const visited = new Set<any>();
  const visit = (node: any): void => {
    if (!node || typeof node !== "object" || visited.has(node)) {
      return;
    }
    visited.add(node);
    if (tagName === "*" || node.tagName === tagName) {
      matches.push(node);
    }
    const children = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.childNodes)
        ? node.childNodes
        : [];
    for (const child of children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return matches;
}

function elementStub(tagName: string): any {
  const attributes = new Map<string, string>();
  const element: any = {
    style: makeStyle(),
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    relList: {
      supports(feature: string) {
        return tagName.toLowerCase() === "link" && feature === "modulepreload";
      },
    },
    nodeName: tagName.toUpperCase(),
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    parentNode: null,
    parentElement: null,
    childNodes: [],
    children: [],
    innerHTML: "",
    textContent: "",
    appendChild(child: any) {
      if (child && typeof child === "object") {
        child.parentNode = element;
        child.parentElement = element;
        element.childNodes.push(child);
        element.children.push(child);
      }
      return child;
    },
    removeChild(child: any) {
      element.childNodes = element.childNodes.filter((value: unknown) => value !== child);
      element.children = element.children.filter((value: unknown) => value !== child);
      if (child && typeof child === "object") {
        child.parentNode = null;
        child.parentElement = null;
      }
      return child;
    },
    insertBefore(child: any, before: any) {
      const index = element.children.indexOf(before);
      if (index < 0) {
        return element.appendChild(child);
      }
      child.parentNode = element;
      child.parentElement = element;
      element.children.splice(index, 0, child);
      element.childNodes.splice(index, 0, child);
      return child;
    },
    contains(child: unknown) {
      return child === element || element.children.includes(child);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, String(value));
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    getBoundingClientRect() {
      return rect(0, 0);
    },
    querySelector(selector: string) {
      if (selector === "canvas") {
        return element.children.find((value: any) => value?.tagName === "CANVAS") ?? null;
      }
      return null;
    },
    getElementsByTagName(requestedTagName: string) {
      return collectElementsByTagName(element.children, requestedTagName);
    },
    focus() {},
    blur() {},
  };
  return element;
}

function patchImage(image: any): any {
  const target = image as any;
  safeSet(target, "style", makeStyle());
  safeSet(target, "parentNode", null);
  safeSet(target, "parentElement", null);
  safeSet(target, "tagName", "IMG");
  return image;
}

export function patchCanvas(canvas: OffscreenCanvas | Screen): HTMLCanvasElement {
  const target = canvas as any;
  if (target.__silverShadowPatched) {
    return target as HTMLCanvasElement;
  }
  target.__silverShadowPatched = true;
  safeSet(target, "style", makeStyle());
  safeSet(target, "parentNode", null);
  safeSet(target, "parentElement", null);
  safeSet(target, "classList", {
    add() {},
    remove() {},
    contains() {
      return false;
    },
  });
  safeSet(target, "tagName", "CANVAS");
  safeSet(target, "focus", () => {});
  safeSet(target, "blur", () => {});
  safeSet(target, "getBoundingClientRect", () => rect(target.width, target.height));

  const originalGetContext = target.getContext.bind(target);
  target.getContext = (kind: string, attributes?: unknown) => {
    const context = originalGetContext(kind, attributes);
    if (context) {
      safeSet(context, "canvas", target);
      if (!("imageSmoothingEnabled" in context)) {
        safeSet(context, "imageSmoothingEnabled", true);
      }
    }
    return context;
  };

  return target as HTMLCanvasElement;
}

export function installDomShim(): void {
  const global = globalThis as any;
  if (global.__silverShadowDomShimInstalled) {
    return;
  }
  global.__silverShadowDomShimInstalled = true;
  global.window = globalThis;
  global.self = globalThis;
  global.top = globalThis;
  global.parent = globalThis;
  global.innerWidth = SCREEN_WIDTH;
  global.innerHeight = SCREEN_HEIGHT;
  global.outerWidth = SCREEN_WIDTH;
  global.outerHeight = SCREEN_HEIGHT;
  global.devicePixelRatio = 1;
  global.scrollX = 0;
  global.scrollY = 0;
  global.pageXOffset = 0;
  global.pageYOffset = 0;
  global.focus ??= () => {};
  global.blur ??= () => {};
  global.close ??= () => {};
  global.scrollTo ??= () => {};
  global.getComputedStyle ??= (element: any) => element?.style ?? makeStyle();
  global.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  });

  global.HTMLElement ??= class HTMLElement {};
  global.Element ??= class Element {};
  global.Node ??= class Node {};
  global.Document ??= class Document {};
  global.HTMLDocument ??= global.Document;
  global.HTMLCanvasElement ??= class HTMLCanvasElement {};
  global.HTMLImageElement ??= Image;
  global.HTMLAudioElement ??= Audio;
  global.HTMLVideoElement ??= global.Video ?? class HTMLVideoElement {};
  global.HTMLDivElement ??= class HTMLDivElement {};
  global.CSSStyleDeclaration ??= class CSSStyleDeclaration {};

  Object.defineProperty(global.HTMLCanvasElement, Symbol.hasInstance, {
  configurable: true,
  value(instance: any) {
    return instance === screen || Boolean(instance?.getContext && instance?.tagName === "CANVAS");
  },
  });

  if (!global.MouseEvent) {
    global.MouseEvent = class MouseEvent extends Event {
    clientX = 0;
    clientY = 0;
    pageX = 0;
    pageY = 0;
    screenX = 0;
    screenY = 0;
    offsetX = 0;
    offsetY = 0;
    movementX = 0;
    movementY = 0;
    button = 0;
    buttons = 0;
    ctrlKey = false;
    shiftKey = false;
    altKey = false;
    metaKey = false;

    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init);
      Object.assign(this, init);
    }
    };
  }

  global.PointerEvent ??= class PointerEvent extends global.MouseEvent {
  pointerId = 0;
  pointerType = "mouse";
  width = 1;
  height = 1;
  pressure = 0;
  isPrimary = true;
  };
  global.WheelEvent ??= class WheelEvent extends global.MouseEvent {
  deltaX = 0;
  deltaY = 0;
  deltaZ = 0;
  deltaMode = 0;
  };

  const body = {
  ...elementStub("body"),
  offsetWidth: SCREEN_WIDTH,
  offsetHeight: SCREEN_HEIGHT,
  clientWidth: SCREEN_WIDTH,
  clientHeight: SCREEN_HEIGHT,
  getBoundingClientRect: () => rect(SCREEN_WIDTH, SCREEN_HEIGHT),
  };
  const documentElement = {
  ...elementStub("html"),
  clientWidth: SCREEN_WIDTH,
  clientHeight: SCREEN_HEIGHT,
  };
  const head = elementStub("head");
  const app = {
    ...elementStub("div"),
    id: "app",
    clientWidth: SCREEN_WIDTH,
    clientHeight: SCREEN_HEIGHT,
    getBoundingClientRect: () => rect(SCREEN_WIDTH, SCREEN_HEIGHT),
  };
  const touchControls = { ...elementStub("div"), id: "touchControls" };
  body.appendChild(app);
  body.appendChild(touchControls);

  const documentShim: any = {
  readyState: "complete",
  title: "SilverShadow PokeRogue",
  documentElement,
  head,
  body,
  fonts,
  defaultView: globalThis,
  fullscreenElement: null,
  pointerLockElement: null,
  visibilityState: "visible",
  hidden: false,
  cookie: "",
  createElement(tagName: string) {
    const tag = tagName.toLowerCase();
    if (tag === "canvas") {
      return patchCanvas(new OffscreenCanvas(1, 1));
    }
    if (tag === "img" || tag === "image") {
      return patchImage(new Image());
    }
    if (tag === "audio") {
      return new Audio();
    }
    if (tag === "video" && global.Video) {
      return new global.Video();
    }
    return elementStub(tag);
  },
  createElementNS(_namespace: string, tagName: string) {
    return documentShim.createElement(tagName);
  },
  getElementById(id: string) {
    if (id === "app" || id === "game") {
      return app;
    }
    if (id === "touchControls") {
      return touchControls;
    }
    return null;
  },
  getElementsByTagName(tagName: string) {
    return collectElementsByTagName([documentElement, head, body], tagName);
  },
  querySelector(selector: string) {
    if (selector === "#app") {
      return app;
    }
    if (selector === "#touchControls") {
      return touchControls;
    }
    return selector === "canvas" ? patchCanvas(screen) : null;
  },
  querySelectorAll() {
    return [];
  },
  createTextNode(text: string) {
    return { nodeType: 3, textContent: text };
  },
  createDocumentFragment() {
    return elementStub("#document-fragment");
  },
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: unknown) {
    if (type !== "visibilitychange" && type !== "fullscreenchange") {
      global.addEventListener(type, listener, options);
    }
  },
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: unknown) {
    global.removeEventListener(type, listener, options);
  },
  hasFocus() {
    return true;
  },
  exitFullscreen() {
    return Promise.resolve();
  },
  exitPointerLock() {},
  };

  global.document = documentShim;
  try {
  Object.defineProperty(screen, "orientation", {
    configurable: true,
    value: {
      type: "landscape-primary",
      angle: 0,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
      lock() {
        return Promise.resolve();
      },
      unlock() {},
    },
  });
  } catch {
  // Older and newer nx.js builds may expose different orientation descriptors.
  }

  try {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Nintendo Switch; nx.js V8) AppleWebKit/537.36",
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: 10,
  });
  } catch {
  // The proof of concept can continue if these feature-detection hints are read-only.
  }

  patchCanvas(screen);
  app.appendChild(screen);
}
