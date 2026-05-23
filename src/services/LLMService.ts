import OpenAI from "openai";

/**
 * LLMService — 封装 MiniMax Chat Completion API 调用
 * MiniMax 提供 OpenAI 兼容接口，可直接使用 openai SDK
 * API 文档: https://platform.minimaxi.com/docs/api-reference/text-chat
 */
export class LLMService {
  private client: OpenAI;
  private model = "MiniMax-M2.7";
  private timeoutMs = 30000; // 30s 超时

  constructor() {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      console.warn("[LLMService] MINIMAX_API_KEY not configured, LLM calls will fail");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.minimaxi.com/v1",
      timeout: this.timeoutMs,
    });
  }

  /**
   * 调用 LLM 生成回复
   * @param systemPrompt 系统提示词
   * @param userMessage 用户消息
   * @returns LLM 回复文本
   */
  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
      });

      const reply = response.choices[0]?.message?.content;
      if (!reply) {
        throw new Error("LLM returned empty response");
      }
      return reply;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[LLMService] Chat completion failed:", message);
      throw new Error(`LLM 调用失败: ${message}`);
    }
  }
}
