"""Restaura um export SQL do D1 num SQLite NOVO e confere a integridade (sem imprimir e-mails nem conteúdo)."""
import base64, os, sqlite3, sys

sql, destino = sys.argv[1], sys.argv[2]
if os.path.exists(destino):
    os.remove(destino)
db = sqlite3.connect(destino)
db.executescript(open(sql, encoding="utf-8").read())
db.commit()

def um(q, *p):
    return db.execute(q, p).fetchone()[0]

print("integrity_check:", um("PRAGMA integrity_check"))
tabelas = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
for t in tabelas:
    print(f"  {t}: {um(f'SELECT COUNT(*) FROM {t}')} linhas")
if "d1_migrations" in tabelas:
    print("migrações aplicadas:", ", ".join(r[0] for r in db.execute("SELECT name FROM d1_migrations ORDER BY id")))

problemas = []
if "contas" in tabelas:
    kdfs = {}
    for sal, kdf, it in db.execute("SELECT sal, kdf, iteracoes FROM contas"):
        kdfs[kdf or "pbkdf2"] = kdfs.get(kdf or "pbkdf2", 0) + 1
        try:
            if len(base64.b64decode(sal)) < 16:
                problemas.append("sal curto")
        except Exception:
            problemas.append("sal ilegível")
    print("contas por KDF:", kdfs)

def conferir_doc(nome, versao, conteudo):
    try:
        b = base64.b64decode(conteudo, validate=True)
    except Exception:
        problemas.append(f"{nome}: base64 inválido"); return
    if len(b) < 30 or b[0] != 2:
        problemas.append(f"{nome}: formato inesperado (byte inicial {b[0] if b else None})")
    if not isinstance(versao, int) or versao < 1:
        problemas.append(f"{nome}: versão inválida")

docs = 0
for i, (versao, conteudo) in enumerate(db.execute("SELECT versao, conteudo FROM documentos")):
    conferir_doc(f"documento {i}", versao, conteudo); docs += 1
hist = [t for t in tabelas if "hist" in t]
for t in hist:
    for i, (versao, conteudo) in enumerate(db.execute(f"SELECT versao, conteudo FROM {t}")):
        conferir_doc(f"{t} {i}", versao, conteudo)
orfaos = um("SELECT COUNT(*) FROM documentos d WHERE NOT EXISTS (SELECT 1 FROM contas c WHERE c.email = d.email)") if "contas" in tabelas else "?"
print(f"documentos conferidos: {docs}; histórico: {', '.join(hist) or 'nenhuma tabela'}; documentos sem conta: {orfaos}")
print("PROBLEMAS:", problemas or "nenhum")
