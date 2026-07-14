"use client";

import {PromptSuggestion} from "@heroui-pro/react";

import {ChatComposer} from "../components/chat-composer";
import {SUGGESTED_PROMPTS} from "../data/chat";

export function NewChatPage() {
  return (
    <div className="flex h-[calc(100svh-var(--chat-navbar-height,56px))] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-[714px] flex-col justify-center px-4 py-10">
          <PromptSuggestion>
            <PromptSuggestion.Header>
              <PromptSuggestion.Title>今天想处理什么？</PromptSuggestion.Title>
              <PromptSuggestion.Description>
                直接提问，或从下面的建议开始。本页面使用 Mock 数据，不会向后端发送任何内容。
              </PromptSuggestion.Description>
            </PromptSuggestion.Header>
            <PromptSuggestion.Items>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <PromptSuggestion.Item key={prompt}>{prompt}</PromptSuggestion.Item>
              ))}
            </PromptSuggestion.Items>
          </PromptSuggestion>
        </div>
      </div>

      <div className="bg-background shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-[714px]">
          <ChatComposer className="w-full" />
        </div>
      </div>
    </div>
  );
}
