import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KXStore } from '../src/store.js';
import { GUILD_ID } from '../src/config.js';
import { parseFeed, newsCard, runNews, handleNewsComponent, latestNews } from '../src/news.js';

const now = Date.parse('2026-10-14T10:00:00Z');
const article = (n, time = now - n * 60000) => ({ title: `Article ${n}`, link: `https://example.com/${n}`, date: new Date(time), source: 'Source', summary: 'Un extrait.' });
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const memory = new KXStore({ storage: { sql: { exec(q, ...b) { const rows = db.prepare(q).all(...b); return { toArray: () => rows }; } } } }, {});
  const env = { STORE: { idFromName: () => 'kx', get: () => ({ fetch: (url, opts) => memory.fetch(new Request(url, opts)) }) } };
  const posts = [], changes = [], replies = [];
  let fail = false;
  const h = { json: Response.json, reply: (data) => Response.json({ type: 4, data: { ...data, flags: 64 } }), followUp: async (_e, _i, d) => replies.push(d),
    discord: async (_env, method, path, body) => {
      if (method === 'GET' && path.endsWith('/channels')) return Response.json([{ id: 'channel', name: '📰・actualité', type: 0 }]);
      if (method === 'GET' && path.endsWith('/roles')) return Response.json([{ id: 'role', name: 'Alertes IA & Tech', permissions: '0', managed: false }]);
      if (path.includes('/members/')) { changes.push({ method, path }); return new Response(null, { status: fail ? 403 : 204 }); }
      if (method === 'POST' && path === '/channels/channel/messages') { if (fail) return Response.json({}, { status: 429 }); posts.push(body); return Response.json({ id: String(posts.length) }); }
      throw new Error(`Unexpected API ${method} ${path}`);
    } };
  return { env, memory, h, posts, changes, replies, setFailure: v => { fail = v; } };
}

test('RSS and Atom decode text, use article links, reject unsafe URLs and dates', () => {
  const rss = '<rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://example.com/a?utm_source=rss</link><description><![CDATA[<p>Texte <b>utile</b>.</p>]]></description><pubDate>Wed, 14 Oct 2026 09:00:00 GMT</pubDate></item><item><title>bad</title><link>javascript:alert(1)</link><pubDate>bad</pubDate></item></channel></rss>';
  assert.deepEqual(parseFeed(rss, 'Test').map(x => [x.title, x.link, x.summary, x.date.toISOString()]), [['A & B', 'https://example.com/a', 'Texte utile.', '2026-10-14T09:00:00.000Z']]);
  const atom = `<feed><entry><title>Atom</title><link rel='self' href='https://example.com/feed'/><link rel='alternate' href='https://example.com/article'/><updated>2026-10-14T09:00:00Z</updated><summary>Extrait</summary></entry></feed>`;
  assert.equal(parseFeed(atom, 'Test')[0].link, 'https://example.com/article');
});

test('cards only mention the subscribed role and expose explicit subscribe/unsubscribe buttons', () => {
  const card = newsCard({ ...article(1), title: '@everyone actualité', summary: '@here résumé' }, 'role', true);
  assert.deepEqual(card.allowed_mentions, { parse: [], roles: ['role'] });
  assert.equal(card.content, '<@&role>');
  assert.equal(card.components[0].components[0].url, 'https://example.com/1');
  assert.deepEqual(card.components[0].components.slice(1).map(b => b.custom_id), ['news:on', 'news:off']);
  assert.deepEqual(newsCard(article(1), 'role', false).allowed_mentions, { parse: [] });
});

test('one failed feed cannot suppress valid articles from another feed', async () => {
  const fetcher = async url => url.includes('actuia') ? new Response('<rss><channel><item><title>Valide</title><link>https://example.com/ok</link><pubDate>Wed, 14 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>') : new Response('offline', { status: 503 });
  const articles = await latestNews(10, now, fetcher);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].link, 'https://example.com/ok');
});

test('first run caps at three, skips backlog and deduplicates simultaneous and later runs', async t => {
  const f = fixture(t), load = async () => Array.from({ length: 8 }, (_, k) => article(k + 1));
  await Promise.all([runNews(f.env, f.h, { now, load }), runNews(f.env, f.h, { now, load })]);
  assert.equal(f.posts.length, 3);
  assert.equal(f.posts.filter(p => p.content).length, 1);
  await runNews(f.env, f.h, { now: now + 3600000, load });
  assert.equal(f.posts.length, 3);
  await runNews(f.env, f.h, { now: now + 3600000, load: async () => [article(9, now + 60000), ...await load()] });
  assert.equal(f.posts.length, 4);
});

test('old and future articles are never published; confirmed refusal is retryable', async t => {
  const f = fixture(t), load = async () => [article(1), article(2, now - 3 * 864e5), article(3, now + 3600000)];
  f.setFailure(true);
  await assert.rejects(runNews(f.env, f.h, { now, load }), /429/);
  f.setFailure(false);
  await runNews(f.env, f.h, { now: now + 60000, load });
  assert.equal(f.posts.length, 1);
});

test('ambiguous delivery stays reserved and is not posted twice', async t => {
  const f = fixture(t), load = async () => [article(1)];
  const h = { ...f.h, discord: async (...args) => { if (args[1] === 'POST') throw new Error('network disconnected'); return f.h.discord(...args); } };
  await assert.rejects(runNews(f.env, h, { now, load }), /network/);
  await runNews(f.env, f.h, { now: now + 60000, load });
  assert.equal(f.posts.length, 0);
});

test('buttons add and remove only the notification role for the clicking member', async t => {
  const f = fixture(t);
  for (const action of ['on', 'off']) {
    const tasks = [], i = { guild_id: GUILD_ID, member: { user: { id: 'user' }, roles: [] }, data: { custom_id: `news:${action}` } };
    const response = handleNewsComponent(i, f.env, { waitUntil: p => tasks.push(p) }, f.h);
    assert.equal((await response.json()).data.flags, 64);
    await Promise.all(tasks);
  }
  assert.deepEqual(f.changes.map(c => [c.method, c.path]), [['PUT', `/guilds/${GUILD_ID}/members/user/roles/role`], ['DELETE', `/guilds/${GUILD_ID}/members/user/roles/role`]]);
  f.setFailure(true);
  const tasks = [];
  handleNewsComponent({ guild_id: GUILD_ID, member: { user: { id: 'user' } }, data: { custom_id: 'news:on' } }, f.env, { waitUntil: p => tasks.push(p) }, f.h);
  await Promise.all(tasks);
  assert.match(f.replies.at(-1).content, /impossible/i);
});
