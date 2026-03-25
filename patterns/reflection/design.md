# Reflection — Design

## Component Breakdown

```mermaid
graph TD
    Input([Task]) --> Generator[Generator LLM]
    Generator -->|"output"| Reflector[Reflector LLM:<br/>Self-critique]
    Reflector -->|"critique"| Convergence{Converged?}
    Convergence -->|"No"| Reviser[Reviser:<br/>Apply critique]
    Reviser -->|"revised output"| Reflector
    Convergence -->|"Yes"| Output([Final Output])
    Guard[/"Iteration Budget"/] -.->|"exhausted"| Output
    History[(Critique History)] <-->|"track"| Convergence

    style Input fill:#e3f2fd
    style Generator fill:#fff3e0
    style Reflector fill:#e8f5e9
    style Convergence fill:#fce4ec
    style Reviser fill:#fff3e0
    style Output fill:#e3f2fd
    style Guard fill:#fff8e1
    style History fill:#f3e5f5
```

### Generator
Produces the initial output. The same LLM and prompt used for generation can also be the reflector — or they can be separate.

### Reflector
Self-critiques the output. Produces structured feedback: strengths, weaknesses, specific issues, and suggestions. Richer than a numeric score.

### Reviser
Takes the output + critique and produces an improved version. Must be instructed to *address specific issues*, not start over.

### Convergence Detector
Analyzes critique history to determine if improvements are plateauing. Checks for: no major issues found, critique is substantially similar to previous iteration, or score isn't improving.

## Data Flow

```
Critique:
  strengths: list of string
  weaknesses: list of string
  issues: list of {description, severity, suggestion}
  overall_assessment: string
  should_continue: boolean
```

## Error Handling
- **Self-congratulatory critique:** LLM declares output perfect prematurely. Fix: prompt for adversarial critique.
- **Oscillating revisions:** Fix one issue, break another. Fix: track which issues were addressed.
- **Over-polishing:** Minor edits that don't improve quality. Fix: convergence detection.

## Scaling
- 2+ LLM calls per iteration (reflect + revise). Total = 2K + 1 (initial generation).
- Diminishing returns after 2–3 iterations. Default max = 3.

## Composition
- **+ ReAct:** Reflect on the agent's final output before returning
- **+ Plan & Execute:** Reflect on plan quality before execution
- **+ Any generator:** Reflection wraps any generation pattern as a quality layer
