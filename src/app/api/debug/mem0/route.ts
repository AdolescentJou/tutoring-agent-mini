import { NextResponse } from "next/server";
import { MemoService } from "@/services/MemoService";

const memoService = new MemoService();

interface TestResult {
  status: string;
  message?: string;
  count?: number;
  items?: unknown[];
  delta?: number;
}

/**
 * GET /api/debug/mem0
 * 诊断 Mem0 连通性：依次测试 getAll → store → recall → getAll
 *
 * 使用方式: 浏览器访问 /api/debug/mem0
 */
export async function GET() {
  const results: {
    timestamp: string;
    envCheck: Record<string, string>;
    tests: Record<string, TestResult>;
  } = {
    timestamp: new Date().toISOString(),
    envCheck: {},
    tests: {},
  };

  // === 1. 环境变量检查 ===
  results.envCheck = {
    MEM0_API_KEY: process.env.MEM0_API_KEY
      ? `✅ configured (${process.env.MEM0_API_KEY.slice(0, 8)}...)`
      : "❌ NOT SET or placeholder",
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY
      ? `✅ configured (${process.env.MINIMAX_API_KEY.slice(0, 8)}...)`
      : "❌ NOT SET",
    NODE_ENV: process.env.NODE_ENV ?? "unknown",
  };

  // === 2. 测试 getAll（获取已有记忆）===
  try {
    console.log("[Debug] 📋 Testing getAll...");
    const allMemories = await memoService.getAll();
    results.tests.getAll = {
      status: "success",
      count: allMemories.length,
      items: allMemories.slice(0, 5).map((m) => ({
        id: m.id,
        memory: (m.memory as string)?.slice(0, 100),
        metadata: (m as unknown as Record<string, unknown>).metadata ?? "(no metadata)",
        createdAt: m.createdAt,
      })),
    };
    console.log(`[Debug] ✅ getAll returned ${allMemories.length} memories`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.tests.getAll = { status: "error", message };
    console.error(`[Debug] ❌ getAll failed: ${message}`);
  }

  // === 3. 测试 store（写入一条测试记忆）===
  try {
    console.log("[Debug] 📝 Testing store...");
    await memoService.store(
      [
        { role: "user", content: "[诊断测试] 这是一条测试消息，用于验证 Mem0 存储功能" },
        { role: "assistant", content: "[诊断测试] 收到测试消息，Mem0 存储正常工作" },
      ],
      [{ type: "debug_test", action: "diagnostic", mastery: "basic" }]
    );
    results.tests.store = { status: "success", message: "测试记忆已写入" };
    console.log("[Debug] ✅ Store success");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.tests.store = { status: "error", message };
    console.error(`[Debug] ❌ Store failed: ${message}`);
  }

  // === 4. 测试 search/recall（搜索刚写入的记忆）===
  try {
    console.log("[Debug] 🔍 Testing recall...");
    const recalled = await memoService.recall("诊断测试 Mem0 存储", 3);
    results.tests.recall = {
      status: "success",
      count: recalled.length,
      items: recalled.map((r) => r.slice(0, 150)),
    };
    console.log(`[Debug] ✅ Recall returned ${recalled.length} memories`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.tests.recall = { status: "error", message };
    console.error(`[Debug] ❌ Recall failed: ${message}`);
  }

  // === 5. 再次 getAll，确认 store 生效 ===
  try {
    console.log("[Debug] 📋 Testing getAll (after store)...");
    const allAfterStore = await memoService.getAll();
    const prevCount = results.tests.getAll?.count ?? 0;
    results.tests.getAllAfterStore = {
      status: "success",
      count: allAfterStore.length,
      delta: allAfterStore.length - prevCount,
    };
    console.log(`[Debug] ✅ GetAll after store: ${allAfterStore.length} memories`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.tests.getAllAfterStore = { status: "error", message };
  }

  return NextResponse.json(results);
}
