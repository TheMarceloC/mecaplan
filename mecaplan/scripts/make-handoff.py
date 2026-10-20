"""Build source and private transfer ZIPs without altering live application data.

Uses only Python's standard library. Database.backup captures committed WAL data.
Private artifacts contain credentials: this script never prints their values.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def files(root: Path) -> list[Path]:
    result = []
    for p in root.rglob('*'):
        if p.is_symlink():
            raise RuntimeError(f'No se empaquetan enlaces simbólicos: {p.relative_to(root)}')
        if p.is_file():
            result.append(p)
    return sorted(result)


def manifest(root: Path, label: str) -> None:
    write_json(root / 'MANIFIESTO_SHA256.json', {
        'package': label,
        'generatedUtc': datetime.now(timezone.utc).isoformat(),
        'files': [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size,
                   'sha256': digest(p)} for p in files(root)],
    })


def zip_tree(root: Path, target: Path) -> None:
    if target.exists():
        raise RuntimeError('No se sobrescribe un paquete existente: ' + target.name)
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
        for p in files(root):
            z.write(p, p.relative_to(root).as_posix())
    with ZipFile(target) as z:
        if z.testzip() is not None:
            raise RuntimeError('Error de integridad ZIP: ' + target.name)
        for name in z.namelist():
            if name.startswith('/') or '..' in Path(name).parts or '\\' in name:
                raise RuntimeError('Ruta de ZIP no permitida: ' + name)


def build(args: argparse.Namespace) -> None:
    root = Path(__file__).resolve().parents[1]
    out = Path(args.output).resolve()
    if out.exists():
        raise RuntimeError('El destino debe ser una carpeta nueva; no se borrará ni sobrescribirá.')
    for name in ['requirements', 'users', 'matrix', 'credentials']:
        if not Path(getattr(args, name)).is_file():
            raise RuntimeError('Archivo de entrada ausente: ' + name)
    if not (root / 'data/mecaplan.sqlite').is_file():
        raise RuntimeError('No existe una base local para la entrega privada.')
    out.mkdir(parents=True)
    stage = out / '_preparacion'
    code = stage / 'codigo'
    app = code / 'mecaplan'
    app.mkdir(parents=True)
    for name in ['src', 'public', 'docs', 'scripts', 'tests']:
        shutil.copytree(root / name, app / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ['.env.example', '.gitignore', 'AGENTS.md', 'README.md',
                 'PROMPT_CONTINUAR_MECAPLAN.md', 'package.json', 'pnpm-lock.yaml',
                 'pnpm-workspace.yaml', 'next-env.d.ts', 'next.config.ts',
                 'postcss.config.mjs', 'tsconfig.json', 'vitest.config.ts',
                 'playwright.config.ts']:
        shutil.copy2(root / name, app / name)
    refs = app / 'referencias'
    refs.mkdir()
    shutil.copy2(args.requirements, refs / 'prompt-codex-gestor-proyectos.md')
    (code / 'LEEME_PRIMERO.md').write_text(
        '# Desarrollo de MecaPlan\n\nAbre `mecaplan/docs/HANDOFF.md` y '
        '`mecaplan/PROMPT_CONTINUAR_MECAPLAN.md`. Instala Node 24 o superior. '
        'Desde `mecaplan`: `npm install` y `npm run dev`; con pnpm usa '
        '`pnpm install --frozen-lockfile` para conservar las versiones del lockfile. '
        'Este paquete excluye la base y las contraseñas.\n', encoding='utf-8')
    # Known generated password values must never appear in the source archive.
    generated_path = root / 'data/generated-credentials.json'
    secrets = json.loads(generated_path.read_text(encoding='utf-8')) if generated_path.exists() else []
    for p in files(code):
        payload = p.read_bytes()
        if any(c.get('password', '').encode() in payload for c in secrets if c.get('password')):
            raise RuntimeError('Se encontró una credencial dentro del paquete de código.')
        if p.name.startswith('.env') and p.name != '.env.example':
            raise RuntimeError('Se encontró un entorno real en el paquete de código.')
    manifest(code, 'MecaPlan codigo y prompt, sin base ni credenciales')
    source_zip = out / 'MecaPlan_Codigo_y_Prompt.zip'
    zip_tree(code, source_zip)

    private = stage / 'privado'
    data = private / 'restaurar/mecaplan/data'
    data.mkdir(parents=True)
    snapshot = data / 'mecaplan.sqlite'
    source = sqlite3.connect((root / 'data/mecaplan.sqlite').as_uri() + '?mode=ro', uri=True)
    target = sqlite3.connect(snapshot)
    try:
        source.backup(target)
        for table in ['sessions', 'password_resets', 'login_attempts']:
            target.execute('DELETE FROM ' + table)
        target.commit()
        target.execute('PRAGMA journal_mode=DELETE')
        if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('La copia de SQLite no pasó la comprobación de integridad.')
        if target.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('La copia contiene referencias SQLite inconsistentes.')
        projects = [json.loads(row[0]) for row in target.execute('SELECT payload FROM projects')]
        upload_ids = {f['id'] for p in projects for f in p.get('control', {}).get('files', [])}
        uploads = data / 'uploads'
        uploads.mkdir()
        for file_id in sorted(upload_ids):
            if not file_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in file_id):
                raise RuntimeError('Identificador de adjunto inválido en la copia.')
            original = root / 'data/uploads' / (file_id + '.bin')
            if not original.is_file():
                raise RuntimeError('Falta un adjunto referenciado por la base: ' + file_id)
            shutil.copy2(original, uploads / original.name)
        summary = {
            'generatedUtc': datetime.now(timezone.utc).isoformat(),
            'users': target.execute('SELECT COUNT(*) FROM users').fetchone()[0],
            'projects': [{'name': p['name'], 'members': len(p['members']),
                          'activities': len([a for a in p['activities'] if not a.get('deletedAt')])}
                         for p in projects],
            'evaluations': target.execute('SELECT COUNT(*) FROM evaluations').fetchone()[0],
            'referencedAttachments': len(upload_ids),
            'sessions': target.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],
            'passwordResetTokens': target.execute('SELECT COUNT(*) FROM password_resets').fetchone()[0],
            'databaseIntegrity': 'ok',
            'liveDatabaseAltered': False,
            'credentials': 'Iniciales; no regeneradas. Contraseñas cambiadas por usuarios conservan su vigencia.',
        }
    finally:
        target.close()
        source.close()
    for name in ['import-source.json', 'generated-credentials.json']:
        if (root / 'data' / name).exists():
            shutil.copy2(root / 'data' / name, data / name)
    originals = private / 'originales'
    originals.mkdir()
    shutil.copy2(args.users, originals / 'User y passwords.xlsx')
    shutil.copy2(args.matrix, originals / 'Matriz_Gestion_Proyecto_Digit360.xlsx')
    access = private / 'accesos'
    access.mkdir()
    shutil.copy2(args.credentials, access / 'Accesos_MecaPlan_Digit360.xlsx')
    shutil.copy2(root / 'docs/HANDOFF.md', private / 'GUIA_RESTAURAR.md')
    write_json(private / 'RESUMEN_DATOS.json', summary)
    (private / 'LEEME_PRIVADO.md').write_text(
        '# DATOS PRIVADOS DE MECAPLAN\n\nContiene usuarios, hashes, datos del curso, '
        'evaluaciones si existen y contraseñas iniciales en claro. No está cifrado. '
        'Entrégalo solo a la persona autorizada y no lo subas al repositorio.\n\n'
        'Con servidor detenido y sobre una instalación nueva, copia '
        '`restaurar/mecaplan/data` dentro de la carpeta `mecaplan` del código. '
        'Consulta GUIA_RESTAURAR.md. Las sesiones se vaciaron solo en esta copia. '
        'Los originales y la base activa no se modificaron.\n', encoding='utf-8')
    manifest(private, 'MecaPlan datos privados, distribucion restringida')
    private_zip = out / 'MecaPlan_Datos_Privados.zip'
    zip_tree(private, private_zip)

    bundle = stage / 'completo'
    bundle.mkdir()
    for path in [source_zip, private_zip]:
        shutil.copy2(path, bundle / path.name)
    shutil.copy2(root / 'PROMPT_CONTINUAR_MECAPLAN.md', bundle / 'PROMPT_CONTINUAR_MECAPLAN.md')
    shutil.copy2(root / 'docs/HANDOFF.md', bundle / 'GUIA_CONTINUAR.md')
    (bundle / 'LEEME_PRIMERO.md').write_text(
        '# Entrega completa de MecaPlan — PRIVADA\n\n'
        '1. Extrae MecaPlan_Codigo_y_Prompt.zip para obtener la carpeta `mecaplan`.\n'
        '2. Lee GUIA_CONTINUAR.md. Para trabajar con ejemplos, basta el paquete de código.\n'
        '3. Solo si estás autorizado a administrar datos reales, extrae '
        'MecaPlan_Datos_Privados.zip y restaura `restaurar/mecaplan/data` dentro de '
        '`mecaplan`, con el servidor detenido. Conserva las credenciales en privado.\n'
        '4. Desde `mecaplan`, instala dependencias y ejecuta el servidor como indica la guía.\n'
        '5. Entrega PROMPT_CONTINUAR_MECAPLAN.md al agente que continuará.\n\n'
        'No se han implementado las mejoras pendientes ni conectado OneDrive. '
        'El ZIP completo contiene contraseñas y datos reales, no está cifrado y no debe publicarse.\n',
        encoding='utf-8')
    (bundle / 'SHA256_PAQUETES.txt').write_text(
        '\n'.join(digest(p) + '  ' + p.name for p in [source_zip, private_zip]) + '\n', encoding='ascii')
    manifest(bundle, 'MecaPlan entrega completa privada')
    complete_zip = out / 'MecaPlan_Entrega_Completa_PRIVADA.zip'
    zip_tree(bundle, complete_zip)
    (out / 'SHA256_ENTREGA.txt').write_text(
        '\n'.join(digest(p) + '  ' + p.name for p in [complete_zip, source_zip, private_zip]) + '\n', encoding='ascii')
    write_json(out / 'RESULTADO_EMPAQUETADO.json', {
        'createdUtc': datetime.now(timezone.utc).isoformat(),
        'archives': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)}
                     for p in [complete_zip, source_zip, private_zip]],
        'sourceCredentialScan': 'No contiene las contraseñas iniciales conocidas ni .env reales',
        'database': summary,
    })
    print(json.dumps({'output': str(out), 'zipNames': [complete_zip.name, source_zip.name, private_zip.name],
                      'users': summary['users'], 'projects': len(summary['projects']),
                      'attachments': summary['referencedAttachments'], 'databaseIntegrity': 'ok'}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='Carpeta nueva de salida')
    parser.add_argument('--requirements', required=True, help='Markdown de requisitos original')
    parser.add_argument('--users', required=True, help='XLSX original de integrantes')
    parser.add_argument('--matrix', required=True, help='XLSX original de matriz')
    parser.add_argument('--credentials', required=True, help='XLSX privado de accesos iniciales')
    build(parser.parse_args())
