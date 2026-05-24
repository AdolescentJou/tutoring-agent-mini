import { NextResponse } from "next/server";
import { MemoService } from "@/services/MemoService";
import type { KnowledgePoint } from "@/types";
import { MasteryLevel } from "@/types";
import knowledgePointsData from "@/data/knowledgePoints.json";

const memoService = new MemoService();
const knowledgePoints: KnowledgePoint[] = knowledgePointsData as KnowledgePoint[];

interface GraphNode {
  id: string;
  name: string;
  mastery: MasteryLevel | "unknown";
}

interface GraphEdge {
  source: string; // 前置知识点 ID
  target: string; // 当前知识点 ID
}

/**
 * GET /api/knowledge-graph
 * 返回知识图谱数据（节点 + 边），并叠加 Mem0 学习记忆的掌握程度
 *
 * 掌握程度推断策略（优先级从高到低）：
 * 1. 从 memory metadata 中的 entities 提取结构化 mastery 字段（最准确）
 * 2. 从 memory 文本内容中关键词匹配（主要兜底）
 */
export async function GET() {
  try {
    // 1. 获取全量记忆
    const memories = await memoService.getAll();

    console.log(`[KnowledgeGraph] 📊 Loaded ${memories.length} memories for graph`);

    // 2. 构建知识点 → 掌握程度映射
    const kpMasteryMap = new Map<string, MasteryLevel>();
    const kpStudyCount = new Map<string, number>(); // 记录每个知识点被讨论的次数

    // 策略 A：从 metadata.entities 中提取结构化的 mastery 信息
    for (const mem of memories) {
      if (!mem.memory) continue;

      const meta = mem as unknown as Record<string, unknown>;
      const metadata = meta.metadata as Record<string, unknown> | undefined;

      if (metadata) {
        const entities = metadata.entities as Array<Record<string, unknown>> | undefined;
        if (entities && Array.isArray(entities)) {
          for (const entity of entities) {
            if (
              entity.type === "knowledge_point" &&
              entity.id &&
              entity.mastery &&
              Object.values(MasteryLevel).includes(entity.mastery as MasteryLevel)
            ) {
              const existing = kpMasteryMap.get(entity.id as string);
              const newLevel = entity.mastery as MasteryLevel;
              if (!existing || compareMastery(newLevel, existing) > 0) {
                kpMasteryMap.set(entity.id as string, newLevel);
              }
            }
          }
        }
      }
    }

    // 策略 B：从记忆文本内容中做关键词匹配 + 出现次数统计
    const memoryTexts: string[] = [];
    for (const m of memories) {
      if (m.memory && typeof m.memory === "string") {
        memoryTexts.push(m.memory);
      }
    }
    const memoryContext = memoryTexts.join("\n");

    // 统计每个知识点名称在所有记忆中出现的次数
    for (const kp of knowledgePoints) {
      let count = 0;
      for (const text of memoryTexts) {
        // 简单的出现次数统计
        const regex = new RegExp(kp.name, "g");
        const matches = text.match(regex);
        count += matches ? matches.length : 0;
      }
      if (count > 0) {
        kpStudyCount.set(kp.id, count);
      }

      // 如果策略 A 没有覆盖到，用文本推断补充
      if (!kpMasteryMap.has(kp.id)) {
        const inferred = inferMasteryFromText(kp.name, memoryContext);
        if (inferred !== "unknown") {
          kpMasteryMap.set(kp.id, inferred);
        } else if (count > 0) {
          // 有出现但没匹配到等级关键词 → 至少是 basic
          kpMasteryMap.set(kp.id, "basic" as MasteryLevel);
        }
      }
    }

    // 日志：输出有学习记录的知识点
    if (kpMasteryMap.size > 0) {
      const studiedKps = knowledgePoints
        .filter((kp) => kpMasteryMap.has(kp.id))
        .map((kp) => `${kp.name}(${kpMasteryMap.get(kp.id)})`);
      console.log(`[KnowledgeGraph] 🎯 Studied KPs: ${studiedKps.join(", ")}`);
    }

    // 3. 构建节点
    const nodes: GraphNode[] = knowledgePoints.map((kp) => ({
      id: kp.id,
      name: kp.name,
      mastery: kpMasteryMap.get(kp.id) ?? ("unknown" as const),
    }));

    // 4. 构建边：dependsOn 关系 → source(前置) -> target(当前)
    const edges: GraphEdge[] = [];
    for (const kp of knowledgePoints) {
      for (const depId of kp.dependsOn) {
        if (knowledgePoints.some((k) => k.id === depId)) {
          edges.push({
            source: depId,
            target: kp.id,
          });
        }
      }
    }

    return NextResponse.json({
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      studiedCount: kpMasteryMap.size,
      studentId: "student-001",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[KnowledgeGraph] ❌ Error:", message);
    return NextResponse.json(
      { error: "获取知识图谱失败，请稍后再试" },
      { status: 500 }
    );
  }
}

/** 掌握程度等级比较：返回正数表示 a > b */
function compareMastery(a: MasteryLevel, b: MasteryLevel): number {
  const rank: Record<MasteryLevel, number> = {
    not_started: 0,
    basic: 1,
    proficient: 2,
    mastered: 3,
  };
  return (rank[a] ?? 0) - (rank[b] ?? 0);
}

/**
 * 从记忆文本内容推断掌握程度
 *
 * 核心逻辑：
 * - 如果知识点名称出现在记忆文本中 → 至少是 basic
 * - 根据特定关键词升级到 proficient / mastered
 */
function inferMasteryFromText(
  kpName: string,
  memoryContext: string
): MasteryLevel | "unknown" {
  if (!memoryContext || !kpName) return "unknown";

  // 知识点名称是否出现在记忆中
  if (!memoryContext.includes(kpName)) return "unknown";

    // 检查最高等级关键词
    if (memoryContext.includes("mastered") || memoryContext.includes("掌握")) {
      // 确认掌握关键词和该知识点相关（在同一句或相邻位置）
      if (isKeywordNearby(memoryContext, kpName, ["mastered", "掌握"])) {
        return "mastered" as MasteryLevel;
      }
    }

    // 检查熟练等级
    if (memoryContext.includes("proficient") || memoryContext.includes("熟练")) {
      if (isKeywordNearby(memoryContext, kpName, ["proficient", "熟练"])) {
        return "proficient" as MasteryLevel;
      }
    }

    // 出现过名称但无更高等级关键词 → 至少是 basic
    return "basic" as MasteryLevel;
}

/**
 * 检查关键词是否在目标词附近出现（同一句/相近位置）
 * 简单实现：检查两者是否在同一段 100 字符窗口内
 */
function isKeywordNearby(text: string, target: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  let targetPos = lowerText.indexOf(target.toLowerCase());
  while (targetPos !== -1) {
    // 取目标词前后各 50 字符的窗口
    const start = Math.max(0, targetPos - 50);
    const end = Math.min(text.length, targetPos + target.length + 50);
    const window = text.slice(start, end).toLowerCase();

    for (const kw of keywords) {
      if (window.includes(kw.toLowerCase())) return true;
    }

    targetPos = lowerText.indexOf(target.toLowerCase(), targetPos + 1);
  }
  return false;
}
