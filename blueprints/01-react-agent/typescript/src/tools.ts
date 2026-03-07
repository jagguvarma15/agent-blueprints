/**
 * Tool implementations for the ReAct agent blueprint.
 *
 * Each tool function:
 * - Accepts a typed input object validated by Zod
 * - Returns a plain string
 * - Catches exceptions internally and returns an error string
 *
 * TOOL_DEFINITIONS is the registry consumed by the Anthropic Messages API.
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

export const CalculatorInputSchema = z.object({
  expression: z
    .string()
    .min(1, "Expression cannot be empty")
    .describe(
      "A mathematical expression to evaluate. Examples: '2 + 2', 'Math.sqrt(144)', '100 / 7'"
    ),
});

export const GetCurrentTimeInputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .default("UTC")
    .describe("IANA timezone name, e.g. 'UTC', 'America/New_York', 'Europe/London'"),
});

export const WebSearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Query cannot be empty")
    .describe("The search query string"),
});

// Inferred input types
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>;
export type GetCurrentTimeInput = z.infer<typeof GetCurrentTimeInputSchema>;
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * Safely evaluate a mathematical expression and return the result as a string.
 *
 * Uses the Function constructor with a restricted scope. Supports standard
 * JavaScript math operations and Math.* functions.
 *
 * NOTE: For production use, consider a purpose-built expression parser like
 * mathjs (https://mathjs.org/) for better security and feature coverage.
 */
export function calculator(input: CalculatorInput): string {
  const parsed = CalculatorInputSchema.safeParse(input);
  if (!parsed.success) {
    return `Error: Invalid input: ${parsed.error.message}`;
  }

  const { expression } = parsed.data;

  // Allowlist of safe tokens: digits, operators, spaces, parentheses, dots,
  // commas, and Math identifiers
  const safePattern =
    /^[\d\s\+\-\*\/\%\(\)\.\,\^]+$|^(Math\.[a-zA-Z]+[\d\s\+\-\*\/\%\(\)\.\,]*)+$/;

  // More permissive: allow any combination of math tokens
  const allowedTokens = /^[0-9\s\+\-\*\/\%\(\)\.\,\^]+$|Math\.[a-zA-Z0-9]+/;

  // Disallow anything that looks like code injection
  const dangerousPatterns = [
    /import/i,
    /require/i,
    /process/i,
    /global/i,
    /window/i,
    /document/i,
    /eval/i,
    /Function/,
    /constructor/i,
    /prototype/i,
    /__/,
    /fetch/i,
    /XMLHttpRequest/i,
    /fs\./i,
    /child_process/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(expression)) {
      return `Error: Expression contains disallowed pattern: ${pattern}`;
    }
  }

  // Replace ^ with ** for Python-style power notation
  const sanitized = expression.replace(/\^/g, "**");

  try {
    // Use Function constructor in a restricted context
    // Provide Math functions explicitly without global access
    const mathContext = {
      Math,
      abs: Math.abs,
      sqrt: Math.sqrt,
      log: Math.log,
      log2: Math.log2,
      log10: Math.log10,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,
      atan2: Math.atan2,
      ceil: Math.ceil,
      floor: Math.floor,
      round: Math.round,
      pow: Math.pow,
      PI: Math.PI,
      E: Math.E,
      pi: Math.PI,
      e: Math.E,
    };

    const paramNames = Object.keys(mathContext);
    const paramValues = Object.values(mathContext);

    // eslint-disable-next-line no-new-func
    const fn = new Function(...paramNames, `"use strict"; return (${sanitized});`);
    const result: unknown = fn(...paramValues);

    if (typeof result !== "number") {
      return `Error: Expression did not return a number (got ${typeof result})`;
    }
    if (!isFinite(result)) {
      return result === Infinity
        ? "Infinity"
        : result === -Infinity
          ? "-Infinity"
          : "Error: Result is NaN";
    }

    // Format cleanly: integers as integers, floats with reasonable precision
    return Number.isInteger(result) ? String(result) : String(result);
  } catch (err) {
    return `Error evaluating expression: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Return the current date and time in the specified timezone.
 *
 * Uses the Intl.DateTimeFormat API which is built into Node.js and browsers.
 */
export function getCurrentTime(input: GetCurrentTimeInput): string {
  const parsed = GetCurrentTimeInputSchema.safeParse(input);
  if (!parsed.success) {
    return `Error: Invalid input: ${parsed.error.message}`;
  }

  const timezone = parsed.data.timezone ?? "UTC";

  try {
    const now = new Date();

    // Validate the timezone by attempting to format with it
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
    const get = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? "??";

    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");
    const second = get("second");
    const tzName = get("timeZoneName");

    return `${year}-${month}-${day} ${hour}:${minute}:${second} ${tzName}`;
  } catch (err) {
    if (err instanceof RangeError) {
      return (
        `Error: Unknown timezone ${JSON.stringify(timezone)}. ` +
        "Use an IANA timezone name such as 'UTC', 'America/New_York', or 'Europe/London'."
      );
    }
    return `Error getting time: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Perform a web search and return results.
 *
 * NOTE: This is a simulated implementation that returns placeholder results.
 * To use real search, replace this function body with an actual search API
 * integration (e.g. Brave Search, Tavily, SerpAPI, or Exa).
 *
 * Example with Tavily:
 *   const response = await fetch('https://api.tavily.com/search', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 3 })
 *   });
 *   const data = await response.json();
 *   return data.results.map(r => `${r.title}\n${r.content}`).join('\n\n');
 */
