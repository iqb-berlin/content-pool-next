import '@angular/compiler';

type StorageMap = Map<string, string>;

function createStorageMock(): Storage {
  const state: StorageMap = new Map();

  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return Array.from(state.keys())[index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, String(value));
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createStorageMock(),
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: createStorageMock(),
  configurable: true,
});
