#!/usr/bin/env node
/**
 * verify-project —— 知先 PriorKnow 的发布前检查（11 项）
 *
 * 用法：
 *   node skills/verify-project/verify.mjs
 *   WEB_URL=… API_URL=… node skills/verify-project/verify.mjs
 *
 * 输出：逐项 `[编号] PASS|FAIL  项目名 —— 证据`，末尾一行合计。
 * 退出码：全 PASS 为 0，有 FAIL 为 1（「命令失败就停」的地方直接能用）。
 *
 * 🔴 这个脚本只做「跑命令 + 判 PASS/FAIL」，不是流水线：
 *    不挂 hook、不自动部署、不改任何线上数据（探针任务自己建自己删）。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WEB_URL = (process.env.WEB_URL ?? 'https://priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com/').replace(/\/+$/, '')
const API_URL = (process.env.API_URL ?? 'https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api').replace(/\/+$/, '')

/** 探针账号：脚本在它名下建一条、改一次、删掉。绝不碰真实账号。 */
const PROBE_USER = 'verify-project'
const TIMEOUT_MS = 25_000

const results = []

function record(id, name, pass, evidence, hint) {
  results.push({ id, name, pass, evidence, hint })
}

/** 跑一条 shell 命令，带回 stdout / stderr / 退出码 */
function sh(command, cwd = ROOT) {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: 180_000 })
  return {
    code: r.status === null ? -1 : r.status,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? '').trim(),
  }
}

/** 递归收集文本文件 */
function walk(dir, exts, skip = ['node_modules', 'dist', '.git']) {
  const found = []
  if (!existsSync(dir)) return found
  for (const name of readdirSync(dir)) {
    if (skip.includes(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) found.push(...walk(full, exts, skip))
    else if (exts.includes(extname(full))) found.push(full)
  }
  return found
}

/** 一次 HTTP 调用，永不抛异常（失败也变成一条可读的证据） */
async function http(method, url, { headers = {}, body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 不是 JSON —— 留着原文当证据，这本身就是结论 */
    }
    return { status: res.status, headers: res.headers, text, json, error: null }
  } catch (err) {
    return { status: 0, headers: new Headers(), text: '', json: null, error: err }
  }
}

/** 把响应体压成一行证据 */
function brief(res) {
  if (res.error) return `请求失败：${res.error.message ?? res.error}`
  const t = res.text.replace(/\s+/g, ' ').trim()
  return `${res.status} ${t.length > 160 ? `${t.slice(0, 160)}…` : t}`
}

// ─────────────────────────────────────────────────────────────
// A 组 · 本地
// ─────────────────────────────────────────────────────────────

async function a1_build() {
  const r = sh('npm run build', join(ROOT, 'app'))
  const distIndex = join(ROOT, 'app/dist/index.html')
  const ok = r.code === 0 && existsSync(distIndex)
  const assets = ok
    ? readFileSync(distIndex, 'utf8').match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '(未找到 js)'
    : ''
  record(
    'A1',
    '构建通过',
    ok,
    ok ? `tsc + vite 均无报错，dist/index.html 存在（${assets}）` : `退出码 ${r.code}：${(r.err || r.out).split('\n').slice(-3).join(' / ')}`,
    'cd app && npm run build 看第一条报错；类型错不会让 dev 起不来，只在出包时炸',
  )
}

async function a2_no_dev_copy() {
  const dir = join(ROOT, 'app/dist')
  if (!existsSync(join(dir, 'assets'))) {
    record('A2', '生产包无开发文案', false, '没有 app/dist/assets —— 先跑 A1', '先构建')
    return
  }
  // 三个地方都要扫：JS（页头徽章、开关文案）、CSS（伪元素文字）、index.html（<title> 与 meta）
  const targets = [
    ...readdirSync(join(dir, 'assets'))
      .filter((n) => n.endsWith('.js') || n.endsWith('.css'))
      .map((n) => join(dir, 'assets', n)),
    ...(existsSync(join(dir, 'index.html')) ? [join(dir, 'index.html')] : []),
  ]
  const pattern = /数据层状态|打卡|传智杯|Day \d+/g
  const hits = []
  for (const file of targets) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(pattern)) hits.push(`${m[0]}@${file.split(/[\\/]/).pop()}`)
  }
  record(
    'A2',
    '生产包无开发文案',
    hits.length === 0,
    hits.length === 0 ? `${targets.length} 个产物文件，4 个关键词 0 处` : `${hits.length} 处：${[...new Set(hits)].slice(0, 5).join(' ')}`,
    '用 import.meta.env.DEV 分环境渲染，别写死文案；改完重新构建',
  )
}

