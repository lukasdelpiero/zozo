"""Valida somente bancos descartáveis: o verificador não pode apagar um destino existente."""
import base64
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "dev" / "conferir_backup.py"


class TesteBackup(unittest.TestCase):
    def rodar(self, sql, destino):
        return subprocess.run([sys.executable, "-I", str(SCRIPT), str(sql), str(destino)],
                              capture_output=True, timeout=10)

    def test_destino_existente_permanece_intacto(self):
        with tempfile.TemporaryDirectory() as pasta:
            sql, destino = Path(pasta) / "backup.sql", Path(pasta) / "dados.db"
            sql.write_text("CREATE TABLE exemplo (id INTEGER);", encoding="utf-8")
            destino.write_bytes(b"BANCO ORIGINAL NAO APAGAR")
            self.assertNotEqual(self.rodar(sql, destino).returncode, 0)
            self.assertEqual(destino.read_bytes(), b"BANCO ORIGINAL NAO APAGAR")

    def test_documento_invalido_faz_verificacao_falhar(self):
        with tempfile.TemporaryDirectory() as pasta:
            sql = Path(pasta) / "backup.sql"
            sal = base64.b64encode(b"s" * 16).decode()
            sql.write_text("CREATE TABLE contas(email TEXT, sal TEXT, kdf TEXT, iteracoes INTEGER);"
                           "CREATE TABLE documentos(email TEXT, versao INTEGER, conteudo TEXT);"
                           f"INSERT INTO contas VALUES('teste', '{sal}', 'pbkdf2',600000);"
                           "INSERT INTO documentos VALUES('teste', 1, 'INVALIDO');", encoding="utf-8")
            self.assertNotEqual(self.rodar(sql, Path(pasta) / "novo.db").returncode, 0)

    def test_backup_valido_retorna_sucesso(self):
        with tempfile.TemporaryDirectory() as pasta:
            sql = Path(pasta) / "backup.sql"
            sql.write_text("CREATE TABLE contas(email TEXT, sal TEXT, kdf TEXT, iteracoes INTEGER);"
                           "CREATE TABLE documentos(email TEXT, versao INTEGER, conteudo TEXT);", encoding="utf-8")
            self.assertEqual(self.rodar(sql, Path(pasta) / "novo.db").returncode, 0)
