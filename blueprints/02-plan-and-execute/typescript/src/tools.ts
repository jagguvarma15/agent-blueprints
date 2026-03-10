import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const CalculatorInputSchema = z.object({
  expression: z.string().min(1, "Expression cannot be empty"),
});

export const GetCurrentTimeInputSchema = z.object({
  timezone: z.string().optional().default("UTC"),
});

export const WebSearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
});

export function calculator(input: z.infer<typeof CalculatorInputSchema>): string {
  const parsed = CalculatorInputSchema.safeParse(input);
  if (!parsed.success) return `Error: ${parsed.error.message}`;

  const expression = parsed.data.expression.replace(/\^/g, "**");
  const blocked = [/import/i, /require/i, /process/i, /global/i, /Function/i, /__/];
  if (blocked.some((pattern) => pattern.test(expression))) {
    return "Error: Expression contains disallowed content";
  }

  try {
    const fn = new Function(
      "sqrt",
      "abs",
      "round",
      "pi",
      "e",
      `"use strict"; return (${expression});`
    );
    const result = fn(Math.sqrt, Math.abs, Math.round, Math.PI, Math.E) as unknown;
    if (typeof result !== "number") return "Error: Expression did not return a number";
    return String(result);
  } catch (err) {
    return `Error evaluating expression: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function getCurrentTime(input: z.infer<typeof GetCurrentTimeInputSchema>): string {
  const parsed = GetCurrentTimeInputSchema.safeParse(input);
  if (!parsed.success) return `Error: ${parsed.error.message}`;

  const timezone = parsed.data.timezone ?? "UTC";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "??";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
  } catch {
    return `Error: Unknown timezone ${JSON.stringify(timezone)}`;
  }
}

export function webSearch(input: z.infer<typeof WebSearchInputSchema>): string {
  const parsed = WebSearchInputSchema.safeParse(input);
  if (!parsed.success) return `Error: ${parsed.error.message}`;

  const { query } = parsed.data;
  return [
    `[SIMULATED] Web search results for: ${JSON.stringify(query)}`,
    "",
    `1. Search result 1 for: ${query}`,
    "   URL: https://example.com/result1",
    `   Simulated result about ${query}.`,
    "",
    `2. Search result 2 for: ${query}`,
    "   URL: https://example.com/result2",
    `   Another simulated result about ${query}.`,
  ].join("\n");
}

export type ToolFn = (input: Record<string, unknown>) => string;
export type ToolRegistry = Map<string, ToolFn>;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "calculator",
    description: "Evaluate a mathematical expression.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression." },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_current_time",
    description: "Get current time in a timezone.",
    input_schema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone." },
      },
      required: [],
    },
  },
  {
    name: "web_search",
    description: "Search the web for factual information.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
      },
      required: ["query"],
    },
  },
];

export function buildToolRegistry(): ToolRegistry {
  return new Map<string, ToolFn>([
    ["calculator", (input) => calculator(input as z.infer<typeof CalculatorInputSchema>)],
    [
      "get_current_time",
      (input) => getCurrentTime(input as z.infer<typeof GetCurrentTimeInputSchema>),
    ],
    ["web_search", (input) => webSearch(input as z.infer<typeof WebSearchInputSchema>)],
  ]);
}
