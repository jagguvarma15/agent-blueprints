/**
 * Tests for the ReAct Agent blueprint (TypeScript).
 *
 * Test strategy:
 * - Unit tests for tools (calculator, getCurrentTime, webSearch)
 * - Unit tests for agent internals (callTool dispatch, extractText)
 * - Integration tests for a full agent.run() call with a mocked Anthropic client
 *
 * Run with:
 *   pnpm test
 *   # or
 *   pnpm vitest run
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { ReActAgent } from "../src/agent.js";
import {
  calculator,
  getCurrentTime,
  webSearch,
  TOOL_DEFINITIONS,
  buildToolRegistry,
} from "../src/tools.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeTextBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text };
}

function makeToolUseBlock(
  id: string,
  name: string,
  input: Record<string, unknown>
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

function makeResponse(
  stopReason: string,
  content: Anthropic.ContentBlock[]
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-opus-4-6",
    stop_reason: stopReason as Anthropic.Message["stop_reason"],
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function makeMockClient(): { messages: { create: Mock } } {
  return {
    messages: {
      create: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

function makeAgent(mockClient: ReturnType<typeof makeMockClient>): ReActAgent {
  const agent = new ReActAgent({
    model: "claude-opus-4-6",
    tools: TOOL_DEFINITIONS,
    maxIterations: 5,
    client: mockClient as unknown as Anthropic,
  });
  agent.setToolRegistry(buildToolRegistry());
  return agent;
}

// ---------------------------------------------------------------------------
// Calculator tool tests
// ---------------------------------------------------------------------------

describe("calculator", () => {
  it("evaluates basic arithmetic", () => {
    expect(calculator({ expression: "2 + 2" })).toBe("4");
    expect(calculator({ expression: "10 - 3" })).toBe("7");
    expect(calculator({ expression: "4 * 5" })).toBe("20");
    expect(calculator({ expression: "10 / 4" })).toBe("2.5");
  });

  it("evaluates exponentiation", () => {
    expect(calculator({ expression: "2 ** 10" })).toBe("1024");
  });

  it("evaluates math functions", () => {
    expect(calculator({ expression: "sqrt(144)" })).toBe("12");
    expect(calculator({ expression: "abs(-42)" })).toBe("42");
  });

  it("handles division by zero as Infinity", () => {
    const result = calculator({ expression: "1 / 0" });
    expect(result).toBe("Infinity");
  });

  it("returns error for empty expression", () => {
    const result = calculator({ expression: "" });
    expect(result).toMatch(/Error/i);
  });

  it("blocks dangerous code: import", () => {
    const result = calculator({ expression: "import('fs')" });
    expect(result).toMatch(/Error/i);
  });

  it("blocks dangerous code: process", () => {
    const result = calculator({ expression: "process.exit(1)" });
    expect(result).toMatch(/Error/i);
  });

  it("handles math constants", () => {
    const result = calculator({ expression: "pi" });
    expect(parseFloat(result)).toBeCloseTo(Math.PI, 5);
  });

  it("evaluates nested expressions", () => {
    expect(calculator({ expression: "sqrt(2 ** 8)" })).toBe("16");
  });
});

// ---------------------------------------------------------------------------
// getCurrentTime tool tests
// ---------------------------------------------------------------------------

describe("getCurrentTime", () => {
  it("returns a valid datetime string for UTC", () => {
    const result = getCurrentTime({ timezone: "UTC" });
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/); // date portion
    expect(result).toMatch(/UTC|GMT/i);
  });

  it("returns error for unknown timezone", () => {
    const result = getCurrentTime({ timezone: "Fake/Timezone" });
    expect(result).toMatch(/Error/i);
    expect(result).toContain("Fake/Timezone");
  });

  it("defaults to UTC when no timezone provided", () => {
    const result = getCurrentTime({});
    expect(result).toMatch(/UTC|GMT/i);
  });

  it("handles America/New_York timezone", () => {
    const result = getCurrentTime({ timezone: "America/New_York" });
    // Should contain EST or EDT
    expect(result).toMatch(/E[SD]T|ET/i);
  });

  it("returns string starting with year", () => {
    const result = getCurrentTime({ timezone: "UTC" });
    expect(result).toMatch(/^20\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// webSearch tool tests
// ---------------------------------------------------------------------------

describe("webSearch", () => {
  it("returns a string", () => {
    expect(typeof webSearch({ query: "test" })).toBe("string");
  });

  it("contains the query in results", () => {
    const result = webSearch({ query: "artificial intelligence" });
    expect(result).toContain("artificial intelligence");
  });

  it("indicates simulated results", () => {
    const result = webSearch({ query: "anything" });
    expect(result.toLowerCase()).toContain("simulated");
  });

  it("returns multiple results", () => {
    const result = webSearch({ query: "Python programming" });
    expect(result).toContain("1.");
    expect(result).toContain("2.");
  });

  it("returns error for empty query", () => {
    const result = webSearch({ query: "" });
    expect(result).toMatch(/Error/i);
  });
});

// ---------------------------------------------------------------------------
// Agent initialisation tests
// ---------------------------------------------------------------------------

describe("ReActAgent initialisation", () => {
  const mockClient = makeMockClient();

  it("stores model name", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.model).toBe("claude-opus-4-6");
  });

  it("uses default maxIterations of 10", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.maxIterations).toBe(10);
  });

  it("uses custom maxIterations", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      maxIterations: 3,
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.maxIterations).toBe(3);
  });

  it("uses custom system prompt", () => {
    const custom = "You are a test agent.";
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      systemPrompt: custom,
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.systemPrompt).toBe(custom);
  });

  it("stores tool definitions", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: TOOL_DEFINITIONS,
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.tools).toBe(TOOL_DEFINITIONS);
  });
});

// ---------------------------------------------------------------------------
// callTool dispatch tests
// ---------------------------------------------------------------------------

describe("ReActAgent.callTool", () => {
  const mockClient = makeMockClient();

  it("returns error for unknown tool", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    const result = agent.callTool("nonexistent", {});
    expect(result).toMatch(/Error/i);
    expect(result).toContain("nonexistent");
  });

  it("dispatches calculator correctly", () => {
    const agent = makeAgent(mockClient);
    const result = agent.callTool("calculator", { expression: "2 + 2" });
    expect(result).toBe("4");
  });

  it("dispatches get_current_time correctly", () => {
    const agent = makeAgent(mockClient);
    const result = agent.callTool("get_current_time", { timezone: "UTC" });
    expect(result).toMatch(/UTC/i);
  });

  it("dispatches web_search correctly", () => {
    const agent = makeAgent(mockClient);
    const result = agent.callTool("web_search", { query: "test query" });
    expect(result).toContain("test query");
  });

  it("handles tool exceptions gracefully", () => {
    const agent = makeAgent(mockClient);
    agent.registerTool("failing", () => {
      throw new Error("Something went wrong");
    });
    const result = agent.callTool("failing", {});
    expect(result).toMatch(/Error/i);
    expect(result).toContain("failing");
  });
});

// ---------------------------------------------------------------------------
// extractText helper tests
// ---------------------------------------------------------------------------

describe("ReActAgent.extractText", () => {
  const mockClient = makeMockClient();

  it("extracts text from single text block", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    const result = agent.extractText([makeTextBlock("Hello, world!")]);
    expect(result).toBe("Hello, world!");
  });

  it("concatenates multiple text blocks", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    const result = agent.extractText([
      makeTextBlock("Part 1."),
      makeTextBlock("Part 2."),
    ]);
    expect(result).toContain("Part 1.");
    expect(result).toContain("Part 2.");
  });

  it("ignores non-text blocks", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    const result = agent.extractText([
      makeToolUseBlock("id1", "calculator", { expression: "2+2" }),
      makeTextBlock("Final answer"),
    ]);
    expect(result).toBe("Final answer");
  });

  it("returns empty string for empty content", () => {
    const agent = new ReActAgent({
      model: "claude-opus-4-6",
      tools: [],
      client: mockClient as unknown as Anthropic,
    });
    expect(agent.extractText([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Full agent.run() integration tests (mocked API)
// ---------------------------------------------------------------------------

describe("ReActAgent.run", () => {
  let mockClient: ReturnType<typeof makeMockClient>;
  let agent: ReActAgent;

  beforeEach(() => {
    mockClient = makeMockClient();
    agent = makeAgent(mockClient);
  });

  it("returns immediately when model answers without using tools", async () => {
    const finalText = "The answer is 42.";
    mockClient.messages.create.mockResolvedValue(
      makeResponse("end_turn", [makeTextBlock(finalText)])
    );

    const result = await agent.run("What is the meaning of life?");

    expect(result.answer).toBe(finalText);
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it("calls calculator once and returns final answer", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(
        makeResponse("tool_use", [
          makeToolUseBlock("tu_001", "calculator", { expression: "2 ** 10" }),
        ])
      )
      .mockResolvedValueOnce(
        makeResponse("end_turn", [makeTextBlock("2 to the power of 10 is 1024.")])
      );

    const result = await agent.run("What is 2 to the power of 10?");

    expect(result.answer).toBe("2 to the power of 10 is 1024.");
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("returns error when max iterations is exceeded", async () => {
    // Always return a tool_use response — will loop until maxIterations
    mockClient.messages.create.mockResolvedValue(
      makeResponse("tool_use", [
        makeToolUseBlock("tu_loop", "calculator", { expression: "1 + 1" }),
      ])
    );

    const result = await agent.run("Loop forever");

    expect(result.success).toBe(false);
    expect(result.answer).toContain("Max iterations");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(agent.maxIterations);
  });

  it("builds correct message history after a tool call", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(
        makeResponse("tool_use", [
          makeToolUseBlock("tu_002", "calculator", { expression: "10 * 10" }),
        ])
      )
      .mockResolvedValueOnce(
        makeResponse("end_turn", [makeTextBlock("10 * 10 = 100")])
      );

    await agent.run("What is 10 times 10?");

    // Second API call should have 3 messages: user, assistant(tool_use), user(tool_result)
    const secondCallArgs = mockClient.messages.create.mock.calls[1]?.[0] as {
      messages: Anthropic.MessageParam[];
    };
    const messages = secondCallArgs.messages;

    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[2]?.role).toBe("user");

    const toolResultContent = messages[2]?.content as Anthropic.ToolResultBlockParam[];
    expect(Array.isArray(toolResultContent)).toBe(true);
    expect(toolResultContent[0]?.type).toBe("tool_result");
    expect(toolResultContent[0]?.tool_use_id).toBe("tu_002");
    expect(toolResultContent[0]?.content).toBe("100");
  });

  it("handles unknown tool call gracefully without throwing", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(
        makeResponse("tool_use", [
          makeToolUseBlock("tu_003", "unknown_tool", { arg: "value" }),
        ])
      )
      .mockResolvedValueOnce(
        makeResponse("end_turn", [makeTextBlock("I tried unknown_tool but it failed.")])
      );

    const result = await agent.run("Use the unknown tool");

    // Should not throw
    expect(typeof result.answer).toBe("string");

    // Error should be in the tool result sent to the API
    const secondCallArgs = mockClient.messages.create.mock.calls[1]?.[0] as {
      messages: Anthropic.MessageParam[];
    };
    const messages = secondCallArgs.messages;
    const toolResultContent = messages[2]?.content as Anthropic.ToolResultBlockParam[];
    expect(toolResultContent[0]?.content).toMatch(/Error/i);
    expect(String(toolResultContent[0]?.content)).toContain("unknown_tool");
  });

  it("passes tool definitions to the API", async () => {
    mockClient.messages.create.mockResolvedValue(
      makeResponse("end_turn", [makeTextBlock("Done.")])
    );

    await agent.run("Do something");

    const callArgs = mockClient.messages.create.mock.calls[0]?.[0] as {
      tools: Anthropic.Tool[];
    };
    expect(callArgs.tools).toBe(TOOL_DEFINITIONS);
  });

  it("passes system prompt to the API", async () => {
    mockClient.messages.create.mockResolvedValue(
      makeResponse("end_turn", [makeTextBlock("Done.")])
    );

    await agent.run("Hi");

    const callArgs = mockClient.messages.create.mock.calls[0]?.[0] as {
      system: string;
    };
    expect(callArgs.system).toBe(agent.systemPrompt);
  });

  it("records steps for each iteration", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(
        makeResponse("tool_use", [
          makeTextBlock("Let me calculate that."),
          makeToolUseBlock("tu_step", "calculator", { expression: "5 + 5" }),
        ])
      )
      .mockResolvedValueOnce(
        makeResponse("end_turn", [makeTextBlock("5 + 5 = 10")])
      );

    const result = await agent.run("What is 5 + 5?");

    expect(result.steps.length).toBeGreaterThan(0);
    const stepTypes = result.steps.map((s) => s.type);
    expect(stepTypes).toContain("thinking");
    expect(stepTypes).toContain("tool_call");
    expect(stepTypes).toContain("tool_result");
    expect(stepTypes).toContain("final_answer");
  });
});
