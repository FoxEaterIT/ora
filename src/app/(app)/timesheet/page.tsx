"use client";

import MyHoursView, { type MyHoursApi } from "@/components/my-hours-view";

const webApi: MyHoursApi = {
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "request-failed");
    return data as T;
  },
};

export default function TimesheetPage() {
  return <MyHoursView api={webApi} />;
}
