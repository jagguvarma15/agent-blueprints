# Routing — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: classifier, role: router, responsibility: "Classify intent, write the decision to state", port: model }
  - { id: dispatcher, role: code, responsibility: "Route to the selected handler" }
  - { id: handlers, role: reasoner, responsibility: "Specialized per-category handlers", port: model }
ports:
  - { name: model, protocol: model, required: true }
```

A classifier writes a routing decision into state; the dispatcher selects a handler. A fallback handler catches low-confidence or unknown categories.
