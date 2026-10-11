// Confere se node_modules corresponde EXATAMENTE ao package-lock.json (versão e integridade de cada pacote).
// Saída 0 = em dia (não precisa reinstalar); 1 = diferente ou ausente (rodar npm ci).
// Usado pelo api/publicar.ps1: evita apagar node_modules à toa (arquivos em uso pelo "npm run dev" travam o npm ci no Windows).
import { readFileSync } from "node:fs";

const ler = (p) => { try { return JSON.parse(readFileSync(p, "utf8")).packages || {}; } catch { return null; } };
const lock = ler("package-lock.json");
const instalado = ler("node_modules/.package-lock.json");
if (!lock || !instalado) process.exit(1);
const chaves = Object.keys(lock).filter((k) => k !== "");
// pacotes opcionais de outras plataformas não são instalados aqui: só contam os que existem no instalado ou não são opcionais
const relevantes = chaves.filter((k) => instalado[k] || !lock[k].optional);
const igual = relevantes.every((k) => instalado[k] && instalado[k].version === lock[k].version && instalado[k].integrity === lock[k].integrity)
  && Object.keys(instalado).every((k) => k === "" || lock[k]);
process.exit(igual ? 0 : 1);
