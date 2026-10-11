// Travaux longs exécutés par l'alarme du Durable Object, par lots.
// Cloudflare limite le nombre d'appels sortants par exécution: chaque lot en passe au plus LOT, puis l'alarme suivante reprend.
import { store } from "./store.js";
import { prepAppliquer, bilanAppliquer, prepRestaurer } from "./espaces.js";
import { publierAccueil } from "./publish.js";

const API = "https://discord.com/api/v10";
const LOT = 40;

async function lot(env, job) {
  let used = 0;
  while (job.i < job.queue.length && used < LOT) {
    const o = job.queue[job.i];
    if (o.s) { await store(env, o.s, o.a); job.i++; continue; }
    const res = await fetch(API + o.p, { method: o.m, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" }, body: o.b ? JSON.stringify(o.b) : undefined });
    used++;
    const text = await res.text();
    if (res.status === 429) { job.delay = Math.ceil((JSON.parse(text || "{}").retry_after ?? 1) * 1000) + 150; return job; }
    if (res.ok) {
      if (o.c) job.count[o.c] = (job.count[o.c] ?? 0) + 1;
      if (o.then) await store(env, o.then.s, o.then.a);
    } else {
      job.nerr++;
      if (job.errs.length < 8) job.errs.push(`${o.l ?? o.p} ${res.status} ${text.slice(0, 80)}`);
    }
    job.i++;
  }
  job.delay = 300;
  return job;
}

async function rendre(job, lines) {
  const content = lines.join("\n").slice(0, 1990);
  const r = await fetch(`${API}/webhooks/${job.app}/${job.token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
  await r.text();
}

// renvoie l'état suivant du travail, ou null quand il est fini
export async function etapeTravail(env, h, job) {
  try {
    if (!job.phase) {
      const prep = job.kind === "espaces-appliquer" ? await prepAppliquer(env, h) : job.kind === "espaces-restaurer" ? await prepRestaurer(env, h) : null;
      if (!prep) return null;
      return { ...job, ...prep, phase: "ops", i: 0, count: {}, errs: [], nerr: 0, delay: 300 };
    }
    if (job.phase === "ops") {
      await lot(env, job);
      if (job.i < job.queue.length) return job;
      job.phase = "fin";
      return job;
    }
    // fin: bilan, puis accueil commun si le cloisonnement est actif
    const lines = [...job.out];
    if (job.kind === "espaces-appliquer") lines.push(...bilanAppliquer(job), ...(await publierAccueil(env, h)));
    if (job.nerr) lines.push(`⚠️ ${job.nerr} appel${job.nerr > 1 ? "s" : ""} refusé${job.nerr > 1 ? "s" : ""}`, ...job.errs.map((e) => `· ${e}`));
    await rendre(job, lines);
    return null;
  } catch (e) {
    await rendre(job, [...(job.out ?? []), `❌ ${e.message}`]).catch(() => {});
    throw e;
  }
}
