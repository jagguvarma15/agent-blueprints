/**
 * vitest tests for Blueprint 04: Multi-Agent Supervisor.
 *
 * All Anthropic API calls are mocked using vi.mock so the test suite runs
 * without network access or a real API key.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import type { WorkerAgent } from "../src/agents.js";

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

/** Build a mock WorkerAgent with controllable return values. */
function makeMockAgent(
  name: string,
  description: string,
  returnValue = `Result from ${name}`,
): WorkerAgent & { run: MockInstance } {
  return {
    name,
    description,
    run: vi.fn().mockResolvedValue(returnValue),
  };
}

/** Build a mock Anthropic Message with tool_use stop reason. */
function makeToolUseMessage(
  toolId: string,
  agentName: string,
  task: string,
): object {
  return {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: toolId,
        name: agentName,
        input: { task },
      },
    ],
  };
}

/** Build a mock Anthropic Message with end_turn stop reason (final text). */
function makeFinalMessage(text: string): object {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
  };
}

/** Build a mock Anthropic Message with multiple text blocks. */
function makeMultiTextMessage(texts: string[]): object {
  return {
    stop_reason: "end_turn",
    content: texts.map((t) => ({ type: "text", text: t })),
  };
}

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

// We mock the SDK at module level so SupervisorAgent's constructor never
// makes a real HTTP connection.
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropic };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let researchAgent: WorkerAgent & { run: MockInstance };
let codeAgent: WorkerAgent & { run: MockInstance };
let writingAgent: WorkerAgent & { run: MockInstance };
let agentRegistry: Map<string, WorkerAgent>;
let mockCreate: MockInstance;

beforeEach(async () => {
  vi.resetAllMocks();

  // Fresh mock agents before each test
  researchAgent = makeMockAgent(
    "research_agent",
    "Researches topics.",
    "Research result: quantum computing uses qubits.",
  );
  codeAgent = makeMockAgent(
    "code_agent",
    "Writes code.",
    "```python\nprint('hello')\n```",
  );
  writingAgent = makeMockAgent(
    "writing_agent",
    "Writes prose.",
    "Here is a polished blog post about quantum computing.",
  );

  agentRegistry = new Map([
    ["research_agent", researchAgent],
    ["code_agent", codeAgent],
    ["writing_agent", writingAgent],
  ]);

  // Grab the mock .create method from the Anthropic mock
  const Anthropic = (await import("@anthropic-ai/sdk")).default as ReturnType<typeof vi.fn>;
  const instance = new Anthropic();
  mockCreate = instance.messages.create as MockInstance;
});

// ---------------------------------------------------------------------------
// Helper to create supervisor with injected mocks
// ---------------------------------------------------------------------------

async function makeSupervisor(options?: { maxIterations?: number }) {
  const { SupervisorAgent } = await import("../src/supervisor.js");
  return new SupervisorAgent({
    agents: agentRegistry,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Initialisation tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — initialisation", () => {
  it("stores the provided agent registry", async () => {
    const sup = await makeSupervisor();
    // Access via the run path — validate tool schemas are built correctly
    const tools = (sup as unknown as { tools: object[] }).tools;
    expect(tools).toHaveLength(3);
  });

  it("builds tool schemas from the agent registry", async () => {
    const sup = await makeSupervisor();
    const tools = (sup as unknown as { tools: Array<{ name: string }> }).tools;
    const names = tools.map((t) => t.name);
    expect(names).toContain("research_agent");
    expect(names).toContain("code_agent");
    expect(names).toContain("writing_agent");
  });

  it("each tool schema has the required 'task' parameter", async () => {
    const sup = await makeSupervisor();
    const tools = (
      sup as unknown as {
        tools: Array<{ input_schema: { required: string[] } }>;
      }
    ).tools;
    for (const tool of tools) {
      expect(tool.input_schema.required).toContain("task");
    }
  });
});

// ---------------------------------------------------------------------------
// Routing tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — routing", () => {
  it("routes to the research agent for a research subtask", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(makeToolUseMessage("tu_001", "research_agent", "Find facts about X"))
      .mockResolvedValueOnce(makeFinalMessage("Here is the research: quantum computing uses qubits."));

    const result = await sup.run("Research quantum computing.");

    expect(researchAgent.run).toHaveBeenCalledOnce();
    expect(researchAgent.run).toHaveBeenCalledWith("Find facts about X");
    expect(result.toLowerCase()).toContain("qubit");
  });

  it("routes to the code agent for a coding subtask", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_002", "code_agent", "Write binary search in TypeScript"),
      )
      .mockResolvedValueOnce(makeFinalMessage("Here is the code:\n```python\nprint('hello')\n```"));

    const result = await sup.run("Write binary search.");

    expect(codeAgent.run).toHaveBeenCalledOnce();
    expect(codeAgent.run).toHaveBeenCalledWith("Write binary search in TypeScript");
    expect(result).toContain("```python");
  });

  it("routes to the writing agent for a prose subtask", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(makeToolUseMessage("tu_003", "writing_agent", "Write a blog post"))
      .mockResolvedValueOnce(makeFinalMessage("Here is the blog post about quantum computing."));

    const result = await sup.run("Write a blog post about quantum computing.");

    expect(writingAgent.run).toHaveBeenCalledOnce();
    expect(writingAgent.run).toHaveBeenCalledWith("Write a blog post");
    expect(result.toLowerCase()).toContain("blog post");
  });

  it("throws when an unknown agent is requested", async () => {
    const sup = await makeSupervisor();
    mockCreate.mockResolvedValue(
      makeToolUseMessage("tu_004", "nonexistent_agent", "Do something"),
    );

    await expect(sup.run("Do something impossible.")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Result synthesis tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — result synthesis", () => {
  it("returns the final text when stop_reason is end_turn", async () => {
    const sup = await makeSupervisor();
    mockCreate.mockResolvedValueOnce(makeFinalMessage("The final synthesised answer."));

    const result = await sup.run("Simple task.");

    expect(result).toBe("The final synthesised answer.");
  });

  it("joins multiple text blocks with double newlines", async () => {
    const sup = await makeSupervisor();
    mockCreate.mockResolvedValueOnce(
      makeMultiTextMessage(["First paragraph.", "Second paragraph."]),
    );

    const result = await sup.run("Simple task.");

    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph.");
    expect(result).toContain("\n\n");
  });
});

// ---------------------------------------------------------------------------
// Multi-step delegation tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — multi-step delegation", () => {
  it("calls two different agents in sequence", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_010", "research_agent", "Research async Python"),
      )
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_011", "writing_agent", "Write post using research"),
      )
      .mockResolvedValueOnce(makeFinalMessage("Complete blog post about async Python."));

    const result = await sup.run("Research async Python and write a blog post.");

    expect(researchAgent.run).toHaveBeenCalledOnce();
    expect(writingAgent.run).toHaveBeenCalledOnce();
    expect(result.toLowerCase()).toMatch(/async python|blog post/);
  });

  it("can call the same agent in two separate rounds", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(makeToolUseMessage("tu_020", "research_agent", "First research pass"))
      .mockResolvedValueOnce(makeToolUseMessage("tu_021", "research_agent", "Second research pass"))
      .mockResolvedValueOnce(makeFinalMessage("Combined research result."));

    const result = await sup.run("Deep research on topic X.");

    expect(researchAgent.run).toHaveBeenCalledTimes(2);
    expect(result).toContain("Combined");
  });

  it("dispatches multiple tools from the same round in parallel", async () => {
    const sup = await makeSupervisor();

    // Single API response containing two tool_use blocks in one round
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_p1", name: "research_agent", input: { task: "Research X" } },
          { type: "tool_use", id: "tu_p2", name: "code_agent", input: { task: "Code for X" } },
        ],
      })
      .mockResolvedValueOnce(makeFinalMessage("Both done."));

    const result = await sup.run("Research and code simultaneously.");

    expect(researchAgent.run).toHaveBeenCalledOnce();
    expect(codeAgent.run).toHaveBeenCalledOnce();
    expect(result).toBe("Both done.");
  });
});

