function rot13(e) {
  return e.replace(/[a-zA-Z]/g, function (e) {
    return String.fromCharCode((e <= "Z" ? 90 : 122) >= (e = e.charCodeAt(0) + 13) ? e : e - 26);
  });
}

function base64ToBytes(e) {
  if (!e) return new Uint8Array();
  e = e.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (e.length % 4) e += "=";
  const t = atob(e);
  const n = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) n[i] = t.charCodeAt(i);
  return n;
}

function bytesToString(e) {
  return new TextDecoder("utf-8").decode(e);
}

async function decryptGcmB64(key, ivB64, ctB64, tagB64) {
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const tag = base64ToBytes(tagB64);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    combined
  );
  return bytesToString(new Uint8Array(decrypted));
}

async function main() {
  const cnpj = "20586683000118";
  const payload = {
    cnpj,
    type: "reveal",
    timestamp: new Date().toISOString(),
    bd: {
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "Win32",
      language: "pt-BR",
      languages: ["pt-BR", "pt", "en-US", "en"],
      cookie_enabled: true,
      online: true,
      screen_width: 1920,
      screen_height: 1080,
      page_url: "https://cnpj.biz/20586683000118",
      timestamp: new Date().toISOString()
    }
  };

  const encoded = Buffer.from(rot13(JSON.stringify(payload))).toString('base64');

  const res = await fetch("https://cnpj.biz/api/getContactCNPJ", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://cnpj.biz/20586683000118"
    },
    body: JSON.stringify({ data: encoded })
  });

  console.log("Status:", res.status);
  const json = await res.json();
  console.log("Response:", json);

  if (json.key) {
    const rawKey = base64ToBytes(json.key);
    const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);

    // Tel 1
    const t1 = await decryptGcmB64(cryptoKey, "e4cCm4g/sgXlN3QQ", "dbI5IlHADgEYQAam//k=", "Td6U4M5AF3xDO5wVuF65bw==");
    console.log("Telefone 1:", t1);

    // Tel 2 (WhatsApp)
    const t2 = await decryptGcmB64(cryptoKey, "RhQNwP+TWX/pbb7n", "1vF54Mg0prSafPh5E9BV", "HtkHvJMqUqofBzYidAowfw==");
    console.log("Telefone 2 (WhatsApp):", t2);

    // Email
    const email = await decryptGcmB64(cryptoKey, "cI8v1NSQ+2pdUwKw", "ARl8Ai8bco5NQKovUhaIIk9rbhX4Mub8X11OyWmQNSnpqJw=", "FNdKP3ZsiAztD8hP7JL8Mw==");
    console.log("Email:", email);
  }
}

main().catch(console.error);
