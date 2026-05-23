import { NextRequest, NextResponse } from "next/server";
import { LLMService } from "@/services/LLMService";
import { MemoService } from "@/services/MemoService";
import type { ChatRequest, ChatResponse, ErrorResponse, KnowledgePoint, MasteryLevel, Mistake } from "@/types";
import knowledgePointsData from "@/data/knowledgePoints.json";
import mistakesData from "@/data/mistakes.json";

const llmService = new LLMService();
const memoService = new MemoService();

const DEFAULT_STUDENT_ID = "student-001";

const knowledgePoints: KnowledgePoint[] = knowledgePointsData as KnowledgePoint[];
const mistakes: Mistake[] = mistakesData as Mistake[];

const BASE_SYSTEM_PROMPT = `你是一位专业的初中数学辅导老师，名叫"小数"。你的职责是：

1. 用耐心和鼓励的语气辅导学生理解数学概念
2. 用简单的例子和类比帮助学生理解抽象概念
3. 当学生犯错时，先肯定他们的思考，再引导他们发现并纠正错误
4. 适当提问引导学生主动思考，而不是直接给出答案
5. 用中文回复，语言通俗易懂，适合初中生理解

请始终保持友好、耐心的态度，帮助学生建立数学自信。`;

/**
 * 从学生消息中匹配知识点关键词
 */
function matchKnowledgePoints(message: string): KnowledgePoint[] {
  return knowledgePoints.filter((kp) => message.includes(kp.name));
}

/**
 * 检查知识点的前置依赖是否已掌握
 */
function checkDependencies(
  kp: KnowledgePoint,
  memoryContext: string
): { unmet: string[]; met: string[] } {
  if (kp.dependsOn.length === 0) {
    return { unmet: [], met: [] };
  }

  const unmet: string[] = [];
  const met: string[] = [];

  for (const depId of kp.dependsOn) {
    const depKp = knowledgePoints.find((k) => k.id === depId);
    if (!depKp) continue;

    // 从记忆上下文中推断掌握程度
    const isStudied = memoryContext.includes(depKp.name);
    const isProficient =
      isStudied &&
      (memoryContext.includes("proficient") ||
        memoryContext.includes("mastered") ||
        memoryContext.includes("掌握"));

    if (!isStudied) {
      unmet.push(depKp.name);
    } else if (!isProficient) {
      // 已学习但掌握程度不足 (not_started 或 basic)
      unmet.push(depKp.name);
    } else {
      met.push(depKp.name);
    }
  }

  return { unmet, met };
}

/**
 * 推断知识点的掌握程度
 */
function inferMastery(kpName: string, memoryContext: string): MasteryLevel {
  if (!memoryContext.includes(kpName)) {
    return "not_started" as MasteryLevel;
  }
  if (
    memoryContext.includes("mastered") ||
    (memoryContext.includes(kpName) && memoryContext.includes("掌握"))
  ) {
    return "mastered" as MasteryLevel;
  }
  if (
    memoryContext.includes("proficient") ||
    memoryContext.includes("熟练")
  ) {
    return "proficient" as MasteryLevel;
  }
  return "basic" as MasteryLevel;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 解析请求体
    const body: ChatRequest = await request.json();
    const { message, studentId = DEFAULT_STUDENT_ID } = body;

    // 校验 message
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      const errorResponse: ErrorResponse = { error: "消息不能为空" };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (message.length > 2000) {
      const errorResponse: ErrorResponse = { error: "消息长度不能超过2000字符" };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 2. 调用 MemoService.recall 检索相关记忆
    let memoriesRecalled = 0;
    let memoryContext = "";
    try {
      const memories = await memoService.recall(message);
      memoriesRecalled = memories.length;
      if (memories.length > 0) {
        memoryContext = memories
          .map((m, i) => `  ${i + 1}. ${m}`)
          .join("\n");
      }
    } catch {
      memoriesRecalled = 0;
      memoryContext = "";
    }

    // 3. 知识点识别与依赖检查
    const matchedKps = matchKnowledgePoints(message);
    const dependencyReminders: string[] = [];
    const relatedKnowledgePoints: ChatResponse["relatedKnowledgePoints"] = [];

    for (const kp of matchedKps) {
      const { unmet } = checkDependencies(kp, memoryContext);
      const mastery = inferMastery(kp.name, memoryContext);

      relatedKnowledgePoints.push({
        id: kp.id,
        name: kp.name,
        mastery,
      });

      if (unmet.length > 0) {
        dependencyReminders.push(
          `该学生尚未掌握前置知识 [${unmet.join("、")}]，请在回复中先引导学生学习前置知识。`
        );
      }
    }

    // 4. 错题关联: 查找匹配知识点关联的错题
    const mistakeReminders: string[] = [];
    for (const kp of matchedKps) {
      const relatedMistakes = mistakes.filter((m) => m.knowledgePointId === kp.id);
      for (const mistake of relatedMistakes) {
        mistakeReminders.push(
          `该学生在 [${kp.name}] 上容易犯以下错误: ${mistake.commonError}，请在讲解中重点提醒。`
        );
      }
    }

    // 5. 构造 system prompt（含记忆上下文 + 依赖提醒 + 错题提醒），调用 LLMService.chat() 生成回复
    let systemPrompt = BASE_SYSTEM_PROMPT;

    // 注入记忆上下文
    if (memoryContext) {
      systemPrompt = `${systemPrompt}\n\n以下是该学生的历史学习记忆:\n${memoryContext}\n\n请基于这些信息给出个性化的辅导回复。`;
    }

    // 注入依赖提醒
    if (dependencyReminders.length > 0) {
      systemPrompt = `${systemPrompt}\n\n⚠️ 知识点依赖提醒:\n${dependencyReminders.join("\n")}`;
    }

    // 注入错题提醒
    if (mistakeReminders.length > 0) {
      systemPrompt = `${systemPrompt}\n\n💡 常见错误提醒:\n${mistakeReminders.join("\n")}`;
    }

    let reply: string;
    try {
      reply = await llmService.chat(systemPrompt, message);
    } catch {
      const errorResponse: ErrorResponse = {
        error: "抱歉，辅导老师暂时无法回复，请稍后再试。",
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    // 6. 调用 MemoService.store 将本轮对话持久化
    try {
      const entities = matchedKps.map((kp) => ({
        type: "knowledge_point",
        id: kp.id,
        name: kp.name,
        action: "studied",
        mastery: inferMastery(kp.name, memoryContext),
      }));

      await memoService.store(
        [
          { role: "user", content: message },
          { role: "assistant", content: reply },
        ],
        entities.length > 0
          ? entities
          : [{ type: "knowledge_point", action: "studied", studentId }]
      );
    } catch {
      // 存储失败降级为纯对话模式，不影响回复
    }

    // 7. 返回响应
    const response: ChatResponse = {
      reply,
      memoriesRecalled,
      relatedKnowledgePoints,
    };

    return NextResponse.json(response);
  } catch {
    const errorResponse: ErrorResponse = {
      error: "抱歉，辅导老师暂时无法回复，请稍后再试。",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
