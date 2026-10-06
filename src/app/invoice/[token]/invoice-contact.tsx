"use client";

import { CustomerChatPanel } from "@/components/garage/customer-chat-panel";
import { OrderPushButton } from "@/components/garage/order-push-button";

// Kontak kasir dari halaman invoice/pelacak (mis. dibuka dari link WhatsApp di
// HP lain): chat terikat ke pesanan ini + langganan notifikasi status.
export function InvoiceContact({
  token,
  orderId,
  orderNo,
  label,
}: {
  token: string;
  orderId: string;
  orderNo: string;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <CustomerChatPanel
        tableLabel={label}
        orderId={orderId}
        orderToken={token}
        orderNo={orderNo}
        title="Tanya kasir soal pesanan ini"
      />
      <OrderPushButton orderId={orderId} orderToken={token} />
    </div>
  );
}
