import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { E2ERun, GitInfo } from '../types'

// garage-kerja — mod Claude Code untuk repo Garage OS (Owner, 17 Nov 2026):
// 1. Panel "Garage · Kerja": branch & commit, perubahan belum di-commit, skill modul yang sudah dimuat, hasil E2E terakhir.
// 2. Penjaga skill: menolak Edit/Write file modul sebelum skill modulnya dimuat (aturan WAJIB di CLAUDE.md).
// 3. Penjaga rahasia: menolak git commit/push dan penulisan file yang memuat kode masuk/kunci rahasia.
// 4. /cek-event: menjalankan E2E event (lineup, sponsor, keuangan, hari-H, decision center) dan melaporkan hasilnya.

const PANE = 'garage-kerja'
const skills = atom({ plugin: 'garage-kerja', key: 'skills' } as const, [] as string[], { shape: 'skills-1' })
const git = atom({ plugin: 'garage-kerja', key: 'git' } as const, null as GitInfo | null, { shape: 'git-1' })
const blocked = atom({ plugin: 'garage-kerja', key: 'blocked' } as const, [] as string[], { shape: 'blocked-1' })
const IDLE: E2ERun = { state: 'idle', scope: '', progress: '', summary: 'Belum dijalankan di sesi ini.', failures: [], at: '' }
const e2e = atom({ plugin: 'garage-kerja', key: 'e2e' } as const, IDLE, { shape: 'e2e-1' })

// ─── Skill modul wajib (tabel indeks di CLAUDE.md) ───────────────────────────
const SKILL_RULES: Array<{ skill: string; test: RegExp }> = [
  { skill: 'garage-pos', test: /(^|\/)(pos|pos-|order|orders|receipt|struk|event-menu|bundle)|pos-view|cashier/i },
  { skill: 'garage-kas', test: /(cash|kas-|ledger|finance|petty|closing|setoran|sponsor)/i },
  { skill: 'garage-produksi', test: /(kitchen|production|produksi|print-job|notification)/i },
  { skill: 'garage-produk-wms', test: /(inventory|wms|hpp|recipe|resep|purchas|supplier|opname|stock)/i },
  { skill: 'garage-meja-menu', test: /(\/table-|table-selector|meja|app\/order\/|dine-in)/i },
  { skill: 'garage-member-cx', test: /(member|app\/invoice\/|\botp\b|-otp)/i },
  { skill: 'garage-approval', test: /(approval|decision)/i },
  { skill: 'garage-ai-mcp', test: /(\/mcp|owner-ai|\baya\b|aya-|agent-tool)/i },
  { skill: 'garage-partner-hub', test: /(partner|mitra)/i },
  { skill: 'garage-event-lineup', test: /(lineup|event-day|event-finance|gigs|event-master|EventControlNav)/i },
]

function requiredSkills(path: string): string[] {
  const rel = path.replace(/\\/g, '/')
  const at = rel.search(/(^|\/)(src|e2e)\//)
  if (at < 0) return []
  const inRepo = rel.slice(at).replace(/^\//, '')
  const out = SKILL_RULES.filter((r) => r.test.test(inRepo)).map((r) => r.skill)
  return out
}

// ─── Pola rahasia: hanya NAMA polanya yang pernah ditampilkan, nilainya tidak ───
const SECRET_PATTERNS: Array<{ name: string; test: RegExp }> = [
  { name: 'kode masuk panitia GIGS', test: /\bGIGS-[A-Z0-9]{4}-[A-Z0-9]{4}\b/ },
  { name: 'private key', test: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'token GitHub', test: /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}/ },
  { name: 'kunci AWS', test: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'kunci API (sk-…)', test: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/ },
  { name: 'kunci Google API', test: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: 'nilai rahasia di env',
    test: /\b(?:BETTER_AUTH_SECRET|DATABASE_URL|GEMINI_API_KEY|GARAGE_POS_API_KEY|AUTH_SECRET|JWT_SECRET)\s*=\s*["']?(?!\$|<|your|xxx|changeme|example|dummy|build-check)[^\s"']{12,}/i,
  },
]

function findSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter((p) => p.test.test(text)).map((p) => p.name)
}

async function repoRoot($: any): Promise<string | null> {
  const r = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { timeoutMs: 10_000 }).catch(() => null)
  return r && r.exitCode === 0 ? r.stdout.trim() : null
}

