import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

/**
 * Sidebars for the Agent Blueprints documentation site.
 *
 * Three top-level sidebars correspond to the three main navbar entries:
 *   - blueprintsSidebar  — the 10 blueprint implementations
 *   - patternsSidebar    — pattern categories (Orchestration, Multi-agent, …)
 *   - architecturesSidebar — end-to-end reference architectures
 *
 * The root doc (intro) is accessible from all of them via the navbar "Docs" link.
 */
const sidebars: SidebarsConfig = {
  // ─── Getting Started ────────────────────────────────────────────────────────
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
  ],

  // ─── Blueprints ─────────────────────────────────────────────────────────────
  blueprintsSidebar: [
    {
      type: 'doc',
      id: 'blueprints/index',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Orchestration',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'blueprints/react-agent',
          label: '01 — ReAct Agent',
        },
        {
          type: 'doc',
          id: 'blueprints/plan-execute',
          label: '02 — Plan & Execute',
        },
        {
          type: 'doc',
          id: 'blueprints/reflexion',
          label: '03 — Reflexion',
        },
      ],
    },
    {
      type: 'category',
      label: 'Multi-Agent',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'blueprints/multi-agent-supervisor',
          label: '04 — Multi-Agent Supervisor',
        },
        {
          type: 'doc',
          id: 'blueprints/multi-agent-parallel',
          label: '05 — Multi-Agent Parallel',
        },
      ],
    },
    {
      type: 'category',
      label: 'Memory',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'blueprints/memory-agent',
          label: '06 — Memory Agent',
        },
      ],
    },
    {
      type: 'category',
      label: 'RAG',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'blueprints/rag-basic',
          label: '07 — RAG Basic',
        },
        {
          type: 'doc',
          id: 'blueprints/rag-advanced',
          label: '08 — RAG Advanced',
        },
      ],
    },
    {
      type: 'category',
      label: 'Tools & Control Flow',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'blueprints/tool-calling',
          label: '09 — Tool Calling',
        },
        {
          type: 'doc',
          id: 'blueprints/human-in-the-loop',
          label: '10 — Human-in-the-Loop',
        },
      ],
    },
  ],

  // ─── Patterns ───────────────────────────────────────────────────────────────
  patternsSidebar: [
    {
      type: 'doc',
      id: 'patterns/index',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Orchestration Patterns',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'patterns/orchestration/react-loop',
          label: 'ReAct Loop',
        },
        {
          type: 'doc',
          id: 'patterns/orchestration/plan-execute',
          label: 'Plan & Execute',
        },
        {
          type: 'doc',
          id: 'patterns/orchestration/reflexion-loop',
          label: 'Reflexion Loop',
        },
        {
          type: 'doc',
          id: 'patterns/orchestration/chain-of-thought',
          label: 'Chain-of-Thought',
        },
      ],
    },
    {
      type: 'category',
      label: 'Multi-Agent Patterns',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'patterns/multi-agent/supervisor',
          label: 'Supervisor Pattern',
        },
        {
          type: 'doc',
          id: 'patterns/multi-agent/parallel-fan-out',
          label: 'Parallel Fan-Out',
        },
        {
          type: 'doc',
          id: 'patterns/multi-agent/peer-to-peer',
          label: 'Peer-to-Peer',
        },
      ],
    },
    {
      type: 'category',
      label: 'Memory Patterns',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'patterns/memory/short-term',
          label: 'Short-Term Memory',
        },
        {
          type: 'doc',
          id: 'patterns/memory/long-term',
          label: 'Long-Term Memory',
        },
        {
          type: 'doc',
          id: 'patterns/memory/episodic',
          label: 'Episodic Memory',
        },
        {
          type: 'doc',
          id: 'patterns/memory/semantic',
          label: 'Semantic Memory',
        },
      ],
    },
    {
      type: 'category',
      label: 'Tool Patterns',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'patterns/tools/tool-selection',
          label: 'Tool Selection',
        },
        {
          type: 'doc',
          id: 'patterns/tools/tool-composition',
          label: 'Tool Composition',
        },
        {
          type: 'doc',
          id: 'patterns/tools/error-recovery',
          label: 'Error Recovery',
        },
      ],
    },
    {
      type: 'category',
      label: 'RAG Patterns',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'patterns/rag/naive-rag',
          label: 'Naive RAG',
        },
        {
          type: 'doc',
          id: 'patterns/rag/advanced-rag',
          label: 'Advanced RAG',
        },
        {
          type: 'doc',
          id: 'patterns/rag/agentic-rag',
          label: 'Agentic RAG',
        },
        {
          type: 'doc',
          id: 'patterns/rag/hybrid-retrieval',
          label: 'Hybrid Retrieval',
        },
      ],
    },
  ],

  // ─── Reference Architectures ─────────────────────────────────────────────
  architecturesSidebar: [
    {
      type: 'doc',
      id: 'architectures/index',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'End-to-End Systems',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'architectures/customer-support-agent',
          label: 'Customer Support Agent',
        },
        {
          type: 'doc',
          id: 'architectures/research-assistant',
          label: 'Research Assistant',
        },
        {
          type: 'doc',
          id: 'architectures/code-review-agent',
          label: 'Code Review Agent',
        },
        {
          type: 'doc',
          id: 'architectures/data-analysis-pipeline',
          label: 'Data Analysis Pipeline',
        },
      ],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'architectures/observability',
          label: 'Observability & Tracing',
        },
        {
          type: 'doc',
          id: 'architectures/deployment',
          label: 'Deployment Patterns',
        },
        {
          type: 'doc',
          id: 'architectures/evaluation',
          label: 'Evaluation Frameworks',
        },
      ],
    },
  ],
};

export default sidebars;
