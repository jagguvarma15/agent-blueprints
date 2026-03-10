import { describe, it, expect, vi, type Mock } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { PlanExecuteAgent } from "../src/agent.js";
import { TOOL_DEFINITIONS, buildToolRegistry } from "../src/tools.js";

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

function makeMessage(stopReason: Anthropic.Message["stop_reason"], content: Anthropic.ContentBlock[]) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-opus-4-6",
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } satisfies Anthropic.Message;
}

function makeAgent(mockCreate: Mock): PlanExecuteAgent {
  const client = { messages: { create: mockCreate } } as unknown as Anthropic;
  const agent = new PlanExecuteAgent({
    model: "claude-opus-4-6",
    tools: TOOL_DEFINITIONS,
    client,
  });
  agent.setToolRegistry(buildToolRegistry());
  return agent;
}

describe("PlanExecuteAgent", () => {
  it("runs plan -> execute -> synthesize", async () => {
    const mockCreate = vi.fn();
    const agent = makeAgent(mockCreate);

    mockCreate
      .mockResolvedValueOnce(
        makeMessage("end_turn", [
          makeTextBlock(
            '[{"id":1,"objective":"Get UTC time"},{"id":2,"objective":"Square the hour"}]'
          ),
        ])
      )
      .mockResolvedValueOnce(
        makeMessage("tool_use", [
          makeToolUseBlock("tu1", "get_current_time", { timezone: "UTC" }),
        ])
      )
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("UTC time captured")]))
      .mockResolvedValueOnce(
        makeMessage("tool_use", [
          makeToolUseBlock("tu2", "calculator", { expression: "14 ** 2" }),
        ])
      )
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("Computed value: 196")]))
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("Final: 196")]))
;

    const result = await agent.run("Find UTC hour and square it");
    expect(result).toContain("196");
    expect(mockCreate).toHaveBeenCalledTimes(6);
  });

  it("returns fallback when planner output is invalid JSON", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("this is not json")]));

    const agent = makeAgent(mockCreate);
    const result = await agent.run("Do work");

    expect(result).toContain("Unable to create a valid plan");
  });

  it("continues when unknown tool is requested", async () => {
    const mockCreate = vi.fn();
    const agent = makeAgent(mockCreate);

    mockCreate
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock('[{"id":1,"objective":"Use unknown"}]')]))
      .mockResolvedValueOnce(
        makeMessage("tool_use", [makeToolUseBlock("tu3", "nonexistent", { x: 1 })])
      )
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("Recovered from tool error")]))
      .mockResolvedValueOnce(makeMessage("end_turn", [makeTextBlock("Final synthesized answer")]))
;

    const result = await agent.run("Trigger unknown tool");
    expect(result).toContain("Final synthesized answer");
  });
});