async function refreshGit($: any) {
  const root = await repoRoot($)
  if (!root) return
  const [branch, commit, status] = await Promise.all([
    $.process.run(['git', 'branch', '--show-current'], { cwd: root, timeoutMs: 10_000 }),
    $.process.run(['git', 'log', '-1', '--format=%h %s'], { cwd: root, timeoutMs: 10_000 }),
    $.process.run(['git', 'status', '--porcelain'], { cwd: root, timeoutMs: 15_000 }),
  ]).catch(() => [null, null, null])
  if (!branch || !commit || !status) return
  const dirty = status.stdout.split('\n').filter((l: string) => l.trim() && !l.includes('public/garage-uploads/')).length
  await update($, git, () => ({
    branch: branch.stdout.trim() || '(detached)',
    commit: commit.stdout.trim().slice(0, 80),
    dirty,
    checkedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
  }))
}

/** Isi yang akan ikut commit/push: perubahan terlacak + berkas baru (dibatasi ukurannya). */
async function pendingText($: any, root: string, isPush: boolean): Promise<Array<{ file: string; text: string }>> {
  const out: Array<{ file: string; text: string }> = []
  const diff = await $.process.run(['git', 'diff', 'HEAD', '--no-color', '--unified=0'], { cwd: root, timeoutMs: 30_000 }).catch(() => null)
  if (diff?.exitCode === 0) out.push(...splitDiff(diff.stdout))
  if (isPush) {
    const ahead = await $.process.run(['git', 'diff', '@{u}...HEAD', '--no-color', '--unified=0'], { cwd: root, timeoutMs: 30_000 }).catch(() => null)
    if (ahead?.exitCode === 0) out.push(...splitDiff(ahead.stdout))
  }
  const untracked = await $.process.run(['git', 'ls-files', '--others', '--exclude-standard'], { cwd: root, timeoutMs: 15_000 }).catch(() => null)
  for (const file of (untracked?.stdout ?? '').split('\n').filter(Boolean).slice(0, 200)) {
    const stat = await $.fs.stat(`${root}/${file}`).catch(() => null)
    if (!stat || (stat.size ?? 0) > 400_000) continue
    const text = await $.fs.read(`${root}/${file}`).catch(() => null)
    if (typeof text === 'string') out.push({ file, text })
  }
  return out
}

function splitDiff(diff: string): Array<{ file: string; text: string }> {
  const parts: Array<{ file: string; text: string }> = []
  let file = ''
  let added: string[] = []
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      if (file) parts.push({ file, text: added.join('\n') })
      file = line.replace(/^\+\+\+ (b\/)?/, '')
      added = []
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1))
    }
  }
  if (file) parts.push({ file, text: added.join('\n') })
  return parts
}

// ─── /cek-event ──────────────────────────────────────────────────────────────
const EVENT_SPECS = ['gigs-eo', 'gigs-website', 'decision-center']

