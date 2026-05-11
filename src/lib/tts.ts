// Lightweight Web Speech API helpers.
export function speak(text: string, bcp47?: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const cleaned = text.replace(/[*_`#>~|]/g, "");
  if (bcp47) {
    const u = new SpeechSynthesisUtterance(cleaned);
    u.lang = bcp47;
    u.rate = 0.95;
    speechSynthesis.speak(u);
    return;
  }
  // Auto: split sentences, detect JP vs Latin
  const parts = cleaned
    .split(/(?<=[。．!?！？\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const isJP = /[぀-ヿ㐀-鿿]/.test(p);
    const u = new SpeechSynthesisUtterance(p);
    u.lang = isJP ? "ja-JP" : "en-US";
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}
