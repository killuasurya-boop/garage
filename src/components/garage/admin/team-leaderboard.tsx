"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUp, Crown, Medal, Star, Trophy } from "lucide-react";
import React, { useEffect, useState } from "react";

import { garageApi } from "@/lib/api-client";
import type { LeaderboardEntry } from "@/lib/garage-service";

export function TeamLeaderboardWidget() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await garageApi.get<{ data: LeaderboardEntry[] }>("/api/hr/team/leaderboard");
        setEntries(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 animate-pulse items-center justify-center rounded-xl border border-[#34343c] bg-[#1a1a24]">
        <Trophy className="h-8 w-8 text-[#8f8f99] opacity-50" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-[#34343c] bg-[#1a1a24] text-[#8f8f99]">
        <p className="garage-mono text-sm">Tidak ada data peringkat.</p>
      </div>
    );
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 10); // Show up to top 10

  return (
    <div className="flex flex-col gap-6">
      {/* TOP 3 PODIUM */}
      <div className="flex items-end justify-center gap-4 py-8">
        {/* Rank 2 */}
        {top3[1] && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1a24] border-2 border-[#C0C0C0] shadow-[0_0_15px_rgba(192,192,192,0.3)]">
              <Medal className="h-8 w-8 text-[#C0C0C0]" />
              <div className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#C0C0C0] text-xs font-bold text-[#0f0f14]">
                2
              </div>
            </div>
            <p className="text-sm font-bold text-white">{top3[1].name}</p>
            <p className="text-xs text-[#8f8f99]">{top3[1].points} pts</p>
          </motion.div>
        )}

        {/* Rank 1 */}
        {top3[0] && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0 }}
            className="flex flex-col items-center pb-8"
          >
            <Crown className="mb-2 h-8 w-8 text-[#FFD700] drop-shadow-[0_0_10px_rgba(255,215,0,0.8)]" />
            <div className="relative mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-[#1a1a24] border-4 border-[#FFD700] shadow-[0_0_30px_rgba(255,215,0,0.4)]">
              <Star className="h-12 w-12 text-[#FFD700] fill-[#FFD700]" />
              <div className="absolute -bottom-3 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#FFD700] text-sm font-bold text-[#0f0f14]">
                1
              </div>
            </div>
            <p className="text-base font-bold text-white">{top3[0].name}</p>
            <p className="garage-mono text-sm font-bold text-[#FFD700]">{top3[0].points} pts</p>
          </motion.div>
        )}

        {/* Rank 3 */}
        {top3[2] && (
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a24] border-2 border-[#CD7F32] shadow-[0_0_15px_rgba(205,127,50,0.3)]">
              <Medal className="h-7 w-7 text-[#CD7F32]" />
              <div className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#CD7F32] text-[10px] font-bold text-[#0f0f14]">
                3
              </div>
            </div>
            <p className="text-sm font-bold text-white">{top3[2].name}</p>
            <p className="text-xs text-[#8f8f99]">{top3[2].points} pts</p>
          </motion.div>
        )}
      </div>

      {/* REST OF LIST */}
      <div className="flex flex-col gap-2">
        {rest.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center justify-between rounded-xl border border-[#34343c] bg-[#1a1a24] p-3 transition-colors hover:bg-[#252532]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[#0f0f14] font-bold text-[#8f8f99]">
                #{entry.rank}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{entry.name}</p>
                <p className="text-xs text-[#8f8f99]">{entry.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1">
                {entry.trend === "up" && <ArrowUp className="h-4 w-4 text-[#4ade80]" />}
                {entry.trend === "down" && <ArrowDown className="h-4 w-4 text-[#ff8a93]" />}
                {entry.trend === "flat" && <ArrowRight className="h-4 w-4 text-[#8f8f99]" />}
              </div>
              <p className="garage-mono text-sm font-bold text-[#ffd08a]">{entry.points} pts</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
