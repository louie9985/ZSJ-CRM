"use client";

import type {ChatMessage, ChatMessageSource, ChatMessageTool} from "../data/chat";

import {
  ChainOfThought,
  ChatLoader,
  ChatMessage as ChatMessagePrimitive,
  ChatSource,
  ChatSources,
  ChatTool,
  ChatToolGroup,
  Markdown,
  TextShimmer,
} from "@heroui-pro/react";

import {chatStrings} from "../i18n/strings";

import {ChatAttachmentList} from "./chat-attachment-list";
import {MessageActions} from "./message-actions";

export interface ThreadMessageProps {
  message: ChatMessage;
}

function renderSource(source: ChatMessageSource, key: string) {
  if (source.sourceType === "url") {
    return (
      <ChatSource
        key={key}
        description={source.description}
        href={source.url}
        sourceType="url"
        title={source.title}
      />
    );
  }

  return <ChatSource key={key} sourceType="document" title={source.title} />;
}

function renderTool(tool: ChatMessageTool, prefix: string, key: string) {
  if (tool.state === "requires-action") {
    return (
      <ChatTool
        key={key}
        defaultExpanded
        approveLabel={chatStrings.tool.approve}
        argsText={tool.argsText}
        input={tool.input}
        output={tool.output}
        rejectLabel={chatStrings.tool.reject}
        state={tool.state}
        toolName={tool.toolName}
        triggerPrefix={`${chatStrings.tool.approvalNeeded} `}
        onApprove={() => undefined}
        onReject={() => undefined}
      />
    );
  }

  return (
    <ChatTool
      key={key}
      argsText={tool.argsText}
      defaultExpanded={tool.state === "input-streaming"}
      errorText={tool.errorText}
      input={tool.input}
      output={tool.output}
      state={tool.state}
      toolName={tool.toolName}
      triggerPrefix={`${prefix} `}
    />
  );
}

export function ThreadMessage({message}: ThreadMessageProps) {
  if (message.role === "user") {
    return (
      <ChatMessagePrimitive.User>
        {message.attachments?.length ? (
          <ChatAttachmentList attachments={message.attachments} className="mb-2" />
        ) : null}
        <ChatMessagePrimitive.Bubble>
          <ChatMessagePrimitive.Content>{message.text}</ChatMessagePrimitive.Content>
        </ChatMessagePrimitive.Bubble>
      </ChatMessagePrimitive.User>
    );
  }

  return (
    <ChatMessagePrimitive.Assistant>
      <ChatMessagePrimitive.Avatar
        alt={message.avatar?.alt ?? chatStrings.assistant.avatarAlt}
        fallback={message.avatar?.fallback ?? chatStrings.assistant.avatarFallback}
        show={message.showAvatar ?? false}
        src={message.avatar?.src}
      />

      <ChatMessagePrimitive.Body>
        {message.reasoning ? (
          <ChainOfThought defaultExpanded={message.reasoning.defaultExpanded ?? false}>
            <ChainOfThought.Trigger>{message.reasoning.trigger}</ChainOfThought.Trigger>
            <ChainOfThought.Content>
              <ChainOfThought.Steps>
                {message.reasoning.steps.map((step) => (
                  <ChainOfThought.Step key={step.label} label={step.label}>
                    {step.content}
                  </ChainOfThought.Step>
                ))}
              </ChainOfThought.Steps>
            </ChainOfThought.Content>
          </ChainOfThought>
        ) : null}

        {message.toolGroup ? (
          <ChatToolGroup active={message.toolGroup.active} defaultExpanded={false}>
            <ChatToolGroup.Trigger>{message.toolGroup.label}</ChatToolGroup.Trigger>
            <ChatToolGroup.Content>
              {message.toolGroup.tools.map((tool, index) =>
                renderTool(tool, chatStrings.tool.used, `${tool.toolName}-${index}`),
              )}
            </ChatToolGroup.Content>
          </ChatToolGroup>
        ) : null}

        {message.tools?.map((tool, index) =>
          renderTool(tool, chatStrings.tool.used, `${tool.toolName}-${index}`),
        )}

        {message.status === "streaming" ? (
          <>
            {message.text ? <TextShimmer>{message.text}</TextShimmer> : null}
            <ChatLoader.Dots />
          </>
        ) : null}

        {message.status === "skeleton" ? (
          <ChatLoader.Skeleton label={message.loaderLabel ?? chatStrings.loading.pending} />
        ) : null}

        {message.status !== "streaming" && message.status !== "skeleton" ? (
          <>
            {message.markdown ? (
              <ChatMessagePrimitive.Content>
                <Markdown>{message.markdown}</Markdown>
              </ChatMessagePrimitive.Content>
            ) : message.text ? (
              <ChatMessagePrimitive.Content>
                <Markdown>{message.text}</Markdown>
              </ChatMessagePrimitive.Content>
            ) : null}

            {message.listItems?.length ? (
              <ChatMessagePrimitive.Content>
                <ol className="list-decimal space-y-1 pl-6">
                  {message.listItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </ChatMessagePrimitive.Content>
            ) : null}

            {message.image ? (
              <ChatMessagePrimitive.Media>
                <img
                  alt={message.image.alt}
                  className="size-[341px] rounded-2xl object-cover"
                  src={message.image.src}
                />
              </ChatMessagePrimitive.Media>
            ) : null}

            {message.sourceGroup ? (
              <ChatSources defaultExpanded={false}>
                <ChatSources.Trigger>{message.sourceGroup.label}</ChatSources.Trigger>
                <ChatSources.Content>
                  <ChatSources.List>
                    {message.sourceGroup.sources.map((source, index) =>
                      renderSource(
                        source,
                        source.sourceType === "url"
                          ? `${source.url}-${index}`
                          : `${source.title}-${index}`,
                      ),
                    )}
                  </ChatSources.List>
                </ChatSources.Content>
              </ChatSources>
            ) : null}

            {message.sources?.map((source, index) =>
              renderSource(source, `${source.title}-${index}`),
            )}

            {message.actions ? <MessageActions variant={message.actions} /> : null}
          </>
        ) : null}
      </ChatMessagePrimitive.Body>
    </ChatMessagePrimitive.Assistant>
  );
}
