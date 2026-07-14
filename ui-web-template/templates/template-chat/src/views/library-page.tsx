"use client";

import {Card, Chip} from "@heroui/react";
import {PromptSuggestion} from "@heroui-pro/react";

import {LIBRARY_ITEMS} from "../data/chat";

export interface LibraryPageProps {
  basePath?: string;
}

export function LibraryPage({basePath = ""}: LibraryPageProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col px-4 py-8">
        <PromptSuggestion variant="card">
          <PromptSuggestion.Header>
            <PromptSuggestion.Title>已保存的提示词与可复用配置</PromptSuggestion.Title>
            <PromptSuggestion.Description>
              模板内置的提示词预设、语气规则和示例对话均为 Mock 数据，可用于快速继续之前的工作。
            </PromptSuggestion.Description>
          </PromptSuggestion.Header>

          <PromptSuggestion.Items>
            {LIBRARY_ITEMS.map((item) => {
              const href = item.threadId ? `${basePath}/${item.threadId}` : undefined;
              const card = (
                <PromptSuggestion.Item>
                  <Card.Header>
                    <PromptSuggestion.ItemTitle>{item.title}</PromptSuggestion.ItemTitle>
                    <PromptSuggestion.ItemDescription>
                      {item.description}
                    </PromptSuggestion.ItemDescription>
                  </Card.Header>
                  <PromptSuggestion.ItemFooter>
                    <PromptSuggestion.ItemTags>
                      {item.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="soft">
                          {tag}
                        </Chip>
                      ))}
                    </PromptSuggestion.ItemTags>
                    <PromptSuggestion.ItemMeta>{item.updatedAt}</PromptSuggestion.ItemMeta>
                  </PromptSuggestion.ItemFooter>
                </PromptSuggestion.Item>
              );

              return href ? (
                <a key={item.id} className="block focus:outline-none" href={href}>
                  {card}
                </a>
              ) : (
                <div key={item.id}>{card}</div>
              );
            })}
          </PromptSuggestion.Items>
        </PromptSuggestion>
      </div>
    </div>
  );
}
