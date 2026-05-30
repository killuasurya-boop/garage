import type { Metadata } from "next";

import { CustomerQueueDisplay } from "@/components/garage/customer-queue-display";

export const metadata: Metadata = {
  title: "Customer Queue - Garage",
  description: "Display antrean order customer tanpa data sensitif.",
};

export default function CustomerQueuePage() {
  return <CustomerQueueDisplay />;
}
