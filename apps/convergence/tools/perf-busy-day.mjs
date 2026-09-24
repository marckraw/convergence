#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const HELP = `Usage: node apps/convergence/tools/perf-busy-day.mjs [--node] [--db path] [--open id|biggest] [--scenario busy|open|stream-into-open] [--sessions N] [--streaming K] [--minutes M] [--loom] [--out file.json]
Defaults: 12 sessions, 6 streaming, 3 minutes, Loom open. Fake provider: one delta/30ms; burst: 60 keys/80ms.
Electron measures a separate profiling renderer build; --node measures main only (renderer.measured=false).
No installed-app bootstrap, account data, real providers or network services are used.`
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(HELP)
  process.exit(0)
}
const params = {
  db: null,
  open: 'biggest',
  scenario: 'busy',
  sessions: 12,
  streaming: 6,
  minutes: 3,
  loom: true,
  tokenMs: 30,
  keys: 60,
  keyMs: 80,
}
let underNode = false
let output = resolve('perf-busy-day.json')
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--node') underNode = true
  else if (arg === '--db') params.db = resolve(args[++i])
  else if (arg === '--open') params.open = args[++i]
  else if (arg === '--scenario') params.scenario = args[++i]
  else if (arg === '--loom') params.loom = true
  else if (arg === '--out') output = resolve(args[++i])
  else if (['--sessions', '--streaming', '--minutes'].includes(arg))
    params[arg.slice(2)] = Number(args[++i])
  else throw new Error(`Unknown argument: ${arg}\n${HELP}`)
}
if (!['busy', 'open', 'stream-into-open'].includes(params.scenario))
  throw new Error('Unknown scenario: ' + params.scenario)
if (
  !Number.isInteger(params.sessions) ||
  params.sessions < 1 ||
  !Number.isInteger(params.streaming) ||
  params.streaming < 0 ||
  params.streaming > params.sessions ||
  !Number.isFinite(params.minutes) ||
  params.minutes < 0.1
)
  throw new Error(
    'Require sessions >= 1, 0 <= streaming <= sessions, minutes >= 0.1',
  )
if (params.db && existsSync(output)) {
  const inputStat = statSync(params.db),
    outputStat = statSync(output)
  if (inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)
    throw new Error('--out must not overwrite the input database')
}
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
// Under the workspace so native packages resolve normally. Removed even after failure.
mkdirSync(join(appRoot, 'out'), { recursive: true })
const temp = mkdtempSync(join(appRoot, 'out', 'perf-'))
const source = (path) => JSON.stringify(join(appRoot, path))
const write = (name, content) => {
  const path = join(temp, name)
  writeFileSync(path, content)
  return path
}
const childEnv = {
  ...process.env,
  CONVERGENCE_PERF: '1',
  CONVERGENCE_USER_DATA_DIR: join(temp, 'user-data'),
}
// Ambient provider configuration never enters the isolated child.
for (const key of Object.keys(childEnv))
  if (/CODEX|CLAUDE|CURSOR|TOKEN|API_KEY|SECRET|OAUTH/.test(key))
    delete childEnv[key]
delete childEnv.ELECTRON_RUN_AS_NODE

const emptyRenderer = {
  measured: false,
  elapsedSeconds: 0,
  inputDelaySamples: 0,
  reason: 'Node mode has no Chromium renderer',
  keystrokeToPaint: { samples: 0, p50: 0, p95: 0 },
  longTasks: { count: 0, totalMs: 0 },
  inputDelayP95: 0,
  commits: Object.fromEntries(
    ['composer', 'sidebar', 'wave-panel', 'transcript'].map((id) => [
      id,
      {
        count: 0,
        perMinute: 0,
        totalMs: 0,
        burstCount: 0,
        commitsPerSessionsIdentity: 0,
      },
    ]),
  ),
  sessionsIdentityChanges: 0,
}

async function run(command, argv, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, argv, {
      cwd: repoRoot,
      env: childEnv,
      stdio: ['ignore', 'inherit', 'inherit'],
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${command} exited ${code ?? signal}`)),
    )
  })
}

