import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { renderReel, buildReelScript } from '../src/lib/reel-renderer.js';

const outputDir = path.resolve('artifacts', 'reel-smoke'); await mkdir(outputDir, { recursive: true });
const content = { id:'smoke-test', title:'Pedido completo. Sem adivinhação.', hook:'O cliente pediu adicional. A cozinha recebeu?', cta:'Crie seu cardápio' };
const script = buildReelScript(content, 15);
assert(script.scenes.reduce((sum, scene) => sum + scene.duration, 0) === 15, 'Duração das cenas inválida.');
const result = await renderReel({ content, sourceImagePath:path.resolve('public','assets','tapronto-logo.png'), outputDir, duration:15 });
const cover = await sharp(result.coverPath).metadata(); const video = await readFile(result.outputPath);
assert(cover.width === 1080 && cover.height === 1920, 'Capa fora de 1080x1920.');
assert(video.subarray(4,8).toString() === 'ftyp', 'MP4 inválido.');
assert(result.size > 50_000, 'MP4 muito pequeno.');
console.log(`Reel render smoke: OK (${result.size} bytes, ${result.script.duration}s)`);
if (process.argv.includes('--clean')) await rm(outputDir,{recursive:true,force:true});
function assert(condition,message){if(!condition)throw new Error(message);}