async function a3_no_secret() {
  const files = [
    ...walk(join(ROOT, 'app/src'), ['.ts', '.tsx', '.js', '.jsx', '.json']),
    // 🔴 dist 也要扫：`VITE_` 前缀的环境变量会在构建时被内联进 bundle，
    //    只扫源码会漏掉「打包之后才出现」的密钥。
    ...walk(join(ROOT, 'app/dist'), ['.js', '.css', '.html']),
    ...walk(join(ROOT, 'cloudfunctions/api-health'), ['.js', '.json'], ['node_modules']),
    ...walk(join(ROOT, 'db'), ['.sql']),
  ]
  const patterns = [
    { re: /AKID[A-Za-z0-9]{10,}/g, what: 'AKID…' },
    { re: /secret(?:Id|Key)\s*[:=]\s*['"][^'"]{8,}['"]/gi, what: 'secretId/secretKey 字面量' },
  ]
  const hits = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const p of patterns) {
      for (const m of text.matchAll(p.re)) hits.push(`${p.what}@${file.replace(ROOT, '.')}`)
    }
  }
  record(
    'A3',
    '代码无硬编码密钥（含构建产物）',
    hits.length === 0,
    hits.length === 0 ? `扫了 ${files.length} 个文件（源码 + dist + 云函数 + db），0 处` : `${hits.length} 处：${hits.slice(0, 3).join(' ')}`,
    '删掉字面量不算修完 —— 泄漏过就要换 key，忽略规则挡不住已经进过历史的东西',
  )
}

async function a4_env_ignored() {
  const ignored = sh('git check-ignore -q .env').code === 0
  const exampleTracked = sh('git ls-files .env.example').out !== ''
  const history = sh('git log --all --name-only --pretty=format:')
    .out.split('\n')
    .map((s) => s.trim())
    .filter((s) => /^\.env(\.|$)/.test(s) && !s.endsWith('.env.example'))
  const ok = ignored && exampleTracked && history.length === 0
  const parts = [
    `.env ${ignored ? '已被忽略' : '**未被忽略**'}`,
    `.env.example ${exampleTracked ? '在仓库' : '**不在仓库**'}`,
    `历史中出现过 ${history.length} 次${history.length ? `：${[...new Set(history)].join(' ')}` : ''}`,
  ]
  record('A4', 'Git 安全（.env 被忽略 + 示例在库 + 历史干净）', ok, parts.join('；'), '忽略了但历史上提交过 = 没用，得换 key')
}

// ─────────────────────────────────────────────────────────────
// B 组 · 线上
// ─────────────────────────────────────────────────────────────

/** B1 + B2 共用一次首页请求 */
async function fetchHome() {
  const res = await http('GET', `${WEB_URL}/`)
  return res
}

async function b1_home(home) {
  const type = home.headers.get('content-type') ?? '(无)'
  const isHtml = type.includes('text/html')
  const noSuchKey = home.text.includes('NoSuchKey')
  const ok = home.status === 200 && isHtml && !noSuchKey
  record(
    'B1',
    '公网首页可访问',
    ok,
    home.error ? brief(home) : `${home.status} · ${type}${noSuchKey ? ' · 响应体含 NoSuchKey（打到静态托管的错配置）' : ''}`,
    'text/html + NoSuchKey = 请求打到了静态托管而不是云函数；先核对宿主地址',
  )
}

