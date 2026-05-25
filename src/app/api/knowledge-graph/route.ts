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
  source: string;
  target: string;
}

/**
 * GET /api/knowledge-graph
 * 返回知识图谱数据（节点 + 边），并叠加 Mem0 学习记忆的掌握程度
 *
 * 掌握程度推断策略（优先级从高到低）：
 * 1. 从 memory metadata.entities 中解析（适配 Mem0 云 API 的 "key.value" 字符串格式）
 * 2. 从 memory 文本内容中关键词匹配（兜底，但这是主要生效的）
 */
export async function GET() {
  try {
    // 1. 获取全量记忆
    const memories = await memoService.getAll();

    console.log(`[KnowledgeGraph] 📊 Loaded ${memories.length} memories for graph`);

    // 2. 构建知识点 → 掌握程度映射
    const kpMasteryMap = new Map<string, MasteryLevel>();

    // ===== 策略 A：从 metadata.entities 中提取 =====
    // Mem0 云 API 实际存储格式: ["type.knowledge_point", "id.math-7-ch1-03", "name.绝对值", "mastery.basic"]
    // 需要从 "key.value" 字符串中解析出结构化信息
    for (const mem of memories) {
      if (!mem.memory) continue;

      const meta = mem as unknown as Record<string, unknown>;
      const metadata = meta.metadata as Record<string, unknown> | undefined;
      if (!metadata?.entities || !Array.isArray(metadata.entities)) continue;

      const entities = metadata.entities as string[];
      const parsedEntity = parseMem0Entities(entities);

      if (parsedEntity && parsedEntity.type === "knowledge_point" && parsedEntity.id) {
        const existing = kpMasteryMap.get(parsedEntity.id);
        const newLevel = parsedEntity.mastery ?? ("basic" as MasteryLevel);

        if (!existing || compareMastery(newLevel, existing) > 0) {
          kpMasteryMap.set(parsedEntity.id, newLevel);
        }
      }
    }

    // ===== 策略 B：从记忆文本内容中做关键词匹配 =====
    const memoryTexts: string[] = [];
    for (const m of memories) {
      if (m.memory && typeof m.memory === "string") {
        memoryTexts.push(m.memory);
      }
    }
    const memoryContext = memoryTexts.join("\n");

    for (const kp of knowledgePoints) {
      if (kpMasteryMap.has(kp.id)) continue; // 策略 A 已覆盖

      // 检查知识点名称是否出现在任何记忆文本中
      const appearsInMemory = memoryTexts.some((text) => text.includes(kp.name));

      if (appearsInMemory) {
        // 出现过 → 至少是 basic，再尝试升级
        let level: MasteryLevel = "basic" as MasteryLevel;

        // 检查是否有更高等级的关键词在附近
        if (isKeywordNearby(memoryContext, kp.name, ["mastered", "掌握"])) {
          level = "mastered" as MasteryLevel;
        } else if (isKeywordNearby(memoryContext, kp.name, ["proficient", "熟练"])) {
          level = "proficient" as MasteryLevel;
        }

        kpMasteryMap.set(kp.id, level);
      }
    }

    // 日志
    if (kpMasteryMap.size > 0) {
      const studiedKps = knowledgePoints
        .filter((kp) => kpMasteryMap.has(kp.id))
        .map((kp) => `${kp.name}(${kpMasteryMap.get(kp.id)})`);
      console.log(`[KnowledgeGraph] 🎯 Studied KPs (${kpMasteryMap.size}): ${studiedKps.join(", ")}`);
    } else {
      console.log(`[KnowledgeGraph] ⚠️ No KPs matched from ${memoryTexts.length} memory texts`);
      // Debug: 输出前 200 字符帮助排查
      if (memoryContext.length > 0) {
        console.log(`[KnowledgeGraph] 📝 Memory context preview: ${memoryContext.slice(0, 300)}...`);
      }
    }

    // 3. 构建节点
    const nodes: GraphNode[] = knowledgePoints.map((kp) => ({
      id: kp.id,
      name: kp.name,
      mastery: kpMasteryMap.get(kp.id) ?? ("unknown" as const),
    }));

    // 4. 构建边
    const edges: GraphEdge[] = [];
    for (const kp of knowledgePoints) {
      for (const depId of kp.dependsOn) {
        if (knowledgePoints.some((k) => k.id === depId)) {
          edges.push({ source: depId, target: kp.id });
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

/**
 * 解析 Mem0 云 API 存储的 entities 格式
 *
 * Mem0 云 API 会将我们传入的:
 *   [{ type: "knowledge_point", id: "math-7-ch1-03", name: "绝对值", mastery: "basic" }]
 *
 * 转换存储为:
 *   ["type.knowledge_point", "id.math-7-ch1-03", "name.绝对值", "mastery.basic"]
 *
 * 此函数将 "key.value" 格式的字符串还原为对象
 */
function parseMem0Entities(entries: string[]): {
  type?: string;
  id?: string;
  name?: string;
  action?: string;
  mastery?: MasteryLevel;
} | null {
  const result: Record<string, string> = {};

  for (const entry of entries) {
    // 格式: "key.value"
    const dotIndex = entry.indexOf(".");
    if (dotIndex <= 0 || dotIndex >= entry.length - 1) continue; // 无效格式

    const key = entry.slice(0, dotIndex);
    const value = entry.slice(dotIndex + 1);
    result[key] = value;
  }

  // 至少要有 type 才算有效实体
  if (!result.type) return null;

  // 解析 mastery（确保是合法枚举值）
  if (result.mastery && Object.values(MasteryLevel).includes(result.mastery as MasteryLevel)) {
    result.mastery = result.mastery as MasteryLevel;
  } else {
    delete result.mastery;
  }

  return result;
}

/** 掌握程度等级比较 */
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
 * 检查关键词是否在目标词附近出现（同一句/相近位置）
 */
function isKeywordNearby(text: string, target: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  let targetPos = lowerText.indexOf(target.toLowerCase());
  while (targetPos !== -1) {
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
