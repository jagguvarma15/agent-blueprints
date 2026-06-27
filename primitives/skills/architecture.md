# Skills — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: registry, role: effector, responsibility: "Index available skills" }
  - { id: loader, role: code, responsibility: "Load a skill on demand into context" }
  - { id: executor, role: effector, responsibility: "Run the loaded skill", port: tools }
ports:
  - { name: tools, protocol: tools, required: false }
```

Skills are discovered from the filesystem and loaded just-in-time, so shipping many is cheap and the context stays lean until a skill is needed.
