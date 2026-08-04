import Playbook from '@/content/playbook.mdx';
import { Panel } from '@/components/ui';

export const metadata = { title: 'Playbook — Stonks' };

/**
 * Static reference, authored in MDX at content/playbook.mdx. Edit that file;
 * nothing here is generated.
 */
export default function PlaybookPage() {
  return (
    <Panel title="Playbook" right={<span className="label">content/playbook.mdx</span>}>
      <article className="prose-chart max-w-[70ch]">
        <Playbook />
      </article>
    </Panel>
  );
}
