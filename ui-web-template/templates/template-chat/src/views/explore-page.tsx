"use client";

import {Card} from "@heroui/react";
import {PromptSuggestion} from "@heroui-pro/react";

import {EXPLORE_CATEGORIES} from "../data/chat";

export function ExplorePage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col px-4 py-8">
        <PromptSuggestion variant="card">
          <PromptSuggestion.Header>
            <PromptSuggestion.Title>日常工作的示例提示词</PromptSuggestion.Title>
            <PromptSuggestion.Description>
              选择一项查看此模板适合的对话类型。提示词均为 Mock 数据，不会发送到后端。
            </PromptSuggestion.Description>
          </PromptSuggestion.Header>

          <div className="mt-8 flex flex-col gap-8">
            {EXPLORE_CATEGORIES.map((category) => (
              <PromptSuggestion.Group
                key={category.id}
                description={category.subtitle}
                label={category.title}
              >
                <PromptSuggestion.Items>
                  {category.prompts.map((prompt) => (
                    <PromptSuggestion.Item key={prompt.id}>
                      <Card.Header>
                        <PromptSuggestion.ItemTitle>{prompt.title}</PromptSuggestion.ItemTitle>
                        <PromptSuggestion.ItemDescription>
                          {prompt.description}
                        </PromptSuggestion.ItemDescription>
                      </Card.Header>
                    </PromptSuggestion.Item>
                  ))}
                </PromptSuggestion.Items>
              </PromptSuggestion.Group>
            ))}
          </div>
        </PromptSuggestion>
      </div>
    </div>
  );
}
