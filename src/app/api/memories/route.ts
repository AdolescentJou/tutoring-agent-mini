import { NextResponse } from "next/server";
import { MemoService } from "@/services/MemoService";

const memoService = new MemoService();

/**
 * GET /api/memories
 * 全量获取当前学生的所有学习记忆
 */
export async function GET() {
  try {
    const memories = await memoService.getAll();

    return NextResponse.json({
      memories,
      total: memories.length,
      studentId: "student-001",
    });
  } catch {
    return NextResponse.json(
      { error: "获取学习记忆失败，请稍后再试" },
      { status: 500 }
    );
  }
}
