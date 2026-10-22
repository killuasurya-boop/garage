export async function register() {
  // Keep Node-only imports inside this positive guard so the Edge bundle can
  // eliminate the entire branch, including its database/crypto dependencies.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
