# Code Implementations

Minimal, self-contained Python implementations of every pattern in this repository.

## Design principles

- **No framework dependency** — each file uses only the Python standard library plus a single `LLM` Protocol
- **Plug any LLM** — implement the `LLM` Protocol with your preferred provider (OpenAI, Anthropic, Ollama, etc.)
- **Self-contained** — each file runs standalone; copy-paste into your project
- **Testable** — each file includes a `MockLLM` stub so you can run without a real API key

## Structure

```
code/
├── README.md                           ← this file

workflows/
├── prompt-chaining/code/python/        prompt_chaining.py
├── parallel-calls/code/python/         parallel_calls.py
├── orchestrator-worker/code/python/    orchestrator_worker.py
└── evaluator-optimizer/code/python/    evaluator_optimizer.py

patterns/
├── react/code/python/                  react_agent.py
├── plan-and-execute/code/python/       plan_and_execute.py
├── tool-use/code/python/               tool_use.py
├── memory/code/python/                 memory_agent.py
├── rag/code/python/                    rag.py
├── reflection/code/python/             reflection.py
├── routing/code/python/                routing.py
└── multi-agent/code/python/            multi_agent.py
```

## Plugging in a real LLM

Every file defines an `LLM` Protocol with a single `generate(messages) -> str` method.
Here's how to implement it for common providers:

```python
# OpenAI
from openai import OpenAI
client = OpenAI()

class OpenAILLM:
    def __init__(self, model="gpt-4o"):
        self.model = model

    def generate(self, messages: list[dict], **kwargs) -> str:
        response = client.chat.completions.create(
            model=self.model, messages=messages, **kwargs
        )
        return response.choices[0].message.content


# Anthropic
import anthropic
client = anthropic.Anthropic()

class AnthropicLLM:
    def __init__(self, model="claude-opus-4-6"):
        self.model = model

    def generate(self, messages: list[dict], **kwargs) -> str:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_messages = [m for m in messages if m["role"] != "system"]
        response = client.messages.create(
            model=self.model, max_tokens=4096,
            system=system, messages=user_messages,
        )
        return response.content[0].text
```

## Running the examples

Each file is executable with `python <filename>.py` and runs with the built-in `MockLLM`.
Replace `MockLLM` with a real implementation to use a live model.

```bash
python workflows/prompt-chaining/code/python/prompt_chaining.py
python patterns/react/code/python/react_agent.py
```