async function runE2E($: any, all: boolean) {
  const current = await read($, e2e)
  if (current.state === 'running') return 'E2E masih berjalan. Lihat panel Garage · Kerja.'
  const root = await repoRoot($)
  if (!root) return 'Tidak menemukan repo git di sesi ini.'
  const argv = ['npx', 'playwright', 'test', ...(all ? [] : EVENT_SPECS), '--reporter=line', '--trace', 'off']
  // Sandbox cloud: browser bawaan Playwright repo tidak ada → pakai Chromium terpasang lewat config sementara.
  const cloud = await $.fs.stat('/opt/pw-browsers/chromium').catch(() => null)
  if (cloud) {
    const cfg = '/tmp/garage-kerja-pw.config.ts'
    await $.fs.write(
      cfg,
      `import base from "${root}/playwright.config";\nexport default { ...base, testDir: "${root}/e2e", outputDir: "${root}/.e2e-data/results", reporter: [["line"]], use: { ...base.use, channel: undefined, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } }, webServer: { ...(base.webServer as object), cwd: "${root}" } };\n`,
    )
    argv.splice(3, 0, '-c', cfg)
  }
  const scope = all ? 'semua alur (suite lengkap)' : 'alur event'
  await update($, e2e, (): E2ERun => ({ state: 'running', scope, progress: 'Menyiapkan server uji…', summary: '', failures: [], at: new Date().toLocaleTimeString('id-ID') }))
  $.ui.status(`E2E ${scope}: berjalan…`)
  void (async () => {
    const failures: string[] = []
    let summary = ''
    let tail = ''
    try {
      for await (const piece of $.process.spawn({ argv, cwd: root, env: { E2E_BROWSER_CHANNEL: '' } })) {
        if (!('text' in piece)) continue
        tail = (tail + piece.text).slice(-4000)
        for (const line of piece.text.split('\n')) {
          const step = line.match(/^\[(\d+)\/(\d+)\]\s.*›\s(.*)$/)
          if (step) await update($, e2e, (s) => ({ ...s, progress: `${step[1]}/${step[2]} · ${step[3].slice(0, 70)}` }))
          const fail = line.match(/^\s+\d+\)\s\[[^\]]+\]\s›\s(.*)$/)
          if (fail && !failures.includes(fail[1].trim())) failures.push(fail[1].trim().slice(0, 140))
          const sum = line.match(/^\s+(\d+ (?:passed|failed|flaky|skipped).*)$/)
          if (sum) summary = summary ? `${summary} · ${sum[1].trim()}` : sum[1].trim()
        }
      }
    } catch (error) {
      summary = `Gagal menjalankan: ${error instanceof Error ? error.message.slice(0, 120) : 'tidak diketahui'}`
    }
    const ok = failures.length === 0 && /passed/.test(summary) && !/failed/.test(summary)
    if (!summary) summary = tail.includes('webServer') ? 'Server uji tidak bisa dijalankan (cek log).' : 'Selesai tanpa ringkasan.'
    await update($, e2e, (s): E2ERun => ({ ...s, state: ok ? 'passed' : 'failed', progress: '', summary, failures, at: new Date().toLocaleTimeString('id-ID') }))
    $.ui.status(undefined)
    const text = `E2E ${scope}: ${ok ? 'LULUS' : 'ADA YANG GAGAL'} — ${summary}`
    $.ui.toast(text)
    void $.ui.notify(text, { title: 'Garage · E2E' }).catch(() => null)
    await $.store.set('lastE2E', { ...(await read($, e2e)) }).catch(() => null)
  })()
  return `E2E ${scope} dimulai (±5–20 menit). Progres & hasil tampil di panel Garage · Kerja.`
}

