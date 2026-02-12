import { UINode, UIPlan } from "@/types/agent";
import { Button, Card, Chart, Input, Modal, Navbar, Sidebar, Table } from "@/components/ui";

function renderNode(node: UINode) {
  const children = (node.children ?? []).map((child) => renderNode(child));

  switch (node.component) {
    case "Button":
      return <Button key={node.id} {...(node.props as { label: string; variant?: "primary" | "secondary" })} />;
    case "Card":
      return (
        <Card key={node.id} {...(node.props as { title: string })}>
          {children}
        </Card>
      );
    case "Input":
      return <Input key={node.id} {...(node.props as { label: string; placeholder?: string; value?: string })} />;
    case "Table":
      return <Table key={node.id} {...(node.props as { columns: string[]; rows: string[][] })} />;
    case "Modal":
      return (
        <Modal key={node.id} {...(node.props as { title: string; open: boolean })}>
          {children}
        </Modal>
      );
    case "Sidebar":
      return <Sidebar key={node.id} {...(node.props as { title: string; items: string[] })} />;
    case "Navbar":
      return <Navbar key={node.id} {...(node.props as { title: string; links: string[] })} />;
    case "Chart":
      return <Chart key={node.id} {...(node.props as { title: string; data: Array<{ label: string; value: number }> })} />;
    default:
      return null;
  }
}

function layoutClass(mode: UIPlan["mode"]) {
  if (mode === "grid") return "grid grid-cols-1 gap-4 md:grid-cols-2";
  if (mode === "split") return "grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]";
  return "space-y-4";
}

export function PreviewRenderer({ plan }: { plan: UIPlan | null }) {
  if (!plan) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Generate a UI from chat to see live preview.
      </div>
    );
  }

  return <div className={layoutClass(plan.mode)}>{plan.root.map((node) => renderNode(node))}</div>;
}
