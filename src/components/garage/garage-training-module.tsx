"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  FileText,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GarageApiError } from "@/lib/api-client";
import { useGarageToast } from "@/components/garage/garage-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

type CourseLesson = {
  id: string;
  title: string;
  summary: string;
  checklist: string[];
};

type TrainingCourse = {
  id: string;
  title: string;
  category: string;
  summary: string;
  progressStatus: "pending" | "in_progress" | "completed";
  lessons: CourseLesson[];
};

type SopChecklist = {
  id: string;
  title: string;
  description: string | null;
  roleTarget: string;
  shiftTarget: string;
  isCompletedToday: boolean;
};

const shiftLabels: Record<string, string> = {
  all: "Sepanjang Shift",
  morning: "Opening",
  evening: "Closing",
};

function splitInstruction(item: string) {
  const match = item.match(/^\*\*(.+?):\*\*\s*(.+)$/);
  if (!match) return { label: null, detail: item };
  return { label: match[1], detail: match[2] };
}

export function GarageTrainingModule() {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [sops, setSops] = useState<SopChecklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useGarageToast();

  const parseResponse = async (res: Response) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new GarageApiError(err.error || "Gagal memuat data", { status: res.status });
    }
    return res.json();
  };

  const fetchTrainingData = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/training");
      const data = await parseResponse(res);
      setCourses(data.courses || []);
      setSops(data.sops || []);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat data training.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTrainingData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchTrainingData]);

  const markCourseCompleted = async (courseId: string) => {
    try {
      await parseResponse(await fetch(`/api/staff/training/${courseId}/complete`, { method: "POST" }));
      toast.push({ tone: "success", title: "Selesai", body: "Training ditandai selesai." });
      void fetchTrainingData();
    } catch {
      toast.push({ tone: "error", title: "Gagal", body: "Gagal menyimpan progress." });
    }
  };

  const submitSop = async (checklistId: string) => {
    try {
      await parseResponse(await fetch(`/api/staff/sop/${checklistId}/submit`, { method: "POST" }));
      toast.push({ tone: "success", title: "Berhasil", body: "SOP Harian berhasil diceklis." });
      void fetchTrainingData();
    } catch {
      toast.push({ tone: "error", title: "Gagal", body: "Gagal menceklis SOP." });
    }
  };

  const totalLessons = courses.reduce((total, course) => total + course.lessons.length, 0);
  const completedCourses = courses.filter((course) => course.progressStatus === "completed").length;
  const completedSops = sops.filter((sop) => sop.isCompletedToday).length;
  const pendingSops = Math.max(sops.length - completedSops, 0);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center p-8 text-zinc-400">Memuat Buku Pintar...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-400">{error}</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0f0f14] p-4 text-zinc-100 sm:p-6">
      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_28rem]">
        <div className="rounded-lg border border-[#34343c] bg-[#181820] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-md border border-[#d11a2a]/30 bg-[#d11a2a]/12 p-2.5 text-[#ff6b76]">
                <BookOpenCheck className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5a742]">Tutorial & SOP Karyawan</p>
                <h2 className="mt-1 text-2xl font-black text-zinc-50 sm:text-3xl">Buku Pintar GARAGE</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Pusat panduan onboarding, checklist kerja harian, SOP utama, tutorial GARAGE OS,
                  dan troubleshooting untuk staff outlet.
                </p>
              </div>
            </div>
            <div className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#86efac]">
              Siap Training
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-[#34343c] bg-[#181820] p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Materi</p>
            <p className="mt-2 text-2xl font-black text-zinc-50">{courses.length}</p>
            <p className="text-xs text-zinc-500">{totalLessons} bab</p>
          </div>
          <div className="rounded-lg border border-[#34343c] bg-[#181820] p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Selesai</p>
            <p className="mt-2 text-2xl font-black text-[#86efac]">{completedCourses}</p>
            <p className="text-xs text-zinc-500">course</p>
          </div>
          <div className="rounded-lg border border-[#34343c] bg-[#181820] p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">SOP Pending</p>
            <p className="mt-2 text-2xl font-black text-[#f5a742]">{pendingSops}</p>
            <p className="text-xs text-zinc-500">hari ini</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="training" className="flex flex-1 flex-col">
        <TabsList className="h-auto w-full justify-start gap-2 rounded-lg border border-[#34343c] bg-[#181820] p-1">
          <TabsTrigger
            value="training"
            className="gap-2 rounded-md px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-400 data-[state=active]:bg-[#d11a2a] data-[state=active]:text-white"
          >
            <FileText className="size-4" />
            Materi Pelatihan
          </TabsTrigger>
          <TabsTrigger
            value="sop"
            className="gap-2 rounded-md px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-400 data-[state=active]:bg-[#d11a2a] data-[state=active]:text-white"
          >
            <ClipboardCheck className="size-4" />
            Checklist SOP ({sops.length})
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="mt-4 flex-1 pr-1">
          <TabsContent value="training" className="m-0 space-y-4 pb-6">
            {courses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#34343c] bg-[#181820] p-8 text-center text-sm text-zinc-500">
                Tidak ada materi pelatihan yang wajib untuk peran Anda saat ini.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {courses.map((course) => (
                  <Card key={course.id} className="overflow-hidden border-[#34343c] bg-[#181820] shadow-none">
                    <CardHeader className="border-b border-[#2a2a30]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#f5a742]">
                            {course.category}
                          </div>
                          <CardTitle className="text-xl font-black leading-7 text-zinc-50">{course.title}</CardTitle>
                        </div>
                        {course.progressStatus === "completed" ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2.5 py-1 text-xs font-black text-[#86efac]">
                            <CheckCircle2 className="size-3.5" /> Selesai
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 rounded-full border border-[#f5a742]/30 bg-[#f5a742]/10 px-2.5 py-1 text-xs font-black text-[#ffd08a]">
                            Wajib
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{course.summary}</p>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <div className="space-y-2">
                        {course.lessons.map((lesson) => (
                          <div key={lesson.id} className="rounded-md border border-[#2a2a30] bg-black/20 p-3">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[#d11a2a]/12 text-xs font-black text-[#ff8a92]">
                                {lesson.title.match(/BAB\s+(\d+)/)?.[1] ?? "S"}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-black text-zinc-100">{lesson.title}</h4>
                                <p className="mt-1 text-xs leading-5 text-zinc-500">{lesson.summary}</p>
                              </div>
                            </div>
                            {lesson.checklist && lesson.checklist.length > 0 && (
                              <ul className="mt-3 space-y-1.5 border-t border-[#2a2a30] pt-3">
                                {lesson.checklist.slice(0, 4).map((item, idx) => {
                                  const instruction = splitInstruction(item);
                                  return (
                                    <li key={idx} className="flex gap-2 text-xs leading-5 text-zinc-400">
                                      <CheckSquare className="mt-0.5 size-3.5 shrink-0 text-[#f5a742]" />
                                      <span>
                                        {instruction.label ? (
                                          <strong className="font-black text-zinc-200">{instruction.label}: </strong>
                                        ) : null}
                                        {instruction.detail}
                                      </span>
                                    </li>
                                  );
                                })}
                                {lesson.checklist.length > 4 ? (
                                  <li className="pl-5 text-xs font-semibold text-zinc-500">
                                    +{lesson.checklist.length - 4} instruksi detail di dokumen lengkap
                                  </li>
                                ) : null}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>

                      <Button
                        disabled={course.progressStatus === "completed"}
                        onClick={() => markCourseCompleted(course.id)}
                        className="garage-press h-11 w-full font-black"
                        variant={course.progressStatus === "completed" ? "secondary" : "default"}
                      >
                        {course.progressStatus === "completed" ? "Pelatihan Telah Selesai" : "Tandai Telah Dibaca"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sop" className="m-0 space-y-4 pb-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[#34343c] bg-[#181820] p-4">
                <div className="flex items-center gap-2 text-[#f5a742]">
                  <ListChecks className="size-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Total SOP</p>
                </div>
                <p className="mt-2 text-3xl font-black text-zinc-50">{sops.length}</p>
              </div>
              <div className="rounded-lg border border-[#34343c] bg-[#181820] p-4">
                <div className="flex items-center gap-2 text-[#86efac]">
                  <CheckCircle2 className="size-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Sudah</p>
                </div>
                <p className="mt-2 text-3xl font-black text-[#86efac]">{completedSops}</p>
              </div>
              <div className="rounded-lg border border-[#34343c] bg-[#181820] p-4">
                <div className="flex items-center gap-2 text-[#ff8a92]">
                  <ShieldAlert className="size-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Belum</p>
                </div>
                <p className="mt-2 text-3xl font-black text-[#ff8a92]">{pendingSops}</p>
              </div>
            </div>

            {sops.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#34343c] bg-[#181820] p-8 text-center">
                <ClipboardCheck className="mx-auto size-8 text-zinc-600" />
                <p className="mt-3 text-sm font-bold text-zinc-300">Checklist SOP belum tersedia untuk role ini.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Hubungi Admin/Owner untuk menambahkan SOP harian sesuai station kerja.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {sops.map((sop) => (
                  <Card
                    key={sop.id}
                    className={`overflow-hidden border shadow-none ${
                      sop.isCompletedToday
                        ? "border-[#22c55e]/35 bg-[#102016]"
                        : "border-[#34343c] bg-[#181820]"
                    }`}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="flex min-w-0 items-start gap-2 text-base font-black leading-6 text-zinc-50">
                          <span
                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
                              sop.isCompletedToday
                                ? "bg-[#22c55e]/12 text-[#86efac]"
                                : "bg-[#f5a742]/12 text-[#ffd08a]"
                            }`}
                          >
                            {sop.isCompletedToday ? (
                              <CheckCircle2 className="size-4" />
                            ) : (
                              <ClipboardCheck className="size-4" />
                            )}
                          </span>
                          <span>{sop.title}</span>
                        </CardTitle>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                            sop.isCompletedToday
                              ? "bg-[#22c55e]/12 text-[#86efac]"
                              : "bg-[#d11a2a]/12 text-[#ff8a92]"
                          }`}
                        >
                          {sop.isCompletedToday ? "Done" : "Wajib"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{sop.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#34343c] bg-black/20 px-2 py-1 text-xs font-bold text-zinc-300">
                          <Clock3 className="size-3.5 text-[#f5a742]" />
                          {shiftLabels[sop.shiftTarget] ?? sop.shiftTarget}
                        </span>
                        <span className="rounded-md border border-[#34343c] bg-black/20 px-2 py-1 text-xs font-bold text-zinc-300">
                          Role: {sop.roleTarget}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="border-t border-[#2a2a30] p-4 pt-3">
                      <Button
                        onClick={() => submitSop(sop.id)}
                        disabled={sop.isCompletedToday}
                        variant={sop.isCompletedToday ? "outline" : "default"}
                        size="sm"
                        className={`garage-press h-10 w-full font-black ${
                          sop.isCompletedToday ? "border-[#22c55e]/45 text-[#86efac]" : ""
                        }`}
                      >
                        {sop.isCompletedToday ? (
                          <>
                            <CheckCircle2 className="mr-2 size-4" /> Sudah Dikerjakan
                          </>
                        ) : (
                          <>
                            <ClipboardCheck className="mr-2 size-4" /> Tandai SOP Selesai
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
