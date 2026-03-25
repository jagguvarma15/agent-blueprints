# Routing — Design

## Component Breakdown

```mermaid
graph TD
    Input([Input]) --> Classifier[Classifier LLM]
    Classifier -->|"classification"| Threshold{Confidence OK?}
    Threshold -->|"yes"| Registry[Route Registry]
    Threshold -->|"no"| Fallback[Fallback Handler]
    Registry -->|"matched handler"| Handler[Specialized Handler]
    Handler --> Output([Response])
    Fallback --> Output

    style Input fill:#e3f2fd
    style Classifier fill:#fff8e1
    style Threshold fill:#fce4ec
    style Registry fill:#f3e5f5
    style Handler fill:#fff3e0
    style Fallback fill:#ffcdd2
    style Output fill:#e3f2fd
```

### Classifier LLM
Analyzes input and produces a structured classification: route name, confidence score, and extracted entities. Can use a cheaper/faster model since classification is simpler than generation.

### Confidence Thresholder
Checks if the classification confidence meets the minimum threshold. Below threshold → fallback handler. This prevents misrouting on ambiguous inputs.

### Route Registry
Maps route names to handler configurations: system prompt, tools, model, and handler logic. Supports dynamic registration of new routes.

### Specialized Handlers
Purpose-built processing for each route. Each handler can be a workflow, an agent, or a simple LLM call with a specialized prompt and toolset.

### Fallback Handler
Handles unclassified or low-confidence inputs. Typically a general-purpose handler that provides a safe, if less specialized, response.

## Data Flow

```
Classification:
  route: string
  confidence: float
  entities: map of string → any         // Optional extracted data

RouteConfig:
  name: string
  description: string
  handler: function(input, entities) → response
  system_prompt: string
  tools: list of ToolSchema
  model: string                         // Optional per-route model
```

## Error Handling
- **Misclassification:** Monitor route accuracy; retrain classifier or add examples
- **Handler failure:** Fall back to general handler
- **Unknown route:** Return to classifier with more context, or use fallback
- **Confidence edge cases:** Tune threshold based on error analysis

## Scaling
- Classification: cheap, fast (can use smaller model)
- Handlers: cost/latency varies by route (use appropriate model per route)
- Add new routes without modifying existing handlers

## Composition
- **+ Multi-Agent:** Route to specialized agents instead of handlers
- **+ RAG:** One route handler uses RAG for knowledge questions
- **+ Memory:** Per-route or shared memory for continuity
