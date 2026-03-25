# Reflection — Implementation

## Core Interfaces

```
Critique:
  strengths: list of string
  weaknesses: list of string
  issues: list of {description: string, severity: "minor"|"major", suggestion: string}
  overall_assessment: string
  should_continue: boolean

ReflectionConfig:
  generator_prompt: string
  reflector_prompt: string
  max_iterations: integer              // Default: 3
  convergence_window: integer          // Default: 2
```

## Core Pseudocode

### reflect_and_refine

```
function reflect_and_refine(task, config):
  // Initial generation
  output = call_llm(system: config.generator_prompt, message: task).text
  history = []

  for i in 1..config.max_iterations:
    // Reflect
    critique = reflect(output, task, config)
    history.append({iteration: i, output: output, critique: critique})

    // Check convergence
    if not critique.should_continue:
      return {status: "accepted", output: output, iterations: i, history: history}

    if i >= config.convergence_window and is_converged(history):
      return {status: "converged", output: output, iterations: i, history: history}

    // Revise
    output = revise(output, critique, task, config)

  return {status: "max_iterations", output: output, iterations: config.max_iterations, history: history}
```

### reflect

```
function reflect(output, task, config):
  response = call_llm(
    system: config.reflector_prompt,
    message: "Task: " + task +
             "\n\nOutput to critique:\n" + output +
             "\n\nProvide a detailed critique as JSON: " +
             "{\"strengths\": [...], \"weaknesses\": [...], " +
             "\"issues\": [{\"description\": ..., \"severity\": ..., \"suggestion\": ...}], " +
             "\"overall_assessment\": ..., \"should_continue\": boolean}"
  )
  return parse_json(response.text)
```

### revise

```
function revise(output, critique, task, config):
  issues_text = ""
  for issue in critique.issues:
    issues_text += "- [" + issue.severity + "] " + issue.description +
                   " → " + issue.suggestion + "\n"

  response = call_llm(
    system: config.generator_prompt,
    message: "Task: " + task +
             "\n\nYour previous output:\n" + output +
             "\n\nIssues to address:\n" + issues_text +
             "\n\nStrengths to keep:\n" + join(critique.strengths, "\n") +
             "\n\nRevise your output to address all issues while keeping the strengths."
  )
  return response.text
```

### is_converged

```
function is_converged(history):
  recent = history[-(2):]
  // Check if major issues are decreasing
  major_counts = [count(c.critique.issues where severity == "major") for c in recent]
  return all(count == 0 for count in major_counts)
```

## Prompt Engineering Notes

### Reflector Prompt
```
System:
You are a critical reviewer. Analyze the output thoroughly.
Be adversarial — look for what's wrong, not what's right.
Every weakness should have a specific, actionable suggestion.
Set should_continue to false only when there are no major issues.
Do not be easily satisfied.
```

### Revision Prompt
Key: include both the issues AND the strengths. The reviser must fix problems without losing what worked.

## Testing Strategy

- **Critique quality:** Provide known-flawed output → verify issues are identified
- **Revision quality:** Provide output + critique → verify issues are addressed
- **Convergence:** Provide high-quality output → verify should_continue = false
- **Loop behavior:** Stub LLM → verify correct iteration count and state management

## Common Pitfalls

- **Self-congratulatory critiques:** LLM declares output excellent too early. Fix: adversarial prompting.
- **Oscillating revisions:** Fixing A breaks B. Fix: track resolved issues, instruct reviser to preserve fixes.
- **Over-polishing:** Spending iterations on minor style tweaks. Fix: severity classification + convergence on no major issues.
- **Context bloat:** Including full critique history inflates context. Fix: only pass the most recent critique.
