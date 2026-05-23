// TypeScript 类型定义 — Agent 学习辅导系统

/** 知识点 */
export interface KnowledgePoint {
  id: string;
  name: string;
  dependsOn: string[];
}

/** 掌握程度枚举 */
export enum MasteryLevel {
  NotStarted = "not_started",
  Basic = "basic",
  Proficient = "proficient",
  Mastered = "mastered",
}

/** 错题 */
export interface Mistake {
  id: string;
  knowledgePointId: string;
  question: string;
  commonError: string;
  correctAnswer: string;
}

/** 学习记忆 */
export interface StudyMemory {
  userId: string;
  knowledgePointId: string;
  mastery: MasteryLevel;
  lastStudiedAt: string;
}

/** 对话消息 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/** 对话请求 */
export interface ChatRequest {
  message: string;
  studentId?: string;
}

/** 对话响应 */
export interface ChatResponse {
  reply: string;
  memoriesRecalled: number;
  relatedKnowledgePoints: {
    id: string;
    name: string;
    mastery: MasteryLevel;
  }[];
}

/** 错误响应 */
export interface ErrorResponse {
  error: string;
}
