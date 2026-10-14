// Mémoire du bot: Durable Object SQLite (gratuit sur Cloudflare)
// Points, remerciements, quiz, quota IA.

// Travaux longs (au-delà des 30 s d'une interaction): exécutés par l'alarme du Durable Object
let jobRunner = null;
export const setJobRunner = (fn) => { jobRunner = fn; };

export class KXStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (user TEXT, pts INTEGER, reason TEXT, ts INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS thanks (giver TEXT, receiver TEXT, day TEXT, PRIMARY KEY (giver, receiver, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS quiz (id TEXT PRIMARY KEY, answer INTEGER, explanation TEXT, ts INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS quiz_try (id TEXT, user TEXT, PRIMARY KEY (id, user))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ai_usage (user TEXT, day TEXT, n INTEGER, PRIMARY KEY (user, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS news_articles (url TEXT PRIMARY KEY, status TEXT NOT NULL, ts INTEGER NOT NULL, message TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, owner TEXT UNIQUE, seen INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invite_awards (owner TEXT, week TEXT, n INTEGER, PRIMARY KEY (owner, week))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS statut (user TEXT PRIMARY KEY, statut TEXT, ref TEXT, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dossier (ref TEXT PRIMARY KEY, kind TEXT, user TEXT, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS journal (ts INTEGER, quoi TEXT, ref TEXT, par TEXT, cible TEXT, detail TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rdv (thread TEXT, owner TEXT, ts INTEGER, reminded INTEGER DEFAULT 0, PRIMARY KEY (thread, ts))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS introduction (user TEXT PRIMARY KEY, message TEXT, lock TEXT, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS moderation (id TEXT PRIMARY KEY, user TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, ts INTEGER NOT NULL)`);
  }

  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }

  newsAcquire({ lock, now }) {
    const current = JSON.parse(this.setting({ key: 'news_lock' }).value || 'null');
    if (current && current.until > now) return { ok: false };
    this.setting({ key: 'news_lock', value: JSON.stringify({ lock, until: now + 300000 }) });
    return { ok: true };
  }
  newsRelease({ lock }) {
    const current = JSON.parse(this.setting({ key: 'news_lock' }).value || 'null');
    if (current?.lock === lock) this.setting({ key: 'news_lock', value: 'null' });
    return { ok: true };
  }
  newsInitialize({ skip, now }) {
    if (this.setting({ key: 'news_initialized' }).value) return { ok: false };
    for (const url of skip) this.sql.exec('INSERT OR IGNORE INTO news_articles (url, status, ts) VALUES (?, ?, ?)', url, 'skipped', now);
    this.setting({ key: 'news_initialized', value: now });
    return { ok: true };
  }
  newsClaim({ url, now }) {
    if (this.rows('SELECT url FROM news_articles WHERE url = ?', url).length) return { ok: false };
    this.sql.exec('INSERT INTO news_articles (url, status, ts) VALUES (?, ?, ?)', url, 'pending', now);
    return { ok: true };
  }
  newsEligible({ urls }) {
    return urls.filter(url => !this.rows('SELECT url FROM news_articles WHERE url = ?', url).length).slice(0, 3);
  }
  newsComplete({ url, status, message }) {
    if (status === 'retry') this.sql.exec("DELETE FROM news_articles WHERE url = ? AND status = 'pending'", url);
    if (status === 'sent' && message) this.sql.exec("UPDATE news_articles SET status = 'sent', message = ? WHERE url = ? AND status = 'pending'", message, url);
    return { ok: true };
  }
  newsStatus() {
    return { published: this.rows("SELECT COUNT(*) AS n FROM news_articles WHERE status = 'sent'")[0].n,
      uncertain: this.rows("SELECT COUNT(*) AS n FROM news_articles WHERE status = 'pending'")[0].n };
  }

  modClaim({ id, user, actor, action, reason }) {
    if (this.rows('SELECT id FROM moderation WHERE id = ?', id).length) return { ok: false };
    this.sql.exec('INSERT INTO moderation (id, user, actor, action, reason, status, ts) VALUES (?, ?, ?, ?, ?, ?, ?)', id, user, actor, action, reason, 'pending', Date.now());
    return { ok: true };
  }
  modComplete({ id, status }) {
    if (!['done', 'failed', 'uncertain'].includes(status)) return { ok: false };
    this.sql.exec("UPDATE moderation SET status = ? WHERE id = ? AND status = 'pending'", status, id);
    return { ok: true };
  }
  modHistory({ user }) { return this.rows('SELECT * FROM moderation WHERE user = ? ORDER BY ts DESC, rowid DESC LIMIT 10', user); }
  modRevokeWarn({ id, user }) {
    if (!this.rows("SELECT id FROM moderation WHERE id = ? AND user = ? AND action = 'warn' AND status = 'done'", id, user).length) return { ok: false };
    this.sql.exec("UPDATE moderation SET status = 'revoked' WHERE id = ?", id);
    return { ok: true };
  }

  // Synchronous DO operations serialize admission attempts for the same member.
  // No automatic lease expiry: a crashed publication needs staff reconciliation,
  // rather than risking a duplicate post or granting access without a saved message.
  introClaim({ user, lock }) {
    const st = this.statutGet({ user }).statut;
    if (st === 'fde') return { ok: false, reason: 'member' };
    if (st && !['aucun', 'presentation'].includes(st)) return { ok: false, reason: 'conflict' };
    const row = this.rows('SELECT message, lock FROM introduction WHERE user = ?', user)[0];
    if (row?.lock) return { ok: false, reason: 'busy' };
    this.sql.exec('INSERT INTO introduction (user, message, lock, updated) VALUES (?, NULL, ?, ?) ON CONFLICT(user) DO UPDATE SET lock = excluded.lock, updated = excluded.updated', user, lock, Date.now());
    this.statutSet({ user, statut: 'presentation' });
    return { ok: true, message: row?.message ?? null };
  }
  introPublished({ user, lock, message }) {
    this.sql.exec('UPDATE introduction SET message = ?, updated = ? WHERE user = ? AND lock = ?', message, Date.now(), user, lock);
    return { ok: true };
  }
  introComplete({ user, lock }) {
    const row = this.rows('SELECT message, lock FROM introduction WHERE user = ?', user)[0];
    if (row?.lock !== lock || !row.message || this.statutGet({ user }).statut !== 'presentation') return { ok: false };
    this.statutSet({ user, statut: 'fde' });
    return { ok: true };
  }
  introRelease({ user, lock }) {
    this.sql.exec('UPDATE introduction SET lock = NULL WHERE user = ? AND lock = ?', user, lock);
    return { ok: true };
  }

  total(user) { return this.rows(`SELECT total FROM points WHERE user = ?`, user)[0]?.total ?? 0; }

  add({ user, pts, reason }) {
    this.sql.exec(`INSERT INTO points (user, total) VALUES (?, ?) ON CONFLICT(user) DO UPDATE SET total = total + excluded.total`, user, pts);
    this.sql.exec(`INSERT INTO log (user, pts, reason, ts) VALUES (?, ?, ?, ?)`, user, pts, reason ?? "", Date.now());
    return { total: this.total(user) };
  }

  profile({ user }) {
    const total = this.total(user);
    const rank = this.rows(`SELECT COUNT(*) AS n FROM points WHERE total > ?`, total)[0].n + 1;
    const week = this.rows(`SELECT COALESCE(SUM(pts), 0) AS s FROM log WHERE user = ? AND ts > ?`, user, Date.now() - 7 * 864e5)[0].s;
    return { total, rank, week };
  }

  top({ n = 10, days }) {
    if (days) return this.rows(`SELECT user, SUM(pts) AS total FROM log WHERE ts > ? GROUP BY user HAVING total > 0 ORDER BY total DESC LIMIT ?`, Date.now() - days * 864e5, n);
    return this.rows(`SELECT user, total FROM points WHERE total > 0 ORDER BY total DESC LIMIT ?`, n);
  }

  thank({ giver, receiver, day }) {
    if (this.rows(`SELECT 1 FROM thanks WHERE giver = ? AND receiver = ? AND day = ?`, giver, receiver, day).length) return { ok: false };
    this.sql.exec(`INSERT INTO thanks (giver, receiver, day) VALUES (?, ?, ?)`, giver, receiver, day);
    return { ok: true, ...this.add({ user: receiver, pts: 10, reason: `merci de ${giver}` }) };
  }

  quizSave({ id, answer, explanation }) {
    this.sql.exec(`INSERT OR REPLACE INTO quiz (id, answer, explanation, ts) VALUES (?, ?, ?, ?)`, id, answer, explanation, Date.now());
    return { ok: true };
  }

  quizTry({ id, user, choice }) {
    const q = this.rows(`SELECT answer, explanation FROM quiz WHERE id = ?`, id)[0];
    if (!q) return { missing: true };
    if (this.rows(`SELECT 1 FROM quiz_try WHERE id = ? AND user = ?`, id, user).length) return { already: true, ...q };
    this.sql.exec(`INSERT INTO quiz_try (id, user) VALUES (?, ?)`, id, user);
    const correct = q.answer === choice;
    const total = correct ? this.add({ user, pts: 5, reason: "quiz" }).total : this.total(user);
    return { correct, total, ...q };
  }

  aiQuota({ user, day, limit }) {
    const n = this.rows(`SELECT n FROM ai_usage WHERE user = ? AND day = ?`, user, day)[0]?.n ?? 0;
    if (n >= limit) return { ok: false, n };
    this.sql.exec(`INSERT INTO ai_usage (user, day, n) VALUES (?, ?, 1) ON CONFLICT(user, day) DO UPDATE SET n = n + 1`, user, day);
    return { ok: true, n: n + 1 };
  }

  stats() {
    return {
      players: this.rows(`SELECT COUNT(*) AS n FROM points WHERE total > 0`)[0].n,
      points: this.rows(`SELECT COALESCE(SUM(total), 0) AS s FROM points`)[0].s,
      quizzes: this.rows(`SELECT COUNT(*) AS n FROM quiz`)[0].n,
      thanks: this.rows(`SELECT COUNT(*) AS n FROM thanks`)[0].n,
    };
  }

  // statut privé client / FDE (jamais exposé en annuaire)
  statutGet({ user }) { const r = this.rows(`SELECT statut, ref FROM statut WHERE user = ?`, user)[0]; return r ?? { statut: null }; }
  statutSet({ user, statut, ref = null }) {
    this.sql.exec(`INSERT OR REPLACE INTO statut (user, statut, ref, updated) VALUES (?, ?, ?, ?)`, user, statut, ref, Date.now());
    this.journal({ quoi: `statut ${statut}`, ref, cible: user });
    return { ok: true };
  }
  // dossiers clients et espaces de mission (référence neutre)
  dossierSet(d) { this.sql.exec(`INSERT OR REPLACE INTO dossier (ref, kind, user, data) VALUES (?, ?, ?, ?)`, d.ref, d.kind, d.user ?? null, JSON.stringify(d)); return { ok: true }; }
  dossierGet({ ref }) { const r = this.rows(`SELECT data FROM dossier WHERE ref = ?`, ref)[0]; return r ? JSON.parse(r.data) : null; }
  dossierOf({ user, kind }) { const r = this.rows(`SELECT data FROM dossier WHERE user = ? AND kind = ? ORDER BY rowid DESC`, user, kind)[0]; return r ? JSON.parse(r.data) : null; }
  dossiers({ kind }) { return this.rows(`SELECT data FROM dossier WHERE kind = ?`, kind).map((r) => JSON.parse(r.data)); }
  journal({ quoi, ref = null, par = null, cible = null, detail = null }) {
    this.sql.exec(`INSERT INTO journal (ts, quoi, ref, par, cible, detail) VALUES (?, ?, ?, ?, ?, ?)`, Date.now(), quoi, ref, par, cible, detail);
    return { ok: true };
  }
  journalRef({ ref }) { return this.rows(`SELECT ts, quoi, par, cible, detail FROM journal WHERE ref = ? ORDER BY ts`, ref); }

  // liens d'invitation personnels et points de parrainage
  inviteGet({ owner }) { return { code: this.rows(`SELECT code FROM invites WHERE owner = ?`, owner)[0]?.code ?? null }; }
  inviteSet({ owner, code, uses = 0 }) { this.sql.exec(`INSERT OR REPLACE INTO invites (code, owner, seen) VALUES (?, ?, ?)`, code, owner, uses); return { ok: true }; }
  inviteSync({ counts, week, cap, pts }) {
    // counts: { code: uses } ; ne compte que les nouvelles utilisations, plafonné par semaine
    const awarded = [];
    for (const r of this.rows(`SELECT code, owner, seen FROM invites`)) {
      const uses = counts[r.code];
      if (uses === undefined || uses <= r.seen) continue;
      this.sql.exec(`UPDATE invites SET seen = ? WHERE code = ?`, uses, r.code);
      const done = this.rows(`SELECT n FROM invite_awards WHERE owner = ? AND week = ?`, r.owner, week)[0]?.n ?? 0;
      const n = Math.min(uses - r.seen, Math.max(0, cap - done));
      if (!n) continue;
      this.sql.exec(`INSERT INTO invite_awards (owner, week, n) VALUES (?, ?, ?) ON CONFLICT(owner, week) DO UPDATE SET n = n + excluded.n`, r.owner, week, n);
      const t = this.add({ user: r.owner, pts: n * pts, reason: `invitation x${n}` });
      awarded.push({ owner: r.owner, n, total: t.total });
    }
    return awarded;
  }
  inviteWeek({ owner, week }) { return { n: this.rows(`SELECT n FROM invite_awards WHERE owner = ? AND week = ?`, owner, week)[0]?.n ?? 0 }; }
  inviteTop({ week }) { return this.rows(`SELECT owner, n FROM invite_awards WHERE week = ? ORDER BY n DESC LIMIT 3`, week); }

  // appels vocaux confirmés dans les tickets
  rdvSave({ thread, owner, ts }) {
    this.sql.exec(`INSERT OR REPLACE INTO rdv (thread, owner, ts, reminded) VALUES (?, ?, ?, 0)`, thread, owner, ts);
    return { ok: true };
  }
  rdvDue({ now, within }) {
    const rows = this.rows(`SELECT thread, owner, ts FROM rdv WHERE reminded = 0 AND ts > ? AND ts <= ?`, now, now + within);
    for (const r of rows) this.sql.exec(`UPDATE rdv SET reminded = 1 WHERE thread = ? AND ts = ?`, r.thread, r.ts);
    return rows;
  }

  // réglages simples (ex. version du logo déjà appliquée)
  setting({ key, value }) {
    if (value !== undefined) this.sql.exec(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, String(value));
    return { value: this.rows(`SELECT value FROM settings WHERE key = ?`, key)[0]?.value ?? null };
  }

  jobStart({ job }) {
    this.setting({ key: "job", value: JSON.stringify(job) });
    this.state.storage.setAlarm(Date.now() + 200);
    return { ok: true };
  }

  // Un travail avance par étapes: chaque alarme reste sous la limite de sous-requêtes de Cloudflare, puis relance la suivante
  async alarm() {
    const raw = this.setting({ key: "job" }).value;
    if (!raw || !jobRunner) return;
    const self = this;
    const STORE = { idFromName: () => "kx", get: () => ({ fetch: async (_u, o) => self.fetch(new Request("https://store/", o)) }) };
    const job = JSON.parse(raw);
    try {
      const next = await jobRunner({ ...this.env, STORE }, job);
      if (next) {
        this.setting({ key: "job", value: JSON.stringify(next) });
        this.setting({ key: "job_status", value: `${job.kind} ${next.phase} ${next.i ?? 0}/${next.queue?.length ?? 0} ${new Date().toISOString()}` });
        await this.state.storage.setAlarm(Date.now() + (next.delay ?? 200));
      } else {
        this.setting({ key: "job", value: "" });
        this.setting({ key: "job_status", value: `${job.kind} terminé ${new Date().toISOString()}` });
      }
    } catch (e) {
      this.setting({ key: "job", value: "" });
      this.setting({ key: "job_status", value: `${job.kind} échoué ${e.message}` });
    }
  }

  async fetch(request) {
    const { op, ...args } = await request.json();
    if (typeof this[op] !== "function" || ["constructor", "rows", "fetch", "alarm"].includes(op)) return Response.json({ error: "op inconnue" }, { status: 400 });
    return Response.json(this[op](args));
  }
}

// Appel depuis le Worker
export async function store(env, op, args = {}) {
  const stub = env.STORE.get(env.STORE.idFromName("kx"));
  const res = await stub.fetch("https://store/", { method: "POST", body: JSON.stringify({ op, ...args }) });
  if (!res.ok) throw new Error(`Stockage indisponible (${res.status})`);
  return res.json();
}
