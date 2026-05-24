import MemoryClient, { type Memory } from "mem0ai";

/**
 * MemoService — 封装 Mem0 API 的存储和召回操作
 *
 * 关键修复：
 * 1. recall() 添加 user_id 过滤，确保只召回当前用户的记忆
 * 2. store() 增加返回值日志，便于调试
 * 3. getAll() 正确处理 PaginatedMemories 返回结构
 */
export class MemoService {
  private client: MemoryClient | null = null;
  private degraded = false;
  private userId = "student-001";
  private timeoutMs = 10000; // 10s 超时（Mem0 云 API 可能较慢）

  constructor() {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey || apiKey === "your-mem0-api-key-here") {
      console.warn("[MemoService] ⚠️ MEM0_API_KEY not configured, running in degraded mode");
      this.degraded = true;
      return;
    }

    try {
      this.client = new MemoryClient({ apiKey });
      console.log("[MemoService] ✅ Mem0 client initialized successfully");
    } catch (error) {
      console.error("[MemoService] ❌ Failed to initialize Mem0 client:", error);
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
      console.warn("[MemoService] ⚠️ Skipping store — degraded mode (no API key)");
      return;
    }

    try {
      const options: Record<string, unknown> = {
        userId: this.userId,
      };

      if (entities && entities.length > 0) {
        options.metadata = { entities };
        console.log(`[MemoService] 📝 Storing ${messages.length} messages with ${entities.length} entities:`, JSON.stringify(entities).slice(0, 200));
      } else {
        console.log(`[MemoService] 📝 Storing ${messages.length} messages (no entities)`);
      }

      const result = await Promise.race([
        this.client.add(messages, options),
        this.createTimeout<Memory[]>(this.timeoutMs, "store"),
      ]);

      console.log(`[MemoService] ✅ Store success — created ${Array.isArray(result) ? result.length : '?'} memory item(s)`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[MemoService] ❌ Store failed:", message);
      // 存储失败静默处理，不影响对话
    }
  }

  /**
   * 召回相关记忆（按用户过滤）
   * @param query 查询文本
   * @param topK 返回最相关的 K 条记忆，默认 5
   * @returns 记忆内容字符串列表，失败时返回空数组
   */
  async recall(query: string, topK = 5): Promise<string[]> {
    if (this.degraded || !this.client) {
      console.warn("[MemoService] ⚠️ Skipping recall — degraded mode");
      return [];
    }

    try {
      const result = await Promise.race([
        this.client.search(query, {
          topK,
          filters: { user_id: this.userId }, // 🔑 关键修复：按用户过滤！
        }),
        this.createTimeout<{ results: Memory[] }>(this.timeoutMs, "recall"),
      ]);

      if (!result || !Array.isArray(result.results)) {
        console.log(`[MemoService] 📭 Recall for "${query.slice(0, 30)}" returned no results`);
        return [];
      }

      const memories = result.results
        .filter((r: Memory) => r.memory && typeof r.memory === "string")
        .map((r: Memory) => r.memory as string);

      console.log(`[MemoService] 🔍 Recall for "${query.slice(0, 30)}" → ${memories.length} memories found`);
      return memories;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[MemoService] ❌ Recall failed:", message);
      return [];
    }
  }

  /**
   * 全量获取该用户的所有学习记忆
   * @returns 记忆列表，每条包含 id、memory 内容、metadata 等
   */
  async getAll(): Promise<Memory[]> {
    if (this.degraded || !this.client) {
      console.warn("[MemoService] ⚠️ Skipping getAll — degraded mode");
      return [];
    }

    try {
      const result = await Promise.race([
        this.client.getAll({
          filters: { user_id: this.userId },
          pageSize: 100, // 获取足够多的记录
        }),
        this.createTimeout<{ results: Memory[]; count: number }>(this.timeoutMs, "getAll"),
      ]);

      if (!result || !Array.isArray(result.results)) {
        console.log(`[MemoService] 📭 GetAll returned no results`);
        return [];
      }

      console.log(`[MemoService] 📋 GetAll → ${result.results.length} memories (total: ${result.count ?? '?'})`);
      return result.results;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[MemoService] ❌ GetAll failed:", message);
      return [];
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
