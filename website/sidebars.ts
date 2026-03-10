import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [{ type: "doc", id: "intro", label: "Introduction" }],
  blueprintsSidebar: [
    { type: "doc", id: "blueprints/blueprints-index", label: "Overview" },
    {
      type: "link",
      label: "01 ReAct Agent (Repo)",
      href: "https://github.com/jagguvarma15/agent-blueprints/tree/main/blueprints/01-react-agent",
    },
    {
      type: "link",
      label: "02 Plan & Execute (Repo)",
      href: "https://github.com/jagguvarma15/agent-blueprints/tree/main/blueprints/02-plan-and-execute",
    },
    {
      type: "link",
      label: "04 Multi Agent Supervisor (Repo)",
      href: "https://github.com/jagguvarma15/agent-blueprints/tree/main/blueprints/04-multi-agent-supervisor",
    },
    {
      type: "link",
      label: "07 RAG Basic (Repo)",
      href: "https://github.com/jagguvarma15/agent-blueprints/tree/main/blueprints/07-rag-basic",
    },
  ],
  patternsSidebar: [{ type: "doc", id: "patterns/patterns-index", label: "Overview" }],
  architecturesSidebar: [
    { type: "doc", id: "architectures/architectures-index", label: "Overview" },
  ],
};

export default sidebars;
