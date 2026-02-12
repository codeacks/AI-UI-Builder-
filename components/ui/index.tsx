// DO NOT MODIFY: deterministic component primitives.
import { ReactNode } from "react";

type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
};

export function Button({ label, variant = "primary", onClick }: ButtonProps) {
  const classes =
    variant === "primary"
      ? "rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
      : "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100";

  return (
    <button type="button" className={classes} onClick={onClick}>
      {label}
    </button>
  );
}

type CardProps = {
  title: string;
  children?: ReactNode;
};

export function Card({ title, children }: CardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

type InputProps = {
  label: string;
  placeholder?: string;
  value?: string;
};

export function Input({ label, placeholder = "", value = "" }: InputProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      <input
        readOnly
        value={value}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

type TableProps = {
  columns: string[];
  rows: string[][];
};

export function Table({ columns, rows }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th key={col} className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${idx}-${row.join("-")}`} className="odd:bg-white even:bg-slate-50">
              {row.map((cell, cIdx) => (
                <td key={`${idx}-${cIdx}`} className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ModalProps = {
  title: string;
  open: boolean;
  children?: ReactNode;
};

export function Modal({ title, open, children }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
      <h4 className="mb-2 text-base font-semibold text-slate-900">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

type SidebarProps = {
  title: string;
  items: string[];
};

export function Sidebar({ title, items }: SidebarProps) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h4>
      <ul className="space-y-2 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item} className="rounded-md px-2 py-1 hover:bg-slate-100">
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}

type NavbarProps = {
  title: string;
  links: string[];
};

export function Navbar({ title, links }: NavbarProps) {
  return (
    <header className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <nav className="flex gap-3 text-sm text-slate-700">
        {links.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </nav>
    </header>
  );
}

type ChartProps = {
  title: string;
  data: Array<{ label: string; value: number }>;
};

function widthClass(value: number, max: number): string {
  const ratio = max === 0 ? 0 : value / max;
  if (ratio >= 0.9) return "w-full";
  if (ratio >= 0.8) return "w-5/6";
  if (ratio >= 0.7) return "w-4/5";
  if (ratio >= 0.6) return "w-3/4";
  if (ratio >= 0.5) return "w-2/3";
  if (ratio >= 0.4) return "w-1/2";
  if (ratio >= 0.3) return "w-1/3";
  if (ratio >= 0.2) return "w-1/4";
  return "w-1/6";
}

export function Chart({ title, data }: ChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="space-y-2">
        {data.map((point) => (
          <div key={point.label} className="grid grid-cols-[80px_1fr_40px] items-center gap-2 text-xs">
            <span className="text-slate-600">{point.label}</span>
            <div className="h-3 rounded bg-slate-200">
              <div className={`h-3 rounded bg-blue-600 ${widthClass(point.value, max)}`} />
            </div>
            <span className="text-right text-slate-700">{point.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
