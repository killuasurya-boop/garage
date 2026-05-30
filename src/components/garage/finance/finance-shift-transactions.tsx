"use client";

import { useCallback, useEffect, useState } from "react";
import { ReceiptText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";

type ShiftTransactionsResponse = {
  session: {
    id: string;
    code: string;
    shiftLabel: string;
    status: string;
  };
  orders: Array<{
    orderNo: string;
    tableLabel: string;
    channel: string;
    status: string;
    total: number;
    createdAt: string;
    payments: Array<{ method: string; amount: number; status: string }>;
  }>;
};

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "short",
  timeStyle: "short",
});

export function FinanceShiftTransactions({ sessionId }: { sessionId: string | null }) {
  const [data, setData] = useState<ShiftTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sessionId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<ShiftTransactionsResponse>(
        `/api/finance/cash-sessions/${sessionId}/transactions`,
        { cache: "no-store" },
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat transaksi shift.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await garageApi.get<ShiftTransactionsResponse>(
          `/api/finance/cash-sessions/${sessionId}/transactions`,
          { cache: "no-store" },
        );
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat transaksi shift.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <Card className="garage-panel">
        <CardHeader>
          <CardTitle className="text-base">Transaksi shift</CardTitle>
          <CardDescription>
            Buka atau pilih cash session hari ini untuk melihat ledger pembayaran per shift.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4 text-[#f5a742]" />
              Transaksi shift
            </CardTitle>
            <CardDescription>
              {data
                ? `${data.session.code} · ${data.session.shiftLabel} · ${data.orders.length} order`
                : "Ledger pembayaran terhubung ke cash session (traceability)."}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="garage-press h-9 border-[#4a4a54] text-white"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-[#ffc2c8]">{error}</p> : null}
        {!error && data && data.orders.length === 0 ? (
          <p className="text-sm text-[#b8b8bf]">Belum ada order pada shift ini.</p>
        ) : null}
        {data && data.orders.length > 0 ? (
          <div className="garage-scroll max-h-72 overflow-auto rounded-md border border-[#34343c]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Meja</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((order) => {
                  const payment = order.payments[0];
                  return (
                    <TableRow key={order.orderNo}>
                      <TableCell className="font-mono text-xs text-white">
                        {order.orderNo}
                      </TableCell>
                      <TableCell className="text-xs text-[#d6d6dc]">
                        {order.tableLabel}
                      </TableCell>
                      <TableCell className="text-xs text-[#d6d6dc]">
                        {payment?.method ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums text-[#ffd79a]">
                        {currency.format(order.total)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-[#8f8f99]">
                        {timeFmt.format(new Date(order.createdAt))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
