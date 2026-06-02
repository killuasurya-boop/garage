export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureDatabaseReady } = await import("@/db");
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.warn(
      "[garage-db] Startup DB warmup skipped:",
      error instanceof Error ? error.message : error,
    );
  }
}
