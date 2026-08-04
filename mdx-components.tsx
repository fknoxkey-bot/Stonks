import type { MDXComponents } from 'mdx/types';

/**
 * Required by @next/mdx in the App Router. Also where the playbook's markdown
 * picks up the chart aesthetic — monospace annotations for headings, hairline
 * tables, no rounded corners.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => <h1 className="mb-3 font-sans text-xl font-semibold" {...props} />,
    h2: (props) => (
      <h2
        className="mb-2 mt-8 border-b border-chart-rule pb-1 font-mono text-2xs uppercase tracking-annotation text-chart-ink"
        {...props}
      />
    ),
    h3: (props) => <h3 className="mb-1 mt-5 font-sans text-base font-semibold" {...props} />,
    p: (props) => <p className="mb-3 max-w-[70ch] font-sans text-sm leading-relaxed" {...props} />,
    ul: (props) => <ul className="mb-3 list-disc pl-5" {...props} />,
    ol: (props) => <ol className="mb-3 list-decimal pl-5" {...props} />,
    li: (props) => <li className="mb-1 font-sans text-sm leading-relaxed" {...props} />,
    strong: (props) => <strong className="font-semibold" {...props} />,
    code: (props) => <code className="font-mono text-xs" {...props} />,
    table: (props) => (
      <div className="my-4 overflow-x-auto">
        <table className="grid-table" {...props} />
      </div>
    ),
    th: (props) => <th {...props} />,
    td: (props) => <td className="font-sans text-sm" {...props} />,
    hr: () => <hr className="my-6 border-chart-rule" />,
    ...components,
  };
}
