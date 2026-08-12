import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export function buildReelScript(content, duration = 15, template = 'problem_solution') {
  const hook = clean(content.hook || content.overlay_text || content.title || 'Pedido completo. Sem adivinhação.').slice(0, 72);
  const benefit = clean(content.cta || 'Pedidos organizados do começo ao fim.').slice(0, 64);
  const seconds = Math.min(45, Math.max(8, Number(duration) || 15));
  const cuts = seconds <= 15 ? [3, 4, 5, 3] : [3, 6, seconds - 13, 4];
  return {
    title: clean(content.title), duration: seconds, template,
    scenes: [
      { duration: cuts[0], eyebrow: 'NA HORA DE PICO', text: hook, tone: 'hook' },
      { duration: cuts[1], eyebrow: 'O PROBLEMA', text: 'Pedido incompleto vira atraso, retrabalho e cliente esperando.', tone: 'problem' },
      { duration: cuts[2], eyebrow: 'COM O TÁPRONTO', text: 'Produto, adicionais, entrega e pagamento chegam juntos no painel.', tone: 'product' },
      { duration: cuts[3], eyebrow: 'PEDIDO ORGANIZADO', text: benefit, subtext: 'Crie seu cardápio · link no perfil', tone: 'cta' }
    ],
    caption: clean(content.caption), cta: benefit
  };
}

export async function renderReel({ content, sourceImagePath = '', outputDir, duration = 15, template = 'problem_solution', onProgress = () => {} }) {
  if (!ffmpegPath) throw new Error('FFmpeg não está disponível nesta plataforma.');
  const script = buildReelScript(content, duration, template);
  const jobDir = path.join(outputDir, `.reel-${randomUUID()}`);
  await mkdir(jobDir, { recursive: true });
  try {
    let sourceData = '';
    if (sourceImagePath) sourceData = (await sharp(sourceImagePath).resize(900, 980, { fit: 'contain', background: '#ffffff' }).png().toBuffer()).toString('base64');
    const frames = [];
    for (let index = 0; index < script.scenes.length; index += 1) {
      const scene = script.scenes[index];
      const framePath = path.join(jobDir, `scene-${index}.png`);
      await sharp(Buffer.from(sceneSvg(scene, sourceData, index))).png().toFile(framePath);
      frames.push({ path: framePath, duration: scene.duration });
      onProgress(10 + index * 12);
    }
    const concatPath = path.join(jobDir, 'scenes.txt');
    const concat = frames.flatMap((frame) => [`file '${ffmpegFile(frame.path)}'`, `duration ${frame.duration}`]).concat(`file '${ffmpegFile(frames.at(-1).path)}'`).join('\n');
    await writeFile(concatPath, concat);
    const outputPath = path.join(outputDir, `reel-${content.id || randomUUID()}.mp4`);
    await runFfmpeg(['-y','-f','concat','-safe','0','-i',concatPath,'-vf',`fps=${FPS},format=yuv420p`,'-c:v','libx264','-preset','medium','-crf','21','-movflags','+faststart','-an',outputPath]);
    onProgress(88);
    const coverPath = path.join(outputDir, `reel-${content.id || randomUUID()}-cover.jpg`);
    await sharp(frames[0].path).jpeg({ quality: 90 }).toFile(coverPath);
    const buffer = await readFile(outputPath);
    onProgress(100);
    return { outputPath, coverPath, script, checksum: createHash('sha256').update(buffer).digest('hex'), size: buffer.length, width: WIDTH, height: HEIGHT };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

function sceneSvg(scene, sourceData, index) {
  const red = scene.tone === 'hook' || scene.tone === 'cta';
  const text = wrap(escapeXml(scene.text), 24);
  const lines = text.map((line, lineIndex) => `<text x="78" y="${355 + lineIndex * 104}" font-size="82" font-weight="800" fill="${lineIndex === 0 && red ? '#ef1728' : '#071b3a'}">${line}</text>`).join('');
  const screenshot = sourceData && index >= 1 ? `<rect x="70" y="850" width="940" height="820" rx="42" fill="#fff" stroke="#dce2ea" stroke-width="4"/><image href="data:image/png;base64,${sourceData}" x="90" y="875" width="900" height="770" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="70" y="900" width="940" height="620" rx="52" fill="#071b3a"/><text x="540" y="1170" text-anchor="middle" font-size="70" font-weight="800" fill="#fff">TáPronto</text><text x="540" y="1260" text-anchor="middle" font-size="38" fill="#d9e4f6">Cardápio e pedidos.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#f8fafc"/><circle cx="1020" cy="70" r="300" fill="#fff0f2"/><text x="78" y="185" font-size="31" font-weight="800" letter-spacing="3" fill="#ef1728">${escapeXml(scene.eyebrow)}</text>${lines}${screenshot}<rect x="70" y="1770" width="940" height="6" rx="3" fill="#e4e9f0"/><rect x="70" y="1770" width="${235 * (index + 1)}" height="6" rx="3" fill="#ef1728"/><text x="78" y="1845" font-size="34" font-weight="700" fill="#071b3a">TáPronto</text><text x="1005" y="1845" text-anchor="end" font-size="27" fill="#516078">taprontomenu.com.br</text></svg>`;
}

function runFfmpeg(args) { return new Promise((resolve, reject) => { const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore','ignore','pipe'] }); let stderr = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Renderização excedeu o tempo máximo.')); }, 180000); child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); }); child.on('error', reject); child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`FFmpeg falhou (${code}): ${stderr.slice(-800)}`)); }); }); }
function wrap(text, max) { const words = text.split(/\s+/); const lines = []; let line = ''; for (const word of words) { if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) lines.push(line); return lines.slice(0, 5); }
function escapeXml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' })[char]); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function ffmpegFile(value) { return path.resolve(value).replaceAll('\\','/').replaceAll("'", "'\\''"); }
