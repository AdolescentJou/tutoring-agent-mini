"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/types";
import KnowledgeGraph from "@/components/KnowledgeGraph";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  // 知识图谱面板状态
  const [showGraph, setShowGraph] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /** 切换知识图谱面板 */
  const toggleGraph = useCallback(() => {
    setShowGraph((prev) => !prev);
  }, []);

  const sendMessage = useCallback(async (messageText?: string) => {
    const trimmed = (messageText || input).trim();
    if (!trimmed || isLoading) return;

    // 添加用户消息
    const userMessage: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);
    setLastFailedMessage(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, studentId: "student-001" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "请求失败");
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.message !== "请求失败"
          ? err.message
          : "网络连接失败，请检查网络后重试";
      setError(errorMessage);
      setLastFailedMessage(trimmed);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading]);

  const handleRetry = () => {
    if (lastFailedMessage) {
      setError(null);
      setLastFailedMessage(null);
      // 移除最后一条用户消息（失败的那条）
      setMessages((prev) => prev.slice(0, -1));
      sendMessage(lastFailedMessage);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setLastFailedMessage(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      {/* 头部 */}
      <header className="chat-header">
        <div className="header-content">
          <div>
            <h1>🧮 小数数学辅导</h1>
            <p>初中数学智能辅导助手</p>
          </div>
          <div className="header-actions">
            <button
              onClick={toggleGraph}
              className={`memory-btn ${showGraph ? "active" : ""}`}
              title={showGraph ? "隐藏知识图谱" : "查看知识图谱"}
            >
              {showGraph ? "📊 收起" : "📊 知识图谱"}
            </button>
            {messages.length > 0 && (
              <button onClick={clearChat} className="clear-btn" title="清空对话">
                🗑️ 清空
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 知识图谱面板 */}
      {showGraph && (
        <div className="graph-panel">
          <div className="graph-panel-header">
            <span className="graph-panel-title">📊 知识图谱 — 学习路径</span>
            <button onClick={() => setShowGraph(false)} className="memory-close-btn">✕</button>
          </div>
          <div className="graph-panel-body">
            <KnowledgeGraph />
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="welcome-icon">📚</div>
            <h2>你好！我是小数</h2>
            <p>我是你的初中数学辅导老师，有任何数学问题都可以问我哦！</p>
            <div className="welcome-suggestions">
              <button onClick={() => setInput("什么是绝对值？")} className="suggestion-btn">
                什么是绝对值？
              </button>
              <button onClick={() => setInput("有理数的加法怎么算？")} className="suggestion-btn">
                有理数的加法怎么算？
              </button>
              <button onClick={() => setInput("|-(-5)| 的值是多少？")} className="suggestion-btn">
                |-(-5)| 的值是多少？
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === "user" ? "👤" : "🧮"}
            </div>
            <div className="message-bubble">
              <div className="message-content">{msg.content}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">🧮</div>
            <div className="message-bubble thinking-bubble">
              <div className="thinking-text">正在思考...</div>
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="chat-error">
          <span>{error}</span>
          <button onClick={handleRetry} className="retry-btn">
            重试
          </button>
          <button onClick={() => setError(null)} className="dismiss-btn">
            ✕
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的数学问题..."
          rows={1}
          disabled={isLoading}
          className="chat-input"
        />
        <button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          className="send-btn"
        >
          {isLoading ? "发送中" : "发送"}
        </button>
      </div>
    </div>
  );
}
