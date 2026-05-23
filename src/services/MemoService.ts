import MemoryClient, { type Memory } from "mem0ai";

/**
 * MemoService — 封装 Mem0 API 的存储和召回操作
 */
export class MemoService {
  private client: MemoryClient | null = null;
  private degraded = false;
  private userId = "student-001";
  private timeoutMs = 5000; // 5s 超时

  constructor() {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey || apiKey === "your-mem0-api-key-here") {
      console.warn("[MemoService] MEM0_API_KEY not configured, running in degraded mode");
      this.degraded = true;
      return;
    }

    try {
      this.client = new MemoryClient({ apiKey });
    } catch (error) {
      console.error("[MemoService] Failed to initialize Mem0 client:", error);
      this.degraded = true;
    }
  }

  /**
   * 存储对话记忆到 Mem0
   * @param messages 对话消息列表
   * @param entities 结构化实体信息（知识点学习信息等）
   */
  async store(
    messages: { role: "user" | "assistant"; content: string }[],
    entities?: Record<string, string>[]
  ): Promise<void> {
    if (this.degraded || !this.client) {
      console.warn("[MemoService] Skipping store — degraded mode");
      return;
    }

    try {
      const options: Record<string, unknown> = {
        userId: this.userId,
      };

      if (entities && entities.length > 0) {
        options.metadata = { entities };
      }

      await Promise.race([
        this.client.add(messages, options),
        this.createTimeout(this.timeoutMs, "store"),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[MemoService] Store failed (silent):", message);
      // 存储失败静默处理，不影响对话
    }
  }

  /**
   * 召回相关记忆
   * @param query 查询文本
   * @param topK 返回最相关的 K 条记忆，默认 5
   * @returns 记忆内容字符串列表，失败时返回空数组
   */
  async recall(query: string, topK = 5): Promise<string[]> {
    if (this.degraded || !this.client) {
      console.warn("[MemoService] Skipping recall — degraded mode");
      return [];
    }

    try {
      const result = await Promise.race([
        this.client.search(query, { topK }),
        this.createTimeout<{ results: Memory[] }>(this.timeoutMs, "recall"),
      ]);

      if (!result || !Array.isArray(result.results)) {
        return [];
      }

      return result.results
        .filter((r: Memory) => r.memory && typeof r.memory === "string")
        .map((r: Memory) => r.memory as string);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[MemoService] Recall failed:", message);
      return []; // 召回失败返回空数组
    }
  }

  /**
   * 创建超时 Promise
   */
  private createTimeout<T>(ms: number, operation: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Mem0 ${operation} timeout after ${ms}ms`));
      }, ms);
    });
  }
}