export function webSearch(input: WebSearchInput): string {
  const parsed = WebSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    return `Error: Invalid input: ${parsed.error.message}`;
  }

  const { query } = parsed.data;

  const simulatedResults = [
    {
      title: `Search result 1 for: ${query}`,
      url: "https://example.com/result1",
      snippet:
        `This is a simulated search result for '${query}'. ` +
        "In a real implementation, this would contain actual web content " +
        "retrieved from a search API such as Brave, Tavily, or SerpAPI.",
    },
    {
      title: `Search result 2 for: ${query}`,
      url: "https://example.com/result2",
      snippet:
        `Another simulated result for '${query}'. ` +
        "Replace the webSearch function in tools.ts with a real search " +
        "integration to get actual results.",
    },
  ];

  const lines: string[] = [`[SIMULATED] Web search results for: ${JSON.stringify(query)}\n`];

  simulatedResults.forEach((result, i) => {
    lines.push(`${i + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    lines.push(`   ${result.snippet}`);
    lines.push("");
  });

  lines.push(
    "Note: These are simulated results. " +
      "See tools.ts webSearch() for instructions on adding real search."
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool format)
// ---------------------------------------------------------------------------

export type AnthropicTool = Anthropic.Tool;

export const TOOL_DEFINITIONS: AnthropicTool[] = [
  {
    name: "calculator",
    description:
      "Evaluate a mathematical expression and return the numeric result. " +
      "Supports arithmetic operators (+, -, *, /, %, **) and Math functions: " +
      "sqrt, log, log2, log10, sin, cos, tan, asin, acos, atan, atan2, " +
      "ceil, floor, round, abs, pow. Constants: PI, E, pi, e. " +
      "Example expressions: '2 ** 10', 'sqrt(144)', '(15 + 7) * 3 / 2'.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "The mathematical expression to evaluate. " +
            "Use JavaScript math syntax. " +
            "Examples: '2 + 2', 'sqrt(16)', '100 / 7', '2 ** 32'.",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_current_time",
    description:
      "Get the current date and time in a specified timezone. " +
      "Useful when the user asks about the current time, today's date, " +
      "or needs to know the time in a specific location.",
    input_schema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            "IANA timezone name. Examples: 'UTC', 'America/New_York', " +
            "'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'. " +
            "Defaults to UTC if not specified.",
        },
      },
      required: [],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for current information about a topic. " +
      "Use this when you need up-to-date information, facts you're uncertain about, " +
      "or details about recent events. Returns a list of relevant search results " +
      "with titles, URLs, and snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Be specific and concise for best results. " +
            "Example: 'population of Tokyo 2024' rather than 'Tokyo'.",
        },
      },
      required: ["query"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher type
// ---------------------------------------------------------------------------

/** Map of tool name → implementation function */
export type ToolRegistry = Map<string, (input: Record<string, unknown>) => string>;

/** Build the default tool registry */
export function buildToolRegistry(): ToolRegistry {
  const registry: ToolRegistry = new Map();

  registry.set("calculator", (input) =>
    calculator(CalculatorInputSchema.parse(input))
  );
  registry.set("get_current_time", (input) =>
    getCurrentTime(GetCurrentTimeInputSchema.parse(input))
  );
  registry.set("web_search", (input) =>
    webSearch(WebSearchInputSchema.parse(input))
  );

  return registry;
}
