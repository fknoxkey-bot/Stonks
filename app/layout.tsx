import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stonks — portfolio review',
  description: 'A discipline enforcement tool, not a signal generator.',
};

const NAV = [
  { href: '/positions', label: 'Positions' },
  { href: '/review', label: 'Review' },
  { href: '/briefs', label: 'Brief' },
  { href: '/history', label: 'History' },
  { href: '/playbook', label: 'Playbook' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-chart-ink">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-2">
            <Link
              href="/positions"
              className="font-mono text-sm uppercase tracking-annotation no-underline"
            >
              Stonks
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-mono text-2xs uppercase tracking-annotation no-underline hover:underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="label ml-auto hidden sm:block">
              Read-only · no brokerage connection
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>

        <footer className="mx-auto max-w-[1400px] border-t border-chart-rule px-4 py-3">
          <p className="label">
            Rules produce flags. Flags produce questions. Nothing here places an order.
          </p>
        </footer>
      </body>
    </html>
  );
}
