/** Минимальная среда браузера для тестов клиентского кода (window, localStorage, события). */
const memory = new Map<string, string>();

export const fakeLocalStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};

export const events: { type: string; detail: any }[] = [];

export function installBrowserStubs() {
  const target = new EventTarget();
  const win: any = Object.assign(target, { location: { reload() {} }, visualViewport: undefined, innerHeight: 800 });
  const originalDispatch = target.dispatchEvent.bind(target);
  win.dispatchEvent = (event: Event) => {
    events.push({ type: event.type, detail: (event as CustomEvent).detail });
    return originalDispatch(event);
  };
  (globalThis as any).window = win;
  (globalThis as any).localStorage = fakeLocalStorage;
}

export function resetBrowserStubs() {
  memory.clear();
  events.length = 0;
}
