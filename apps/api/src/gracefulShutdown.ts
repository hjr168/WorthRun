export async function runGracefulShutdown(input: {
  closeServer: () => Promise<void>;
  disconnectDatabase: () => Promise<void>;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 10_000;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    input.closeServer(),
    new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  await input.disconnectDatabase();
  return { timedOut };
}