try {
  mkdirSync(join(temp, 'repo', '.git'), { recursive: true })
  const electronShim = write(
    'electron-shim.mjs',
    `
    import { EventEmitter } from 'node:events'
    export const app = Object.assign(new EventEmitter(), { isPackaged: false, getVersion: () => 'perf', getPath: () => ${JSON.stringify(temp)} })
    export const handlers = new Map()
    export const ipcMain = { handle: (name, fn) => handlers.set(name, fn), removeHandler: (name) => handlers.delete(name) }
    export const BrowserWindow = { getAllWindows: () => globalThis.perfWindows }
    export const dialog = {}; export const shell = {}; export const nativeTheme = {}; export const safeStorage = {}
  `,
  )
  // The renderer is the real app entry + a report-only export, using its existing router.
  const rendererEntry = write(
    'renderer-entry.ts',
    `
    const logError = console.error
    console.error = (...args) => logError(...args.map((arg) => arg instanceof Error ? arg.stack : arg))
    import(${source('src/app/index.tsx')})
    import { conversationPaintSamples, rendererPerfReport } from ${source('src/shared/lib/usePerfProbe.ts')}
    Object.assign(window, { readPerfReport: rendererPerfReport, conversationPaintSamples })
  `,
  )
  let rendererBuild = null
  if (!underNode) {
    // Load the checked-in conditional alias; envDir:false prevents Vite reading .env files.
    const configBundle = join(temp, 'vite-config.mjs')
    await build({
      entryPoints: [join(appRoot, 'electron.vite.config.ts')],
      outfile: configBundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      define: { __dirname: JSON.stringify(appRoot) },
      logLevel: 'warning',
    })
    const previousFlag = process.env.CONVERGENCE_PERF
    process.env.CONVERGENCE_PERF = '1'
    const config = (await import(configBundle)).default
    if (previousFlag === undefined) delete process.env.CONVERGENCE_PERF
    else process.env.CONVERGENCE_PERF = previousFlag
    const { build: viteBuild } = await import('vite')
    const previousCwd = process.cwd()
    process.chdir(join(appRoot, 'src'))
    try {
      await viteBuild({
        ...config.renderer,
        configFile: false,
        envDir: false,
        root: join(appRoot, 'src'),
        plugins: [
          ...config.renderer.plugins,
          {
            name: 'perf-report-entry',
            transformIndexHtml: {
              order: 'pre',
              handler: (html) => html.replace('./app/index.tsx', rendererEntry),
            },
          },
        ],
        base: './',
        logLevel: 'warn',
        build: {
          ...config.renderer.build,
          minify: false,
          sourcemap: true,
          outDir: join(temp, 'renderer'),
        },
      })
    } finally {
      process.chdir(previousCwd)
    }
    rendererBuild = join(temp, 'renderer', 'index.html')
    await build({
      entryPoints: [join(appRoot, 'electron/preload/index.ts')],
      outfile: join(temp, 'preload.cjs'),
      bundle: true,
      platform: 'node',
      external: ['electron'],
      logLevel: 'warning',
    })
  }
  const entry = write(
    'scenario.ts',
    String.raw`
import { app, BrowserWindow, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { getDatabase, closeDatabase } from ${source('electron/backend/database/database.ts')}
import { ProjectService } from ${source('electron/backend/project/project.service.ts')}
import { percentile } from ${source('src/shared/lib/perf-marks.pure.ts')}
import { SessionService } from ${source('electron/backend/session/session.service.ts')}
import { ProviderRegistry } from ${source('electron/backend/provider/provider-registry.ts')}
import { LocalExecutionHost } from ${source('electron/backend/provider/execution-host/local-execution-host.ts')}
import { ProviderSessionEmitter } from ${source('electron/backend/provider/provider-session.emitter.ts')}
import { createPerfProbe } from ${source('electron/backend/perf/perf-probe.service.ts')}
import { CrewService } from ${source('electron/backend/crew/crew.service.ts')}
import { WorkLedgerService } from ${source('electron/backend/work-ledger/work-ledger.service.ts')}
import { TrackerWatcherService } from ${source('electron/backend/tracker/tracker-watcher.service.ts')}
import { trackerIssue } from ${source('electron/backend/tracker/linear-tracker.fixture.ts')}
import { RelayService } from ${source('electron/backend/relay/relay.service.ts')}
import { CrewHailService } from ${source('electron/backend/relay/crew-hail.service.ts')}
import { RelayEngine } from ${source('electron/backend/relay/relay.engine.ts')}
import { startRelayStallClock } from ${source('electron/main/relay-stall-clock.ts')}
import { registerIpcHandlers } from ${source('electron/main/ipc.ts')}
import { registerWorkLedgerIpcHandlers, broadcastWorkLedger } from ${source('electron/backend/work-ledger/work-ledger.ipc.ts')}

process.setSourceMapsEnabled?.(true)
const params = ${JSON.stringify(params)}
const underNode = ${underNode}
const temp = ${JSON.stringify(temp)}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []
const descriptors = { id: 'test-provider', name: 'Test Provider', vendorLabel: 'Test', kind: 'conversation', supportsContinuation: false, supportsConversationReset: false, defaultModelId: 'test-model', modelOptions: [{id: 'test-model', label: 'Test Model', defaultEffort: null, effortOptions: []}], attachments: { supportsImage: false, supportsPdf: false, supportsText: false, maxImageBytes: 0, maxPdfBytes: 0, maxTextBytes: 0, maxTotalBytes: 0 }, midRunInput: { supportsAnswer: false, supportsNativeFollowUp: false, supportsAppQueuedFollowUp: true, supportsSteer: false, supportsInterrupt: false, defaultRunningMode: 'follow-up' } }
// Same listener-array + ProviderSessionEmitter pattern as createTestProvider in session.service.test.ts.
const stops = []
let emittedDeltas = 0
const provider = { id: 'test-provider', name: 'Test Provider', supportsContinuation: false, describe: async () => descriptors, start(config) {
  const listeners = []
  const emitter = new ProviderSessionEmitter({ providerId: 'test-provider', emitDelta: (delta) => listeners.forEach((fn) => fn(delta)) })
  let text = ''
  let item
  const timer = setInterval(() => {
    if (!item) { emitter.patchSession({ status: 'running', activity: 'streaming' }); emitter.addUserMessage({ text: config.initialMessage }); item = emitter.addAssistantMessage({ text: '', state: 'streaming' }) }
    text += ' token'
    emittedDeltas++
    emitter.patchMessage(item, { text, state: 'streaming' })
    emitter.recordEvidence({ kind: 'task.changed', taskId: 'perf-task', at: new Date().toISOString(), patch: { status: 'running', description: 'Synthetic stream' } })
  }, 30)
  const stop = () => clearInterval(timer)
  stops.push(stop)
  return { onDelta: (fn) => listeners.push(fn), onStatusChange() {}, onAttentionChange() {}, onContinuationToken() {}, onContextWindowChange() {}, onActivityChange() {}, sendMessage() {}, approve() {}, deny() {}, stop }
} }
async function main() {
  if (!underNode) { app.setPath('userData', temp + '/user-data'); await app.whenReady() }
  let copy
  if (params.db) {
    copy = temp + '/input-copy.db'
    const input = new Database(params.db, { readonly: true, fileMustExist: true })
    try { input.prepare('VACUUM INTO ?').run(copy) } finally { input.close() }
  }
  const db = getDatabase(copy)
  const registry = new ProviderRegistry(); registry.register(provider)
  const sessions = new SessionService(db, new LocalExecutionHost(registry), temp + '/global')
  const crews = new CrewService(db)
  let rows, project, crew
  const realProjects = new ProjectService(db)
  if (params.db) {
    rows = db.prepare("SELECT sessions.id, sessions.project_id, sessions.provider_id, COUNT(items.id) AS itemCount FROM sessions LEFT JOIN session_conversation_items items ON items.session_id = sessions.id WHERE sessions.primary_surface = 'conversation' GROUP BY sessions.id ORDER BY itemCount DESC, sessions.id").all()
    if (!rows.length) throw new Error('The copy has no conversations')
    for (const { provider_id: id } of db.prepare('SELECT DISTINCT provider_id FROM sessions').all()) {
      registry.register({ ...provider, id, describe: async () => ({ ...descriptors, id }) })
    }
    project = realProjects.getById(rows[0].project_id) ?? realProjects.getAll()[0] ?? null
    crew = crews.list()[0] ?? null
  } else {
    db.prepare("INSERT INTO projects (id, name, repository_path) VALUES ('perf-project', 'Perf fixture', ?)").run(temp + '/repo')
    project = realProjects.getById('perf-project')
    rows = Array.from({length: params.sessions}, (_, i) => sessions.create({ projectId: project.id, workspaceId: null, providerId: provider.id, model: null, effort: null, name: 'Busy day ' + (i + 1) }))
    crew = crews.create({ name: 'Perf Loom', sessionIds: rows.map((row) => row.id) })
    crews.setTrackerBinding(crew.id, { projectId: 'fake-tracker-project' })
  }
  const target = params.open === 'biggest' ? rows[0] : rows.find((row) => row.id === params.open)
  if (!target) throw new Error('Conversation not found: ' + params.open)
  project = realProjects.getById(target.project_id ?? project?.id) ?? project
  const small = [...rows].reverse().find((row) => row.id !== target.id)
  if (params.scenario === 'open' && !small) throw new Error('Open scenario needs a second conversation')
  const streamingRows = params.scenario === 'open' ? [] : params.scenario === 'stream-into-open'
    ? [target, ...rows.filter((row) => row.id !== target.id).slice(0, params.streaming)]
    : rows.slice(0, params.streaming)
  if (params.scenario === 'stream-into-open' && streamingRows.length !== params.streaming + 1)
    throw new Error('stream-into-open needs the target plus K other conversations')
  if (params.db) {
    // Only the disposable copy is rebound to the in-process fake provider.
    for (const row of streamingRows) db.prepare("UPDATE sessions SET provider_id = 'test-provider', execution_host = 'local', work_address = NULL, working_directory = ?, continuation_token = NULL WHERE id = ?").run(temp + '/repo', row.id)
  }
  const ledger = new WorkLedgerService(db)
  const probe = createPerfProbe(true)
  probe.observeConversations(); probe.wrapDatabase(db); probe.wrapSummary(sessions); probe.wrapTimers()
  let trackerReads = 0, snapshotReads = 0
  const watcher = new TrackerWatcherService({ crews, ledger, resolveKey: async () => 'synthetic-fixture', createAdapter: () => ({
    probe: async () => ({ ok: true, issues: 40, projectName: 'Fake' }), resolveProject: async () => ({ kind: 'not-found' }), readIssueBodies: async () => new Map(), listOutsideIssues: async () => ({ issues: [], more: false }),
    listLabeledIssues: async () => { trackerReads++; return Array.from({length: 40}, (_, i) => trackerIssue({ id: 'issue-' + i, identifier: 'PERF-' + i, title: 'Synthetic issue ' + i, wave: 'busy-day', seat: 'astra', updatedAt: new Date().toISOString(), summary: 'Tick ' + trackerReads })) },
  }), broadcast: broadcastWorkLedger })
  const settings = { defaultProviderId: null, defaultModelId: null, defaultEffortId: null, namingModelByProvider: {}, extractionModelByProvider: {}, commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false }, executionHostEndpoints: [], notifications: { enabled: false, events: {}, suppressWhenFocused: true }, onboarding: { notificationsCardDismissed: true }, updates: { backgroundCheckEnabled: false }, debugLogging: { enabled: false }, lanes: { root: null }, contextAlert: { enabled: false, percent: 75, tokens: 400000 }, piModelVisibility: { additionalModelIds: [] }, favoriteModels: { items: [] } }
  // Unrelated app services are explicit no-I/O fakes. Only session and tracker paths are measured as product work.
  const inert = new Proxy({}, { get: () => async () => [] })
  const appSettings = new Proxy({ getAppSettings: async () => settings, filterProviderDescriptors: (descriptors) => descriptors, resolveSessionDefaults: async (input) => input, getPiModelVisibility: () => settings.piModelVisibility, getNamingModelByProvider: () => ({}), sweepOrphanedExecutionHostCredentials: async () => [] }, { get: (target, key) => target[key] ?? (() => null) })
  const projects = params.db ? realProjects : { getActive: () => project, getAll: () => [project], getById: () => project }
  const state = { get: (key) => key.includes('project') ? project?.id ?? null : null, set() {} }
  const pr = { start() {}, stop() {}, refreshForSession: async () => null, getForSession: async () => null, listByProjectId: async () => [], listGlobal: async () => [] }
  const registered = new Set()
  const actualHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (name, handler) => { registered.add(name); actualHandle(name, handler) }
  registerIpcHandlers(projects, inert, state, inert, inert, inert, pr, sessions, registry, inert, inert, inert, appSettings, inert, inert, inert, inert, inert, crews, inert, undefined, undefined, undefined, { codex: { getQuota: async () => null } })
  registerWorkLedgerIpcHandlers({ snapshot: (id) => { snapshotReads++; return watcher.snapshot(id) } })
  ipcMain.handle('perf:report', (_event, payload) => probe.report(payload))
  // Fill only unrelated read doors in the real preload; they never access disk or network.
  const replacements = {
    'providerAccounts:health': () => ({ accounts: [], settingsWarnings: [] }), 'providerAccounts:loginAttempt': () => null,
    'crew:list': () => crews.list(), 'relay:list': () => [], 'project:getActive': () => project,
    'notifications:getPrefs': () => settings.notifications, 'tracker:outside': (_e, id) => watcher.outsideSnapshot(id),
    'provider:getStatuses': () => [], 'provider:getAllAvailable': () => [],
  }
  for (const [name, fn] of Object.entries(replacements)) { if (registered.has(name)) ipcMain.removeHandler(name); ipcMain.handle(name, fn) }
  const preloadChannels = ${JSON.stringify([...new Set([...readFileSync(join(appRoot, 'electron/preload/index.ts'), 'utf8').matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)].map((x) => x[1]))])}
  for (const channel of preloadChannels) if (!registered.has(channel)) ipcMain.handle(channel, () => [])
  let renderer = ${JSON.stringify(emptyRenderer)}
  let window
  if (underNode) {
    globalThis.perfWindows = [0, 1].map(() => ({ isDestroyed: () => false, webContents: { send() {} } }))
    for (const win of globalThis.perfWindows) probe.wrapSend(win.webContents)
  } else {
    window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false, preload: temp + '/preload.cjs', sandbox: false, contextIsolation: true } })
    const second = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
    for (const win of [window, second]) probe.wrapSend(win.webContents)
    window.webContents.on('console-message', (event) => { if (event.level === 'error') { errors.push(event.message); console.error('[renderer]', event.message) } })
    await window.loadFile(${JSON.stringify(rendererBuild)}, { hash: '/code/sessions/' + target.id })
    // Electron CPU percentages need an earlier sample to establish their baseline.
    app.getAppMetrics()
  }
  const stall = startRelayStallClock(new RelayEngine({ relays: new RelayService(db), crews, sessions, accounts: inert, hails: new CrewHailService(db) }))
  const watch = watcher.start()
  const paintSamples = async () => window.webContents.executeJavaScript('window.conversationPaintSamples()')
  const openConversation = async (id) => {
    if (underNode) { sessions.getConversation(id); return }
    const before = (await paintSamples()).length
    await window.webContents.executeJavaScript('location.hash = ' + JSON.stringify('#/code/sessions/' + id))
    for (let attempt = 0; attempt < 300; attempt++) {
      if ((await paintSamples()).slice(before).some((sample) => sample.sessionId === id)) return
      await wait(100)
    }
    throw new Error('Conversation first paint timed out: ' + id)
  }
  if (!underNode && params.scenario !== 'busy') {
    let mounted = false
    for (let attempt = 0; attempt < 300; attempt++) {
      mounted = await window.webContents.executeJavaScript('typeof window.conversationPaintSamples === "function" && window.conversationPaintSamples().some(s => s.sessionId === ' + JSON.stringify(target.id) + ')')
      if (mounted) break
      await wait(100)
    }
    if (!mounted) throw new Error('Runner did not open the target: ' + errors.join('; '))
  } else if (params.scenario === 'stream-into-open') sessions.getConversation(target.id)
  const openRuns = []
  if (params.scenario === 'open') {
    for (let iteration = 0; iteration < 5; iteration++) {
      await openConversation(small.id)
      probe.flushPayloadSizes()
      const before = probe.conversationReads.length
      await openConversation(target.id)
      // This await has observed the target's paint (or completed the Node read).
      // Both conversation reply and snapshot send sizing are outside that span.
      probe.flushPayloadSizes()
      const sample = probe.conversationReads.slice(before).find((sample) => sample.sessionId === target.id)
      if (!sample) throw new Error('Missing getConversation timing')
      const paint = underNode ? 0 : (await paintSamples()).filter((sample) => sample.sessionId === target.id).at(-1).ms
      openRuns.push({ ...sample, firstPaintMs: paint })
    }
  }
  for (const row of streamingRows) await sessions.start(row.id, { text: 'Run synthetic busy day' })
  const start = performance.now()
  if (underNode) { if (crew) { watcher.snapshot(crew.id); snapshotReads++ } }
  else if (params.scenario !== 'open') {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      ready = await window.webContents.executeJavaScript('!!document.querySelector("textarea")')
      if (ready) break
      await wait(100)
    }
    if (ready) {
      ready = await window.webContents.executeJavaScript('(() => { const input = document.querySelector("textarea"); input?.focus(); return !!input })()')
      for (let key = 0; ready && key < params.keys; key++) {
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' })
        window.webContents.sendInputEvent({ type: 'char', keyCode: 'a' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' })
        await wait(params.keyMs)
      }
    } else renderer.reason = 'Full renderer did not mount a composer within 5 seconds: ' + errors.join('; ')
  }
  if (params.scenario !== 'open') await wait(Math.max(0, params.minutes * 60000 - (performance.now() - start)))
  if (!underNode) {
    const measured = await window.webContents.executeJavaScript('typeof window.readPerfReport === "function" ? (() => { try { return window.readPerfReport() } catch (e) { return { error: e.stack } } })() : null')
    if (measured?.error) errors.push(measured.error)
    if (measured && !measured.error && (measured.measured || params.scenario === 'open')) {
      const joined = await window.webContents.executeJavaScript('window.electronAPI.perf.report(window.readPerfReport())')
      renderer = joined.renderer
    }
    else renderer.reason = 'Headless full-app mount did not retain a working composer; R3 requires a user-driven sandbox. ' + errors.join('; ')
  }
  const distribution = (key) => ({ samples: openRuns.length, p50: percentile(openRuns.map((run) => run[key]), 0.5), p95: percentile(openRuns.map((run) => run[key]), 0.95) })
  const opening = params.scenario === 'open' ? {
    targetId: target.id, runs: openRuns, select: distribution('selectMs'), parse: distribution('parseMs'),
    replyBytes: openRuns[0].replyBytes, replySize: distribution('replyBytes'),
    firstPaint: { ...distribution('firstPaintMs'), measured: !underNode },
    transport: 'V8-serialized conversation items (snapshot payload on the current renderer open path)',
  } : undefined
  const processes = underNode ? [{ type: 'Browser', cpuPercent: 0, workingSetKb: 0, measured: false }]
    : app.getAppMetrics().map((metric) => ({ pid: metric.pid, type: metric.type, cpuPercent: metric.cpu.percentCPUUsage, workingSetKb: metric.memory.workingSetSize, measured: true }))
  const report = { open: opening, processes, schemaVersion: 1, parameters: params, machine: { model: process.platform === 'darwin' ? execFileSync('/usr/sbin/sysctl', ['-n', 'hw.model'], {encoding:'utf8'}).trim() : os.cpus()[0]?.model, os: os.release(), macOS: process.platform === 'darwin' ? execFileSync('/usr/bin/sw_vers', ['-productVersion'], {encoding:'utf8'}).trim() : null, node: process.versions.node, electron: process.versions.electron ?? null, chromium: process.versions.chrome ?? null }, build: underNode ? 'Node main-only' : 'runner Vite production renderer with conditional react-dom/profiling alias', scenario: { name: params.scenario, targetId: target.id, streamingIds: streamingRows.map(row => row.id), emittedDeltas, trackerReads, snapshotReads, windows: 2, rendererErrors: errors }, ...probe.report(renderer) }
  stops.forEach((stop) => stop()); watch.stop(); stall.stop(); probe.dispose()
  await sessions.disposeAllForQuit(); closeDatabase()
  writeFileSync(${JSON.stringify(output)}, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  if (!underNode) { for (const win of BrowserWindow.getAllWindows()) win.destroy(); app.quit() }
}
main().catch((error) => { console.error(error); if (!underNode) app.exit(1); else process.exitCode = 1 })
`,
  )
  await build({
    entryPoints: [entry],
    outfile: join(temp, 'scenario.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: 'inline',
    packages: 'external',
    alias: {
      '@convergence/execution-host-client': createRequire(
        import.meta.url,
      ).resolve('@convergence/execution-host-client'),
      ...(underNode ? { electron: electronShim } : {}),
    },
    logLevel: 'warning',
  })
  if (!underNode)
    await run(
      join(repoRoot, 'node_modules/.bin/electron-rebuild'),
      [
        '-f',
        '-o',
        'better-sqlite3',
        '-v',
        JSON.parse(
          readFileSync(
            join(repoRoot, 'node_modules/electron/package.json'),
            'utf8',
          ),
        ).version,
      ],
      { cwd: appRoot },
    )
  await run(
    underNode ? process.execPath : join(repoRoot, 'node_modules/.bin/electron'),
    ['--enable-source-maps', join(temp, 'scenario.cjs')],
  )
} finally {
  if (!underNode) await run('npm', ['rebuild', 'better-sqlite3'])
  rmSync(temp, { recursive: true, force: true })
}
