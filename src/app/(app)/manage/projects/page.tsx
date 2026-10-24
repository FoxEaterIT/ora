"use client";

import ProjectsView from "@/components/projects-view";

const webApi = {
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data as T;
  },
};

export default function ProjectsPage() {
  return <ProjectsView api={webApi} />;
}
