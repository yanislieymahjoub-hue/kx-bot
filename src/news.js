import { GUILD_ID, RSS_FEEDS } from './config.js';
import { store } from './store.js';

export const NEWS_CHANNEL = '📰・actualité';
export const NEWS_ROLE = 'Alertes IA & Tech';
export const NEWS_TOPIC = 'Actualités IA & tech • K’X • Lecture seule. Active ou désactive les alertes avec les boutons sous les articles.';
const MAX_AGE = 48 * 3600000;

function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, key) => {
    if (key[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[key.toLowerCase()] ?? m;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
const plain = value => decode(decode(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, '').replace(/<\/?(?:p|div|br|li)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const safeText = value => value.replace(/@/g, '@\u200b').replace(/([*_`~|\\])/g, '\\$1');
export function articleUrl(value) {
  try {
    const url = new URL(decode(value.trim()));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    return url.href.length <= 1800 ? url.href : null;
  } catch { return null; }
}

export function parseFeed(xml, source) {
  const result = [];
  let scanned = 0;
  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)) {
    if (++scanned > 100) break;
    const block = match[0];
    const pick = tag => block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
    let link = plain(pick('link'));
    if (!link) {
      for (const tag of block.match(/<link\b[^>]*>/gi) ?? []) {
        const attr = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
        if (!attr('rel') || attr('rel') === 'alternate') { link = attr('href') ?? ''; break; }
      }
    }
    const title = plain(pick('title')), url = articleUrl(link);
    const date = new Date(plain(pick('pubDate') || pick('published') || pick('updated') || pick('dc:date')));
    if (!title || !url || !Number.isFinite(date.getTime())) continue;
    result.push({ title, link: url, date, source, summary: plain(pick('description') || pick('summary')).slice(0, 280) });
  }
  return result;
}

export async function latestNews(n = 60, now = Date.now(), fetcher = fetch) {
  const batches = await Promise.all(RSS_FEEDS.map(async url => {
    try {
      const res = await fetcher(url, { headers: { 'user-agent': 'KX-Bot/1.0 (+https://kxautomatisation.fr)' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (xml.length > 2_000_000) throw new Error('Flux trop volumineux');
      const items = parseFeed(xml, new URL(url).hostname.replace(/^www\./, ''));
      if (!items.length) console.warn('NEWS_FEED_EMPTY', new URL(url).hostname);
      return items;
    } catch (e) { console.warn('NEWS_FEED_UNAVAILABLE', new URL(url).hostname, e.message); return []; }
  }));
  const unique = new Map();
  for (const item of batches.flat()) if (item.date.getTime() <= now && item.date.getTime() >= now - MAX_AGE) unique.set(item.link, item);
  return [...unique.values()].sort((a, b) => b.date - a.date).slice(0, n);
}

export const newsButtons = () => [
  { type: 2, style: 2, label: 'Activer les alertes', emoji: { name: '🔔' }, custom_id: 'news:on' },
  { type: 2, style: 2, label: 'Désactiver les alertes', emoji: { name: '🔕' }, custom_id: 'news:off' },
];
export function newsCard(item, role, ping = false) {
  return {
    ...(ping ? { content: `<@&${role}>` } : {}),
    allowed_mentions: ping ? { parse: [], roles: [role] } : { parse: [] },
    embeds: [{ title: safeText(item.title).slice(0, 250), url: item.link, color: 0xec4899,
      ...(item.summary ? { description: safeText(item.summary).slice(0, 600) } : {}),
      footer: { text: `K’X · IA & Tech • ${item.source} • Extrait de la source` }, timestamp: item.date.toISOString() }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Lire l’article', url: item.link }, ...newsButtons()] }],
  };
}
export function newsPanel() {
  return { allowed_mentions: { parse: [] }, embeds: [{ title: 'Actualités IA & tech', color: 0xec4899,
    description: 'Les nouveautés IA et tech, avec leur source et un lien vers l’article. Vérification chaque heure, jusqu’à trois articles par passage.\n\nCe salon est accessible à tous en lecture seule. Les alertes sont **facultatives** : utilise les boutons ci-dessous pour t’abonner ou te désabonner. Aucun @everyone.\n\nLes boutons gèrent le rôle d’alerte ; tes réglages personnels Discord restent prioritaires.',
    footer: { text: 'K’X · Actualités · Notifications volontaires' } }], components: [{ type: 1, components: newsButtons() }] };
}

async function readDiscord(env, h, path) {
  const res = await h.discord(env, 'GET', path);
  if (!res.ok) throw new Error(`Actualités : HTTP ${res.status}`);
  return res.json();
}
export async function runNews(env, h, { now = Date.now(), load = latestNews } = {}) {
  const lock = crypto.randomUUID();
  if (!(await store(env, 'newsAcquire', { lock, now })).ok) return { sent: 0, busy: true };
  let sent = 0;
  try {
    const channels = await readDiscord(env, h, `/guilds/${GUILD_ID}/channels`);
    const channel = channels.find(c => c.name === NEWS_CHANNEL && c.type === 0);
    if (!channel) return { sent: 0, missing: 'channel' };
    const roles = await readDiscord(env, h, `/guilds/${GUILD_ID}/roles`);
    const role = roles.find(r => r.name === NEWS_ROLE && !r.managed && r.permissions === '0');
    if (!role) throw new Error('Rôle d’alerte absent ou permissions inattendues');
    const raw = await load(60, now);
    const items = [...new Map(raw.filter(a => a.date.getTime() <= now && a.date.getTime() >= now - MAX_AGE).map(a => [a.link, a])).values()].sort((a, b) => b.date - a.date);
    // First activation keeps only the three newest items, without replaying archives later.
    if (items.length) await store(env, 'newsInitialize', { skip: items.slice(3).map(a => a.link), now });
    const eligible = new Set(await store(env, 'newsEligible', { urls: items.map(a => a.link) }));
    for (const item of items.filter(a => eligible.has(a.link))) {
      if (sent >= 3) break;
      if (!(await store(env, 'newsClaim', { url: item.link, now })).ok) continue;
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.link));
      const nonce = Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 24);
      // A single voluntary role ping per batch, never an everyone/here mention.
      const response = await h.discord(env, 'POST', `/channels/${channel.id}/messages`, { ...newsCard(item, role.id, sent === 0), nonce, enforce_nonce: true }, 'veille');
      if (!response.ok) {
        // Explicit 4xx refusal is safe to retry; network/5xx stays pending for inspection.
        if (response.status >= 400 && response.status < 500) await store(env, 'newsComplete', { url: item.link, status: 'retry' });
        throw new Error(`Publication actualités : HTTP ${response.status}`);
      }
      const message = await response.json();
      if (!message.id) throw new Error('Publication sans identifiant');
      await store(env, 'newsComplete', { url: item.link, status: 'sent', message: message.id });
      sent++;
    }
    return { sent, channel: channel.id, ...(await store(env, 'newsStatus')) };
  } finally { await store(env, 'newsRelease', { lock }); }
}

export function handleNewsComponent(i, env, ctx, h) {
  if (i.guild_id !== GUILD_ID || !i.member?.user || !['news:on', 'news:off'].includes(i.data?.custom_id)) return h.reply({ content: 'Action indisponible.' }, true);
  ctx.waitUntil((async () => {
    try {
      const roles = await readDiscord(env, h, `/guilds/${GUILD_ID}/roles`);
      const role = roles.find(r => r.name === NEWS_ROLE && !r.managed && r.permissions === '0');
      if (!role) throw new Error('Rôle manquant');
      const on = i.data.custom_id === 'news:on';
      const res = await h.discord(env, on ? 'PUT' : 'DELETE', `/guilds/${GUILD_ID}/members/${i.member.user.id}/roles/${role.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await h.followUp(env, i, { content: on ? '🔔 Alertes IA & Tech activées. Tu peux les désactiver à tout moment avec le bouton voisin.' : '🔕 Alertes IA & Tech désactivées. Tu peux toujours lire les actualités ici.' });
    } catch { await h.followUp(env, i, { content: 'Modification impossible pour le moment. Préviens l’équipe pour vérifier le rôle et les permissions du bot.' }); }
  })());
  return h.json({ type: 5, data: { flags: 64 } });
}
