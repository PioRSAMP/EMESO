// Edge Function: meneruskan prompt analisis MESO ke Gemini.
// API key disimpan sebagai secret (tidak pernah ada di frontend).
// Deploy dengan pengaturan default (verify JWT aktif) -> hanya pengguna login yang bisa memanggil.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-api-version, apikey, content-type',
};
const json = (o: unknown) =>
  new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { prompt } = await req.json();
    if (!prompt || prompt.length > 12000) throw new Error('Prompt kosong atau terlalu panjang');
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY belum diatur');
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
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
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message ?? 'Gemini error ' + res.status);
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text).join('');
    if (!text) throw new Error('Gemini tidak mengembalikan teks');
    return json({ text });
  } catch (e) {
    // status 200 supaya pesan error terbaca di frontend
    return json({ error: String((e as Error).message ?? e) });
  }
});
