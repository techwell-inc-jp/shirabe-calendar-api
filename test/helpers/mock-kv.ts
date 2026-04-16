/**
 * Cloudflare KVNamespaceのモック
 */
export class MockKV {
  private store = new Map<string, { value: string; expiration?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiration && Date.now() / 1000 > entry.expiration) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void> {
    // Cloudflare KV の本番挙動に合わせて、expirationTtl < 60 を 400 として拒否する。
    // これにより「TTL 短すぎ」バグをテストで早期検知できる。
    if (options?.expirationTtl !== undefined && options.expirationTtl < 60) {
      throw new Error(
        `KV PUT failed: 400 Invalid expiration_ttl of ${options.expirationTtl}. Expiration TTL must be at least 60.`
      );
    }
    const expiration = options?.expiration
      ?? (options?.expirationTtl ? Date.now() / 1000 + options.expirationTtl : undefined);
    this.store.set(key, { value, expiration });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(_options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const prefix = _options?.prefix ?? "";
    const keys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys };
  }

  /** テストヘルパー: ストアをクリア */
  clear(): void {
    this.store.clear();
  }

  /** テストヘルパー: ストアのサイズ */
  get size(): number {
    return this.store.size;
  }
}

/**
 * テスト用の環境変数モックを作成する
 */
export function createMockEnv() {
  return {
    API_KEYS: new MockKV() as unknown as KVNamespace,
    RATE_LIMITS: new MockKV() as unknown as KVNamespace,
    USAGE_LOGS: new MockKV() as unknown as KVNamespace,
    API_VERSION: "1.0.0",
  };
}
