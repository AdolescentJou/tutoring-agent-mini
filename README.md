# 🧮 小数 — 初中数学智能辅导助手

基于 **Next.js + MiniMax LLM + Mem0 长期记忆** 的初中数学辅导 Agent，具备**知识点依赖追踪**、**错题关联提醒**和**学习记忆持久化**能力。

## ✨ 核心能力

- **个性化对话辅导** — 基于 MiniMax-M2.7 模型，以"小数"老师身份进行启发式教学
- **长期学习记忆** — 通过 Mem0 自动存储与召回学生历史学习记录
- **知识图谱驱动** — 30 个有理数章节知识点及依赖关系，自动检测前置知识掌握情况
- **错题智能提醒** — 关联 10 类常见错题模式，在相关知识点讲解时主动预警

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（复制并填写）
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

## ⚙️ 环境配置

| 变量 | 说明 | 获取地址 |
|---|---|---|
| `MINIMAX_API_KEY` | LLM 对话生成（OpenAI 兼容接口） | [MiniMax 控制台](https://platform.minimaxi.com/user-center/basic-information/interface-key) |
| `MEM0_API_KEY` | 学习记忆存储与召回 | [Mem0 控制台](https://app.mem0.ai/dashboard/api-keys) |

> 未配置 `MEM0_API_KEY` 时系统自动降级为纯对话模式，不影响基本使用。

## 📁 项目结构

```
src/
├── app/
│   ├── page.tsx              # 聊天界面（React Client Component）
│   └── api/chat/route.ts     # 对话 API（核心编排逻辑）
├── services/
│   ├── LLMService.ts         # MiniMax LLM 调用封装
│   └── MemoService.ts        # Mem0 记忆存储/召回封装
├── data/
│   ├── knowledgePoints.json  # 知识点及依赖关系（30 个）
│   └── mistakes.json         # 常见错题库（10 类）
└── types/index.ts            # TypeScript 类型定义
```

## 🛠 技术栈

[Next.js 16](https://nextjs.org) · [React 19](https://react.dev) · [TypeScript](https://typescriptlang.org) · [MiniMax M2.7](https://platform.minimaxi.com) · [Mem0](https://mem0.ai)
