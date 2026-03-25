import Anthropic from "@anthropic-ai/sdk";
import type { ToolRegistry } from "./tools.js";

export interface PlanStep {
  id: number;
  objective: string;
}

export interface PlanExecuteAgentConfig {
  model: string;
  tools: Anthropic.Tool[];
  maxSteps?: number;
  maxToolRoundsPerStep?: number;
  client?: Anthropic;
}

export class PlanExecuteAgent {
  readonly model: string;
  readonly tools: Anthropic.Tool[];
  readonly maxSteps: number;
  readonly maxToolRoundsPerStep: number;

  private readonly client: Anthropic;
  private toolRegistry: ToolRegistry;

  private static readonly PLANNER_PROMPT =
    "You are a planning assistant. Break the task into 2-6 concrete steps. " +
    'Return ONLY valid JSON: [{"id":1,"objective":"..."}].';

  private static readonly EXECUTOR_PROMPT =
    "You execute one plan step at a time. Use tools if needed and return step output.";

  private static readonly SYNTHESIZER_PROMPT =
    "You combine step outputs into a direct final answer for the user.";

  constructor(config: PlanExecuteAgentConfig) {
    this.model = config.model;
    this.tools = config.tools;
    this.maxSteps = config.maxSteps ?? 8;
    this.maxToolRoundsPerStep = config.maxToolRoundsPerStep ?? 4;
    this.client = config.client ?? new Anthropic();
    this.toolRegistry = new Map();
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  async run(query: string): Promise<string> {
    const plan = await this.createPlan(query);
    if (plan.length === 0) {
      return "Unable to create a valid plan for this request.";
    }

    const boundedPlan = plan.slice(0, this.maxSteps);
    const stepOutputs: string[] = [];

    for (const step of boundedPlan) {
      const output = await this.executeStep(query, step, stepOutputs);
      stepOutputs.push(`Step ${step.id}: ${output}`);
    }

    return this.synthesize(query, boundedPlan, stepOutputs);
  }

  private async createPlan(query: string): Promise<PlanStep[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: PlanExecuteAgent.PLANNER_PROMPT,
      messages: [{ role: "user", content: query }],
    });

    return this.parsePlan(this.extractText(response.content));
  }

  private async executeStep(query: string, step: PlanStep, priorOutputs: string[]): Promise<string> {
    const context = priorOutputs.length > 0 ? priorOutputs.join("\n") : "No prior outputs yet.";
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content:
          `User query: ${query}\n` +
          `Current step (${step.id}): ${step.objective}\n` +
          `Prior step outputs:\n${context}`,
      },
    ];

    for (let i = 0; i < this.maxToolRoundsPerStep; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: PlanExecuteAgent.EXECUTOR_PROMPT,
        tools: this.tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        return this.extractText(response.content) || "Step completed with no textual output.";
      }

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const toolName = block.name;
          const toolInput = block.input as Record<string, unknown>;
          const result = this.callTool(toolName, toolInput);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      return `Step stopped unexpectedly with reason: ${response.stop_reason}`;
    }

    return "Step terminated after max tool rounds without a final response.";
  }

  private async synthesize(query: string, plan: PlanStep[], stepOutputs: string[]): Promise<string> {
    const planText = plan.map((step) => `${step.id}. ${step.objective}`).join("\n");
    const outputsText = stepOutputs.join("\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: PlanExecuteAgent.SYNTHESIZER_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Original query: ${query}\n\n` +
            `Plan:\n${planText}\n\n` +
            `Step outputs:\n${outputsText}\n\n` +
            "Return the final answer only.",
        },
      ],
    });

    return this.extractText(response.content) || "Unable to synthesize a final answer.";
  }

  private callTool(toolName: string, toolInput: Record<string, unknown>): string {
    const fn = this.toolRegistry.get(toolName);
    if (!fn) return `Error: Unknown tool '${toolName}'.`;

    try {
      const result = fn(toolInput);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      return `Error: Tool '${toolName}' failed with: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  private parsePlan(raw: string): PlanStep[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    const steps: PlanStep[] = [];
    parsed.forEach((item, index) => {
      if (!item || typeof item !== "object") return;

      const rec = item as Record<string, unknown>;
      const objective = rec["objective"];
      const idRaw = rec["id"];
      if (typeof objective !== "string" || objective.trim().length === 0) return;

      const id = typeof idRaw === "number" ? idRaw : index + 1;
      steps.push({ id, objective: objective.trim() });
    });

    return steps;
  }
}
