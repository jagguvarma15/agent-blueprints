"""
Orchestrator-Worker — LLM decomposes a task and delegates to specialist workers.

The orchestrator decides what sub-tasks are needed and which worker handles each.
Workers are specialized LLM calls (or tools) with focused system prompts.
The orchestrator synthesizes all worker outputs into a final result.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Protocol


# ── LLM interface ─────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Worker:
    name: str
    description: str        # What this worker specializes in
    system_prompt: str      # Worker-specific instructions


@dataclass
class SubTask:
    worker_name: str
    task: str


@dataclass
class WorkerResult:
    worker_name: str
    task: str
    output: str


@dataclass
class OrchestratorResult:
    final_output: str
    worker_results: list[WorkerResult] = field(default_factory=list)
    sub_tasks: list[SubTask] = field(default_factory=list)


# ── Implementation ────────────────────────────────────────────────────────────

class OrchestratorWorker:
    """
    Orchestrates task decomposition and worker delegation.

    The orchestrator LLM breaks the task into sub-tasks, assigns each to
    the most appropriate registered worker, then synthesizes the results.
    """

    DECOMPOSE_PROMPT = """\
You are a task orchestrator. Break the following task into sub-tasks.
For each sub-task, assign it to the most appropriate worker.

Available workers:
{worker_list}

Task: {task}

Respond with a JSON array of sub-tasks. Example:
[
  {{"worker": "researcher", "task": "Find recent statistics on X"}},
  {{"worker": "writer", "task": "Draft a paragraph about Y using the research"}}
]

Return only the JSON array, no explanation."""

    SYNTHESIZE_PROMPT = """\
You are a task synthesizer. Combine the following worker outputs into a
coherent final result for the original task.

Original task: {task}

Worker outputs:
{results}

Produce the final unified output."""

    def __init__(self, orchestrator_llm: LLM, workers: list[Worker]):
        self.orchestrator = orchestrator_llm
        self.workers: dict[str, Worker] = {w.name: w for w in workers}

    def _decompose(self, task: str) -> list[SubTask]:
        worker_list = "\n".join(
            f"- {w.name}: {w.description}" for w in self.workers.values()
        )
        messages = [{
            "role": "user",
            "content": self.DECOMPOSE_PROMPT.format(worker_list=worker_list, task=task),
        }]
        raw = self.orchestrator.generate(messages)
        try:
            items = json.loads(raw)
            return [SubTask(worker_name=i["worker"], task=i["task"]) for i in items]
        except (json.JSONDecodeError, KeyError):
            # Fallback: treat the whole task as a single sub-task for the first worker
            first_worker = next(iter(self.workers))
            return [SubTask(worker_name=first_worker, task=task)]

    def _run_worker(self, sub_task: SubTask, worker_llm: LLM) -> WorkerResult:
        worker = self.workers.get(sub_task.worker_name)
        messages: list[dict] = []
        if worker:
            messages.append({"role": "system", "content": worker.system_prompt})
        messages.append({"role": "user", "content": sub_task.task})
        output = worker_llm.generate(messages)
        return WorkerResult(
            worker_name=sub_task.worker_name,
            task=sub_task.task,
            output=output,
        )

    def _synthesize(self, task: str, results: list[WorkerResult]) -> str:
        formatted = "\n\n".join(
            f"[{r.worker_name}]\n{r.output}" for r in results
        )
        messages = [{
            "role": "user",
            "content": self.SYNTHESIZE_PROMPT.format(task=task, results=formatted),
        }]
        return self.orchestrator.generate(messages)

    def run(self, task: str, worker_llm: LLM | None = None) -> OrchestratorResult:
        """
        worker_llm: LLM instance used for worker calls.
                    Defaults to the orchestrator LLM if not provided.
        """
        executor = worker_llm or self.orchestrator
        sub_tasks = self._decompose(task)
        worker_results = [self._run_worker(st, executor) for st in sub_tasks]
        final = self._synthesize(task, worker_results)
        return OrchestratorResult(
            final_output=final,
            worker_results=worker_results,
            sub_tasks=sub_tasks,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            content = messages[-1]["content"]
            if "JSON array" in content:
                return json.dumps([
                    {"worker": "researcher", "task": "Research current AI trends"},
                    {"worker": "writer", "task": "Write a summary based on research"},
                ])
            return f"[output for: {content[:50]}]"

    system = OrchestratorWorker(
        orchestrator_llm=MockLLM(),
        workers=[
            Worker(
                name="researcher",
                description="Finds and summarizes factual information",
                system_prompt="You are a research specialist. Be factual and cite sources.",
            ),
            Worker(
                name="writer",
                description="Drafts clear, well-structured prose",
                system_prompt="You are a professional writer. Be clear and concise.",
            ),
            Worker(
                name="reviewer",
                description="Reviews content for accuracy and quality",
                system_prompt="You are a critical reviewer. Identify issues clearly.",
            ),
        ],
    )

    result = system.run("Write a brief report on the current state of AI agents")
    print(f"Sub-tasks: {len(result.sub_tasks)}")
    for wt in result.worker_results:
        print(f"  [{wt.worker_name}] {wt.output[:60]}")
    print(f"\nFinal output:\n{result.final_output}")
