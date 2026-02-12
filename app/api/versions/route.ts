import { NextRequest, NextResponse } from "next/server";
import { versionStore } from "@/lib/versionStore";

export async function GET() {
  return NextResponse.json({ versions: versionStore.list() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { id?: string };

  if (!body.id) {
    return NextResponse.json({ error: "Version id is required" }, { status: 400 });
  }

  const version = versionStore.rollback(body.id);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  return NextResponse.json({ version });
}
