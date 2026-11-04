// Confere se a instalação REGISTRADA em node_modules (node_modules/.package-lock.json) bate com o package-lock.json:
// versão e integridade anotadas de cada pacote. NÃO calcula o hash dos arquivos instalados: um arquivo editado dentro
// de node_modules passa. Por isso a publicação em produção sempre reinstala do zero (npm ci, que confere o hash do
// que baixa); este atalho fica só para a prévia.
// Saída 0 = em dia (não precisa reinstalar); 1 = diferente ou ausente (rodar npm ci).
// Evita apagar node_modules à toa na prévia (arquivos em uso pelo "npm run dev" travam o npm ci no Windows).
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
