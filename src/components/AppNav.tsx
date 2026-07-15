"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trade", label: "Trade" },
  { href: "/positions", label: "Positions" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--line)] bg-white/40 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/dashboard" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-[var(--brand)] text-sm font-bold text-[#e8fff9] transition group-hover:scale-105">
            TD
          </span>
          <div>
            <div className="display text-lg leading-none">TideDesk</div>
            <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              OANDA · AI Desk
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--brand)] text-white"
                    : "text-[var(--ink-soft)] hover:bg-white/60 hover:text-[var(--ink)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" className="btn btn-ghost text-sm" onClick={logout}>
          Log out
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line)] px-2 py-2 md:hidden">
        {links.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold ${
                active ? "bg-[var(--brand)] text-white" : "bg-white/50"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