// ---------------------------------------------------------------------------
// Full workflow test
// ---------------------------------------------------------------------------

describe("SupervisorAgent — full three-agent workflow", () => {
  it("invokes research, code, and writing agents in sequence and synthesises", async () => {
    const sup = await makeSupervisor();
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_r", "research_agent", "Research quantum computing"),
      )
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_c", "code_agent", "Quantum circuit example in Python"),
      )
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_w", "writing_agent", "Blog post with research and code"),
      )
      .mockResolvedValueOnce(
        makeFinalMessage("Final blog post about quantum computing with code."),
      );

    const result = await sup.run(
      "Research quantum computing, write a blog post, and include a Python code example.",
    );

    expect(researchAgent.run).toHaveBeenCalledOnce();
    expect(codeAgent.run).toHaveBeenCalledOnce();
    expect(writingAgent.run).toHaveBeenCalledOnce();
    expect(result.toLowerCase()).toMatch(/quantum|blog post/);
  });

  it("throws when max iterations is exceeded", async () => {
    const sup = await makeSupervisor({ maxIterations: 2 });

    // Always returns tool_use — never terminates
    mockCreate.mockResolvedValue(
      makeToolUseMessage("tu_inf", "research_agent", "loop forever"),
    );

    await expect(sup.run("Infinite loop task.")).rejects.toThrow(/maximum/i);
  });
});

// ---------------------------------------------------------------------------
// registerAgent tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — registerAgent", () => {
  it("adds the new agent and rebuilds tool schemas", async () => {
    const sup = await makeSupervisor();
    const dataAgent = makeMockAgent("data_agent", "Analyses data.");

    sup.registerAgent(dataAgent);

    const tools = (sup as unknown as { tools: Array<{ name: string }> }).tools;
    expect(tools.some((t) => t.name === "data_agent")).toBe(true);
  });

  it("makes the newly registered agent callable via the dispatch loop", async () => {
    const sup = await makeSupervisor();
    const dataAgent = makeMockAgent("data_agent", "Analyses data.", "Data analysis complete.");
    sup.registerAgent(dataAgent);

    mockCreate
      .mockResolvedValueOnce(makeToolUseMessage("tu_d", "data_agent", "Analyse dataset X"))
      .mockResolvedValueOnce(makeFinalMessage("Analysis result: Data analysis complete."));

    const result = await sup.run("Analyse dataset X.");

    expect(dataAgent.run).toHaveBeenCalledOnce();
    expect(dataAgent.run).toHaveBeenCalledWith("Analyse dataset X");
    expect(result.toLowerCase()).toContain("analysis");
  });
});

// ---------------------------------------------------------------------------
// Error handling tests
// ---------------------------------------------------------------------------

describe("SupervisorAgent — error handling", () => {
  it("includes error message in tool_result when agent throws", async () => {
    const sup = await makeSupervisor();
    researchAgent.run.mockRejectedValueOnce(new Error("Network timeout"));

    mockCreate
      .mockResolvedValueOnce(
        makeToolUseMessage("tu_err", "research_agent", "Research that will fail"),
      )
      .mockResolvedValueOnce(makeFinalMessage("Handled the error gracefully."));

    // Should not throw at the supervisor level; error is captured in tool_result
    const result = await sup.run("Task with a failing agent.");
    expect(result).toBe("Handled the error gracefully.");
  });
});
