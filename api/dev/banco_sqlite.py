"""
Banco SQLite com a mesma interface do D1 (BancoD1 em src/entry.py).
Usado só nos testes e no servidor local — nunca no Cloudflare.

As tabelas vêm de api/migracoes/*.sql, aplicadas em ordem e uma única vez,
como o "wrangler d1 migrations apply" faz no D1 (mesma tabela d1_migrations).
"""
import pathlib
import sqlite3

MIGRACOES = pathlib.Path(__file__).resolve().parent.parent / "migracoes"


def aplicar_migracoes(con):
    con.execute("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, "
                "applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    feitas = {r[0] for r in con.execute("SELECT name FROM d1_migrations")}
    for arq in sorted(MIGRACOES.glob("*.sql")):
        if arq.name in feitas:
            continue
        con.executescript("BEGIN;\n" + arq.read_text(encoding="utf-8") + "\nCOMMIT;")
        con.execute("INSERT INTO d1_migrations (name) VALUES (?)", (arq.name,))


def conectar(caminho=":memory:"):
    con = sqlite3.connect(caminho, isolation_level=None, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")      # o D1 também aplica as chaves estrangeiras
    aplicar_migracoes(con)
    return con


class BancoSqlite:
    def __init__(self, con):
        self.con = con

    async def primeiro(self, sql, *params):
        # fetchall: com INSERT ... RETURNING o comando só termina (e grava) depois de ler tudo
        linhas = self.con.execute(sql, params).fetchall()
        return dict(linhas[0]) if linhas else None

    async def todos(self, sql, *params):
        return [dict(x) for x in self.con.execute(sql, params).fetchall()]

    async def executar(self, sql, *params):
        return self.con.execute(sql, params).rowcount

    async def lote(self, comandos):
        """Transação, como o batch do D1: qualquer erro desfaz todos os comandos."""
        self.con.execute("BEGIN IMMEDIATE")
        try:
            r = [self.con.execute(sql, tuple(p)).rowcount for sql, p in comandos]
        except Exception:
            self.con.execute("ROLLBACK")
            raise
        self.con.execute("COMMIT")
        return r
