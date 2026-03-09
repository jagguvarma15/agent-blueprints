import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [{ type: "doc", id: "intro", label: "Introduction" }],
  blueprintsSidebar: [
    { type: "doc", id: "blueprints-index", label: "Overview" },
  ],
  patternsSidebar: [{ type: "doc", id: "patterns-index", label: "Overview" }],
  architecturesSidebar: [
    { type: "doc", id: "architectures-index", label: "Overview" },
  ],
};

export default sidebars;
