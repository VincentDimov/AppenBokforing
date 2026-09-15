import { notFound } from "next/navigation";

import { WorkspacePlaceholder } from "@/components/app/workspace-placeholder";
import { getWorkspaceNavigationItem } from "@/lib/app-navigation";

interface WorkspacePageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function WorkspacePage({ params }: Readonly<WorkspacePageProps>) {
  const { slug } = await params;
  const item = getWorkspaceNavigationItem(slug);

  if (!item || item.href === "/app") {
    notFound();
  }

  return <WorkspacePlaceholder item={item} />;
}
