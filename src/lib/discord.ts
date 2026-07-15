export async function sendDiscord(
  webhookUrl: string | null | undefined,
  content: string,
) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  } catch {
    // non-fatal
  }
}
