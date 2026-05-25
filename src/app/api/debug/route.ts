import { NextResponse } from "next/server";
import { MemoService } from "@/services/MemoService";

const memoService = new MemoService();

interface DebugStep {
  step: string;
  status: string;
  detail: string;
  results?: string[];
  count?: number;
  memories?: unknown[];
}

/**
 * GET /api/debug
 * 诊断 API：逐步测试 Mem0 的 store → search → getAll 全链路
 * 用于排查记忆不生效的问题
 */
export async function GET() {
  const diagnostics: {
    timestamp: string;
    steps: DebugStep[];
    env: Record<string, unknown>;
    firstMemoryFull?: unknown;
    error?: string;
  } = {
    timestamp: new Date().toISOString(),
    steps: [],
    env: {
      hasMem0Key: !!process.env.MEM0_API_KEY,
      mem0KeyPrefix: process.env.MEM0_API_KEY?.slice(0, 8) + "...",
      isPlaceholder: process.env.MEM0_API_KEY === "your-mem0-api-key-here",
    },
  };

  try {
    // Step 1: 检查 client 状态
    diagnostics.steps.push({
      step: "1_check_client",
      status: "ok",
      detail: "MemoService initialized",
    });

    // Step 2: 尝试存储一条测试记忆
    try {
      await memoService.store(
        [
          { role: "user", content: "这是一条诊断测试消息" },
          { role: "assistant", content: "收到，这是辅导老师的回复" },
        ],
        [{ type: "debug_test", action: "diagnostic", mastery: "basic" }]
      );
      diagnostics.steps.push({
        step: "2_store_test",
        status: "ok",
        detail: "Test memory stored successfully",
      });
    } catch (storeErr: unknown) {
      diagnostics.steps.push({
        step: "2_store_test",
        status: "error",
        detail: storeErr instanceof Error ? storeErr.message : String(storeErr),
      });
    }

    // Step 3: 等一下让 Mem0 处理
    await new Promise((r) => setTimeout(r, 1000));

    // Step 4: 尝试 search 召回
    try {
      const recallResults = await memoService.recall("诊断测试", 5);
      diagnostics.steps.push({
        step: "4_recall_search",
        status: "ok",
        detail: `Recall returned ${recallResults.length} results`,
        results: recallResults.slice(0, 3),
      });
    } catch (recallErr: unknown) {
      diagnostics.steps.push({
        step: "4_recall_search",
        status: "error",
        detail: recallErr instanceof Error ? recallErr.message : String(recallErr),
      });
    }

    // Step 5: 再等一下
    await new Promise((r) => setTimeout(r, 1000));

    // Step 6: 尝试 getAll 获取全量
    try {
      const allMemories = await memoService.getAll();
      diagnostics.steps.push({
        step: "6_get_all",
        status: "ok",
        detail: `GetAll returned ${allMemories.length} memories`,
        count: allMemories.length,
        memories: allMemories.slice(0, 5).map((m) => ({
          id: m.id,
          memory: (m.memory as string)?.slice(0, 100),
          metadata: (m as unknown as Record<string, unknown>).metadata ?? "no metadata",
          createdAt: m.createdAt,
        })),
      });

      if (allMemories.length > 0) {
        const first = allMemories[0];
        diagnostics.firstMemoryFull = {
          id: first.id,
          memory: first.memory,
          metadata: (first as unknown as Record<string, unknown>).metadata,
          createdAt: first.createdAt,
          updatedAt: first.updatedAt,
          categories: (first as unknown as Record<string, unknown>).categories,
          allKeys: Object.keys(first),
        };
      }
    } catch (getAllErr: unknown) {
      diagnostics.steps.push({
        step: "6_get_all",
        status: "error",
        detail: getAllErr instanceof Error ? getAllErr.message : String(getAllErr),
      });
    }

    return NextResponse.json(diagnostics);
  } catch (error: unknown) {
    diagnostics.error = error instanceof Error ? error.message : String(error);
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