function b2_same_build(home) {
  const distIndex = join(ROOT, 'app/dist/index.html')
  if (!existsSync(distIndex)) {
    record('B2', '线上产物 = 本地构建', false, '没有 app/dist/index.html —— 先跑 A1', '先构建')
    return
  }
  const pick = (text) => [...new Set(text.match(/assets\/index-[A-Za-z0-9_-]+\.(?:js|css)/g) ?? [])].sort()
  const localHtml = readFileSync(distIndex, 'utf8')
  const local = pick(localHtml)
  const live = pick(home.text)
  const sameAssets = local.length > 0 && local.join('|') === live.join('|')
  // 🔴 只比 hash 不够：改 index.html 本身（title / meta / 注释）不会改 assets 的文件名，
  //    于是「改完忘了重新部署」会被判 PASS。所以整页正文也要比。
  const sameHtml = localHtml.replace(/\s+/g, '').trim() === home.text.replace(/\s+/g, '').trim()
  const ok = sameAssets && sameHtml
  record(
    'B2',
    '线上产物 = 本地构建',
    ok,
    ok
      ? `assets 一致（${local.join(' ')}）+ index.html 正文一致`
      : `assets ${sameAssets ? '一致' : `不同：本地 [${local.join(' ') || '空'}] vs 线上 [${live.join(' ') || '空'}]`}；index.html 正文${sameHtml ? '一致' : '**不同（改了没部署，或部署没生效）**'}`,
    '判生效只看「本地构建 vs 线上」比出来的差别；list 时间戳和 *.webapps 的 200 都撒过谎（CDN 缓存）',
  )
}

async function b3_health() {
  const res = await http('GET', `${API_URL}/health`)
  const ok = res.status === 200 && res.json?.ok === true && res.json?.data?.service === 'priorknow'
  record('B3', '健康接口 GET /api/health', ok, brief(res), '没有 ok 字段 = 打到了别的服务（网关原生 JSON 就没有 ok）')
}

async function b4_cors() {
  const res = await http('OPTIONS', `${API_URL}/tasks`, {
    headers: { Origin: WEB_URL, 'Access-Control-Request-Method': 'POST' },
  })
  const allow = res.headers.get('access-control-allow-origin')
  const ok = allow !== null && allow === WEB_URL
  record(
    'B4',
    '跨域放行（只看响应头）',
    ok,
    allow === null ? `${res.status} 但**没有** access-control-allow-origin 头（名单里少了 ${WEB_URL}）` : `allow-origin: ${allow}`,
    'CloudBase 按安全域名名单放行，名单外仍回 204 所以状态码全绿；tcb cors list 查名单，不许用 *',
  )
}

async function b5_read() {
  // 只读一次空库证明不了什么（ok:true + items:[] 也可能是「读不出来但壳是对的」）。
  // 所以这一项真的写一条、再拉回来比对，最后删掉 —— 读写闭环。
  const id = `verify-read-${Date.now()}`
  const title = `读回探针 ${id.slice(-6)}`
  const post = await http('POST', `${API_URL}/tasks`, {
    headers: { 'X-User-Id': PROBE_USER },
    body: [{ id, title, status: 'todo', importance: 2, estimateMinutes: 15 }],
  })
  const postCursor = post.json?.data?.cursor
  if (post.status !== 201 || typeof postCursor !== 'number') {
    record('B5', '读接口能原样读回（写入 → 拉取 → 删除）', false, `写入就失败：${brief(post)}`, '写入这一步 B6 也在查，先看它是不是 400 / 500')
    return
  }
  const read = await http('GET', `${API_URL}/tasks?since=${Math.max(0, postCursor - 1)}`, {
    headers: { 'X-User-Id': PROBE_USER },
  })
  const items = read.json?.data?.items
  const got = Array.isArray(items) ? items.find((t) => t.id === id) : undefined
  const del = await http('DELETE', `${API_URL}/tasks/${id}`, { headers: { 'X-User-Id': PROBE_USER } })

  const shellOk = read.status === 200 && read.json?.ok === true
  const found = got !== undefined && got.title === title
  const ok = shellOk && found && del.status === 200
  const verdict = !shellOk
    ? `响应壳不对：${brief(read)}`
    : got === undefined
      ? `按 id 没找着刚写的那条（GET since=${postCursor - 1} 回来 ${items.length} 条）`
      : got.title === title
        ? '读回的内容与写入逐字一致'
        : `读到了但内容不一致：写入「${title}」/ 读回「${got.title}」`
  record(
    'B5',
    '读接口能原样读回（写入 → 拉取 → 删除）',
    ok,
    shellOk ? `GET since=${postCursor - 1} → ${items.length} 条 · ${verdict} · DELETE ${del.status}` : verdict,
    '读到空数组不等于读不到 —— 判据必须是「刚写的那条在不在、内容对不对」',
  )
}

