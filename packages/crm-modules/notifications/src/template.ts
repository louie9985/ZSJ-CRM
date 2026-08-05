import { createRequire } from "node:module";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Nodes } from "mdast";

import { NotificationError } from "./errors.js";
import { sha256, stable } from "./validation.js";
import type {
  JsonPrimitive,
  JsonValue,
  NotificationTemplateDefinition,
  TemplateRelease,
} from "./types.js";

const require = createRequire(import.meta.url);
const mustache = require("mustache") as {
  render(template: string, view: unknown, partials?: unknown, options?: { escape?: (value: string) => string }): string;
  parse(template: string): unknown;
};
const Ajv = require("ajv") as new(options?: Record<string, unknown>) => { compile(schema: object): (value: unknown) => boolean };
const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/gu;
const MARKDOWN_ESCAPE = /([\\`*_{}[\]()<>#+.!|>-])/gu;

function replaceControlCharacters(value: string, preserveTab: boolean): string {
  return Array.from(value).map((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && (!preserveTab || code !== 9)) ? " " : character;
  }).join("");
}

export const variableNames = (source: string): readonly string[] =>
  [...source.matchAll(VARIABLE)].flatMap((match) => match[1] === undefined ? [] : [match[1]]);

export const digestTemplate = (input: Omit<TemplateRelease, "contentDigest">): string => sha256(stable(input));

export function validatePlainTemplate(value: string, maximum: number): string {
  const source = validateTemplateSource(value, maximum);
  if (replaceControlCharacters(source, true) !== source) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  }
  return source;
}

export function validateRestrictedMarkdown(value: string): string {
  const source = validateTemplateSource(value, 8_000);
  const allowed = new Set(["root", "paragraph", "text", "strong", "emphasis", "list", "listItem", "blockquote", "inlineCode", "break"]);
  let tree: Nodes;
  try {
    tree = unified().use(remarkParse).parse(source) as Nodes;
  } catch (error) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID", { cause: error });
  }
  const visit = (node: Nodes): void => {
    if (!allowed.has(node.type)) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(tree);
  return source;
}

export function validateTemplateSource(value: string, maximum = 8_000): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /\{\{\{/u.test(value) || /(?:__proto__|prototype|constructor)/u.test(value)) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  }
  const tags = [...value.matchAll(/\{\{[\s\S]*?\}\}/gu)].map((match) => match[0]);
  if (tags.some((tag) => !/^\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}$/u.test(tag))) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  }
  try { mustache.parse(value); } catch (error) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID", { cause: error });
  }
  return value;
}

export function variableSchema(definition: NotificationTemplateDefinition, used: readonly string[]): Readonly<Record<string, unknown>> {
  const byKey = new Map(definition.allowedVariables.map((item) => [item.key, item]));
  if (used.some((key) => !byKey.has(key))) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  return Object.freeze({
    additionalProperties: false,
    properties: Object.fromEntries([...new Set(used)].sort().map((key) => {
      const item = byKey.get(key);
      if (item === undefined) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
      const type = item.type === "date-time" ? { format: "date-time", type: "string" }
        : item.type === "integer" ? { type: "integer" }
          : { type: item.type };
      return [key, { ...type, ...(item.maximumLength === undefined ? {} : { maxLength: item.maximumLength }) }];
    })),
    required: [...new Set(used)].sort(),
    type: "object",
  });
}

export function validateTemplateRelease(release: TemplateRelease): void {
  try { new Ajv({ allErrors: true, strict: true, validateFormats: false }).compile(release.variableSchema); } catch (error) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID", { cause: error });
  }
  const properties = release.variableSchema["properties"];
  const required = release.variableSchema["required"];
  if (release.variableSchema["type"] !== "object" || release.variableSchema["additionalProperties"] !== false || typeof properties !== "object" || properties === null || Array.isArray(properties) || !Array.isArray(required)) {
    throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  }
  const summary = release.summaryTemplate ?? release.bodyTemplate;
  validatePlainTemplate(release.titleTemplate, 512);
  validatePlainTemplate(summary, 2_000);
  if ((release.bodyFormat ?? "plain-text") === "restricted-markdown") validateRestrictedMarkdown(release.bodyTemplate);
  else validateTemplateSource(release.bodyTemplate);
  const names = [...variableNames(release.titleTemplate), ...variableNames(summary), ...variableNames(release.bodyTemplate)];
  if (names.some((key) => !Object.hasOwn(properties, key) || !required.includes(key))) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
}

function plain(value: JsonPrimitive): string {
  if (value === null) return "";
  return replaceControlCharacters(String(value), false);
}

function markdown(value: JsonPrimitive): string {
  return plain(value).replace(MARKDOWN_ESCAPE, "\\$1");
}

export function renderTemplate(
  release: TemplateRelease,
  variables: Readonly<Record<string, JsonValue>>,
): { readonly title: string; readonly summary: string; readonly body: string } {
  validateTemplateRelease(release);
  const validate = new Ajv({ allErrors: true, strict: true, validateFormats: false }).compile(release.variableSchema);
  if (!validate(variables)) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  const plainVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, plain(value as JsonPrimitive)]));
  const markdownVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, markdown(value as JsonPrimitive)]));
  const options = { escape: (value: string): string => value };
  const title = mustache.render(release.titleTemplate, plainVariables, undefined, options);
  const summary = mustache.render(release.summaryTemplate ?? release.bodyTemplate, plainVariables, undefined, options);
  const body = mustache.render(release.bodyTemplate, (release.bodyFormat ?? "plain-text") === "restricted-markdown" ? markdownVariables : plainVariables, undefined, options);
  if (title.length > 512 || summary.length > 2_000 || body.length > 8_000) throw new NotificationError("NOTIFICATION_TEMPLATE_INVALID");
  return { body, summary, title };
}
