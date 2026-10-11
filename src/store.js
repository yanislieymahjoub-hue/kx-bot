// Mémoire du bot: Durable Object SQLite (gratuit sur Cloudflare)
// Points, remerciements, quiz, quota IA.

export class KXStore {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (user TEXT, pts INTEGER, reason TEXT, ts INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS thanks (giver TEXT, receiver TEXT, day TEXT, PRIMARY KEY (giver, receiver, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS quiz (id TEXT PRIMARY KEY, answer INTEGER, explanation TEXT, ts INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS quiz_try (id TEXT, user TEXT, PRIMARY KEY (id, user))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ai_usage (user TEXT, day TEXT, n INTEGER, PRIMARY KEY (user, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, owner TEXT UNIQUE, seen INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invite_awards (owner TEXT, week TEXT, n INTEGER, PRIMARY KEY (owner, week))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS statut (user TEXT PRIMARY KEY, statut TEXT, ref TEXT, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dossier (ref TEXT PRIMARY KEY, kind TEXT, user TEXT, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS journal (ts INTEGER, quoi TEXT, ref TEXT, par TEXT, cible TEXT, detail TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rdv (thread TEXT, owner TEXT, ts INTEGER, reminded INTEGER DEFAULT 0, PRIMARY KEY (thread, ts))`);
  }

  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }

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

  async fetch(request) {
    const { op, ...args } = await request.json();
    if (typeof this[op] !== "function" || ["constructor", "rows", "fetch"].includes(op)) return Response.json({ error: "op inconnue" }, { status: 400 });
    return Response.json(this[op](args));
  }
}

// Appel depuis le Worker
export async function store(env, op, args = {}) {
  const stub = env.STORE.get(env.STORE.idFromName("kx"));
  const res = await stub.fetch("https://store/", { method: "POST", body: JSON.stringify({ op, ...args }) });
  return res.json();
}