async function b6_write() {
  const id = `verify-${Date.now()}`
  const title = `发布前检查探针 ${id.slice(-6)}`
  const post = await http('POST', `${API_URL}/tasks`, {
    headers: { 'X-User-Id': PROBE_USER },
    body: [{ id, title, status: 'todo', importance: 2, estimateMinutes: 30 }],
  })
  const postCursor = post.json?.data?.cursor
  if (post.status !== 201 || typeof postCursor !== 'number' || postCursor <= 0) {
    record('B6', '写接口 POST → PATCH → DELETE（且 seq 在推进）', false, `第一步就失败：${brief(post)}`, '先看 POST 是不是 400（请求体）或 500（写权限/触发器）')
    return
  }

  const patch = await http('PATCH', `${API_URL}/tasks/${id}`, {
    headers: { 'X-User-Id': PROBE_USER },
    body: { title: `${title}·改` },
  })
  const patchCursor = patch.json?.data?.cursor
  // 收尾：无论断言结果如何都要删掉探针，别把测试数据留在库里
  const del = await http('DELETE', `${API_URL}/tasks/${id}`, { headers: { 'X-User-Id': PROBE_USER } })

  const seqAdvanced = typeof patchCursor === 'number' && patchCursor > postCursor
  const ok = patch.status === 200 && seqAdvanced && del.status === 200
  const evidence = [
    `POST 201 cursor ${postCursor}`,
    `PATCH ${patch.status} cursor ${patchCursor ?? '(无)'}${seqAdvanced ? ' ✓ 推进' : ' ✗ 没推进'}`,
    `DELETE ${del.status}`,
  ].join(' · ')
  record(
    'B6',
    '写接口 POST → PATCH → DELETE（且 seq 在推进）',
    ok,
    evidence,
    seqAdvanced
      ? 'DELETE 不是软删？查 deleted_at 是否落库、PATCH 找不到是否回 404'
      : 'seq 没推进 = BEFORE UPDATE 触发器没在（db/migrate-01-seq-trigger.sql），改过的任务别的设备永远拉不到',
  )
}

async function b7_budget() {
  const res = await http('GET', `${API_URL}/budget?date=2026-01-01`, { headers: { 'X-User-Id': PROBE_USER } })
  const ok = res.status === 200 && res.json?.ok === true
  record(
    'B7',
    '预算表在 GET /api/budget',
    ok,
    ok ? `200 · ok:true · ${JSON.stringify(res.json.data)}` : brief(res),
    'daily_budget 是第二张表，建表在 db/migrate-03-budget.sql（刻意没并进 schema.sql）',
  )
}

// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('知先 PriorKnow · 发布前检查')
  console.log(`前端 ${WEB_URL}`)
  console.log(`接口 ${API_URL}`)
  console.log('─'.repeat(72))

  await a1_build()
  await a2_no_dev_copy()
  await a3_no_secret()
  await a4_env_ignored()

  const home = await fetchHome()
  await b1_home(home)
  b2_same_build(home)
  await b3_health()
  await b4_cors()
  // 先写后读：读那一项要拿「刚写进去的那条」当判据，不能只读一次空库
  await b6_write()
  await b5_read()
  await b7_budget()

  results.sort((a, b) => a.id.localeCompare(b.id))

  console.log('')
  for (const r of results) {
    console.log(`[${r.id}] ${r.pass ? 'PASS' : 'FAIL'}  ${r.name} —— ${r.evidence}`)
  }
  const fail = results.filter((r) => !r.pass)
  console.log('')
  console.log(`合计 ${results.length} 项：PASS ${results.length - fail.length} / FAIL ${fail.length}`)
  if (fail.length > 0) {
    console.log('')
    console.log('FAIL 怎么查：')
    for (const r of fail) console.log(`  ${r.id} —— ${r.hint}`)
  }
  process.exit(fail.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('检查脚本自己崩了：', err)
  process.exit(2)
})
