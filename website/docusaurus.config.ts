import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Agent Blueprints',
  tagline:
    'Production-ready AI agent system design patterns, blueprints, and reference architectures',
  favicon: 'img/favicon.ico',

  // Production URL
  url: 'https://jvarma.github.io',
  baseUrl: '/agent-blueprints/',

  // GitHub Pages deployment config
  organizationName: 'jvarma',
  projectName: 'agent-blueprints',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    // Enable Mermaid diagram rendering inside Markdown/MDX files
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          // Serve docs at the site root (no /docs/ prefix)
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          // Edit-on-GitHub link at the bottom of every doc page
          editUrl:
            'https://github.com/jvarma/agent-blueprints/edit/main/website/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        // Blog is not used for this project
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Social card image shown when the site is shared
    image: 'img/agent-blueprints-social-card.png',

    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    // Announcement bar for new content / releases
    announcementBar: {
      id: 'v1_launch',
      content:
        'Agent Blueprints v1 is here — 10 production-ready blueprints, Python & TypeScript. <a href="/blueprints">Explore now →</a>',
      backgroundColor: '#1a1a2e',
      textColor: '#a78bfa',
      isCloseable: true,
    },

    navbar: {
      title: 'Agent Blueprints',
      logo: {
        alt: 'Agent Blueprints Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      hideOnScroll: false,
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'blueprintsSidebar',
          position: 'left',
          label: 'Blueprints',
        },
        {
          type: 'docSidebar',
          sidebarId: 'patternsSidebar',
          position: 'left',
          label: 'Patterns',
        },
        {
          type: 'docSidebar',
          sidebarId: 'architecturesSidebar',
          position: 'left',
          label: 'Architectures',
        },
        {
          to: '/intro',
          label: 'Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/jvarma/agent-blueprints',
          label: 'GitHub',
          position: 'right',
          'aria-label': 'GitHub repository',
        },
        {
          href: 'https://www.npmjs.com/package/agent-blueprints',
          label: 'npm',
          position: 'right',
          'aria-label': 'npm package',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {
              label: 'Introduction',
              to: '/intro',
            },
            {
              label: 'Blueprints',
              to: '/blueprints',
            },
            {
              label: 'Patterns',
              to: '/patterns',
            },
            {
              label: 'Reference Architectures',
              to: '/architectures',
            },
          ],
        },
        {
          title: 'Blueprints',
          items: [
            {
              label: 'ReAct Agent',
              to: '/blueprints/react-agent',
            },
            {
              label: 'Plan & Execute',
              to: '/blueprints/plan-execute',
            },
            {
              label: 'Multi-Agent Supervisor',
              to: '/blueprints/multi-agent-supervisor',
            },
            {
              label: 'RAG Advanced',
              to: '/blueprints/rag-advanced',
            },
            {
              label: 'Human-in-the-Loop',
              to: '/blueprints/human-in-the-loop',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/jvarma/agent-blueprints/discussions',
            },
            {
              label: 'Contributing Guide',
              href: 'https://github.com/jvarma/agent-blueprints/blob/main/CONTRIBUTING.md',
            },
            {
              label: 'Open an Issue',
              href: 'https://github.com/jvarma/agent-blueprints/issues/new/choose',
            },
            {
              label: 'Code of Conduct',
              href: 'https://github.com/jvarma/agent-blueprints/blob/main/CODE_OF_CONDUCT.md',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/jvarma/agent-blueprints',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/agent-blueprints',
            },
            {
              label: 'Roadmap',
              href: 'https://github.com/jvarma/agent-blueprints/discussions/categories/roadmap',
            },
            {
              label: 'Releases',
              href: 'https://github.com/jvarma/agent-blueprints/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Agent Blueprints Contributors. Built with Docusaurus. Released under the MIT License.`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [
        'python',
        'typescript',
        'bash',
        'yaml',
        'json',
        'docker',
        'toml',
        'diff',
        'markup',
      ],
      defaultLanguage: 'python',
    },

    // Mermaid diagram theming
    mermaid: {
      theme: {
        light: 'neutral',
        dark: 'dark',
      },
      options: {
        // Global Mermaid options
        fontFamily: 'var(--ifm-font-family-base)',
        fontSize: 14,
      },
    },

    // Algolia DocSearch (fill in your own keys when ready)
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'agent-blueprints',
    //   contextualSearch: true,
    // },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
