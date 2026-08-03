import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stonks',
  description: 'Track what you own, and why.',
};

const NAV = [
  { href: '/positions', label: 'Holdings' },
  { href: '/review', label: 'Check-up' },
  { href: '/briefs', label: 'Research' },
  { href: '/history', label: 'History' },
  { href: '/playbook', label: 'Learn' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg">
        <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-5 py-3.5">
            <Link href="/positions" className="text-base font-bold tracking-tight hover:text-ink">
              Stonks
            </Link>
            <nav className="flex flex-1 flex-wrap gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="hidden text-2xs text-dim sm:block">
              Tracking only · not connected to any broker
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>

        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4">
          <p className="text-2xs leading-relaxed text-dim">
            This app tracks what you own and points out things worth thinking about. It cannot buy
            or sell anything, and nothing here is financial advice.
          </p>
        </footer>
      </body>
    </html>
  );
}