// Penjaga skill + rahasia untuk Edit/Write.
async function guardWrite($: any, path: string, text: string, next: () => Promise<any>) {
  const secrets = findSecrets(text)
  if (secrets.length) {
    return { deny: `garage-kerja: isi yang ditulis ke ${path} memuat ${secrets.join(', ')}. Jangan simpan kode/kunci rahasia di repo; pakai env/secret.` }
  }
  const need = requiredSkills(path)
  if (need.length) {
    const loaded = await read($, skills)
    const missing = need.filter((s) => !loaded.includes(s))
    if (missing.length) {
      await update($, blocked, (list) => [...list, `${missing.join(', ')} → ${path.split('/').slice(-2).join('/')}`].slice(-5))
      return {
        deny: `garage-kerja: muat skill ${missing.map((s) => `\`${s}\``).join(' + ')} dulu sebelum mengubah ${path} (CLAUDE.md: WAJIB). Pakai Skill tool atau baca .claude/skills/<nama>/SKILL.md, lalu ulangi.`,
      }
    }
  }
  const ran = await next()
  void refreshGit($)
  return ran
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'garage-panel', description: 'Buka panel Garage · Kerja (git, skill, E2E)' })
    await $.command.register({ name: 'cek-event', description: 'Jalankan E2E event Garage (tambah "semua" untuk suite lengkap)' })
    const last = (await $.store.get('lastE2E').catch(() => null)) as E2ERun | null
    if (last && last.state !== 'running') await update($, e2e, () => ({ ...last, summary: `${last.summary} (sesi sebelumnya)` }))
    void refreshGit($)
    void $.ui.open({ id: PANE, title: 'Garage · Kerja' })
    return started
  })

  on('command.run', { command: 'garage-panel' }, async ($) => {
    await refreshGit($)
    await $.ui.open({ id: PANE, title: 'Garage · Kerja' })
    return { text: 'Panel Garage · Kerja dibuka.' }
  })

  on('command.run', { command: 'cek-event' }, async ($, e) => {
    const all = /\bsemua\b|\ball\b/i.test(e.args)
    await $.ui.open({ id: PANE, title: 'Garage · Kerja' })
    return { text: await runE2E($, all) }
  })

  // Catat skill yang dimuat (Skill tool, atau membaca SKILL.md langsung).
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.deny) await update($, skills, (list) => (list.includes(e.skill) ? list : [...list, e.skill]))
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    const name = String(e.file_path ?? '').match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1]
    if (name && !ran.deny) await update($, skills, (list) => (list.includes(name) ? list : [...list, name]))
    return ran
  }).catch(($, e, next) => next(e))

  // Penjaga gagal sendiri → alat tetap jalan (tidak mengunci kerja), status bar memberi tahu.
  on('tool.call', { tool: 'Edit' }, ($, e, next) => guardWrite($, e.file_path, e.new_string, () => next(e))).catch(($, e, next) => {
    $.ui.status('garage-kerja: penjaga Edit error, dilewati')
    return next(e)
  })
  on('tool.call', { tool: 'Write' }, ($, e, next) => guardWrite($, e.file_path, e.content, () => next(e))).catch(($, e, next) => {
    $.ui.status('garage-kerja: penjaga Write error, dilewati')
    return next(e)
  })

  // Penjaga rahasia saat git commit / push.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = String(e.command ?? '')
    const inline = findSecrets(cmd.replace(/BETTER_AUTH_SECRET=build-check-dummy-secret-[0-9a-f]+/g, ''))
    if (/\bgit\s+(commit|push)\b/.test(cmd)) {
      const root = await repoRoot($)
      if (root) {
        const hits: string[] = []
        for (const part of await pendingText($, root, /\bgit\s+push\b/.test(cmd))) {
          const found = findSecrets(part.text)
          if (found.length) hits.push(`${part.file} (${found.join(', ')})`)
        }
        if (hits.length || inline.length) {
          return {
            deny: `garage-kerja: commit/push ditahan — terdeteksi rahasia di ${[...hits, ...(inline.length ? [`perintah (${inline.join(', ')})`] : [])].slice(0, 8).join('; ')}. Hapus nilainya (pakai env/secret), lalu ulangi.`,
          }
        }
      }
    }
    const ran = await next(e)
    if (/\bgit\s/.test(cmd)) void refreshGit($)
    return ran
  }).catch(($, e, next) => {
    $.ui.status('garage-kerja: penjaga commit error, dilewati')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [g, loaded, run, guards] = await Promise.all([read($, git), read($, skills), read($, e2e), read($, blocked)])
    const runColor = run.state === 'passed' ? 'green' : run.state === 'failed' ? 'red' : run.state === 'running' ? 'yellow' : undefined
    const runLabel = run.state === 'passed' ? 'LULUS' : run.state === 'failed' ? 'GAGAL' : run.state === 'running' ? 'BERJALAN' : 'BELUM'
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Git</Text>
          {g ? (
            <>
              <Text>Branch: {g.branch}</Text>
              <Text>Terakhir: {g.commit}</Text>
              <Text color={g.dirty ? 'yellow' : 'green'}>{g.dirty ? `${g.dirty} berkas belum di-commit` : 'Bersih, semua sudah di-commit'}</Text>
              <Text dimColor>Dicek {g.checkedAt}</Text>
            </>
          ) : (
            <Text dimColor>Memeriksa…</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold>
            E2E <Text color={runColor}>{runLabel}</Text>
            {run.scope ? <Text dimColor> · {run.scope}</Text> : null}
          </Text>
          {run.progress ? <Text>{run.progress}</Text> : null}
          {run.summary ? <Text>{run.summary}</Text> : null}
          {run.failures.slice(0, 5).map((f) => (
            <Text color="red">✗ {f}</Text>
          ))}
          {run.at ? <Text dimColor>{run.state === 'running' ? 'Mulai' : 'Selesai'} {run.at}</Text> : null}
          <Text dimColor>/cek-event · /cek-event semua</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>Skill modul dimuat ({loaded.length})</Text>
          <Text>{loaded.length ? loaded.join(', ') : 'Belum ada di sesi ini.'}</Text>
          {guards.length ? <Text bold>Ditahan penjaga skill</Text> : null}
          {guards.map((b) => (
            <Text color="yellow">• {b}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
