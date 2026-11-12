// Edge Function: meneruskan prompt analisis MESO ke Gemini.
// API key disimpan sebagai secret (tidak pernah ada di frontend).
// Deploy dengan pengaturan default (verify JWT aktif) -> hanya pengguna login yang bisa memanggil.
// Secret opsional: GEMINI_MODEL (model utama), GEMINI_FALLBACK_MODEL (model cadangan).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-api-version, apikey, content-type',
};
const json = (o: unknown) =>
  new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Panggil satu model; ulangi bila server sibuk (429/500/503/504).
async function panggil(model: string, key: string, prompt: string) {
  let terakhir = '';
  for (let i = 0; i < 3; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      },
    );
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text).join('');
      if (!text) throw new Error('Gemini tidak mengembalikan teks');
      return text;
    }
    terakhir = j.error?.message ?? 'Gemini error ' + res.status;
    if (![429, 500, 503, 504].includes(res.status)) throw new Error(terakhir);
    await tunggu(1500 * (i + 1));
  }
  throw new Error('SIBUK: ' + terakhir);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { prompt } = await req.json();
    if (!prompt || prompt.length > 12000) throw new Error('Prompt kosong atau terlalu panjang');
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY belum diatur');
    const utama = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
    const cadangan = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-2.5-flash-lite';
    try {
      return json({ text: await panggil(utama, key, prompt) });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!msg.startsWith('SIBUK') || cadangan === utama) throw e;
      return json({ text: await panggil(cadangan, key, prompt) });
    }
  } catch (e) {
    // status 200 supaya pesan error terbaca di frontend
    return json({ error: String((e as Error).message ?? e) });
  }
});
