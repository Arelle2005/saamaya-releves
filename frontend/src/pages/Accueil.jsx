import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";

const MS_JOUR = 24 * 60 * 60 * 1000;
const MAX_JOURS_PERIODE = 90;
const PERIODES_GRAPHE = [7, 30, 90];

/* ---------- Utilitaires de format et de dates ---------- */

const nombre = (valeur) => new Intl.NumberFormat("fr-FR").format(valeur ?? 0);

function formaterMontant(valeur) {
  if (valeur == null) return "—";
  return nombre(valeur) + " FCFA";
}

// Date locale au format AAAA-MM-JJ (évite le décalage d'un jour de toISOString)
function versISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

function debutJournee(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoVersDate(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j);
}

function nbJoursInclus(du, au) {
  return Math.round((isoVersDate(au) - isoVersDate(du)) / MS_JOUR) + 1;
}

function formaterDateCourte(iso) {
  return isoVersDate(iso).toLocaleDateString("fr-FR");
}

function dateRelative(valeur) {
  const d = new Date(valeur);
  const diffJours = Math.round((debutJournee(new Date()) - debutJournee(d)) / MS_JOUR);
  if (diffJours <= 0) return "Aujourd'hui";
  if (diffJours === 1) return "Hier";
  if (diffJours < 7) return `Il y a ${diffJours} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function salutation() {
  return new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";
}

/* ---------- Périodes d'export ---------- */

const PERIODES = [
  { cle: "aujourdhui", libelle: "Aujourd'hui" },
  { cle: "hier", libelle: "Hier" },
  { cle: "semaine", libelle: "7 derniers jours" },
  { cle: "mois", libelle: "Ce mois-ci" },
  { cle: "mois_dernier", libelle: "Mois dernier" },
  { cle: "perso", libelle: "Personnalisée" },
];

function calculerPeriode(cle) {
  const auj = debutJournee(new Date());
  if (cle === "aujourdhui") return { du: versISO(auj), au: versISO(auj) };
  if (cle === "hier") {
    const h = new Date(auj);
    h.setDate(h.getDate() - 1);
    return { du: versISO(h), au: versISO(h) };
  }
  if (cle === "semaine") {
    const d = new Date(auj);
    d.setDate(d.getDate() - 6);
    return { du: versISO(d), au: versISO(auj) };
  }
  if (cle === "mois") {
    return { du: versISO(new Date(auj.getFullYear(), auj.getMonth(), 1)), au: versISO(auj) };
  }
  if (cle === "mois_dernier") {
    return {
      du: versISO(new Date(auj.getFullYear(), auj.getMonth() - 1, 1)),
      au: versISO(new Date(auj.getFullYear(), auj.getMonth(), 0)),
    };
  }
  return null;
}

function validerPeriode(du, au) {
  if (!du || !au) return "Choisissez une date de début et une date de fin.";
  if (du > au) return "La date de début doit précéder la date de fin.";
  if (nbJoursInclus(du, au) > MAX_JOURS_PERIODE) {
    return `La période ne peut pas dépasser ${MAX_JOURS_PERIODE} jours.`;
  }
  return "";
}

/* ---------- Chargement des données ---------- */

async function lireJson(reponse) {
  if (!reponse.ok) throw new Error("Erreur de chargement");
  return reponse.json();
}

// Récupère les pages (20 par page), dans la limite de pageMax, pour alimenter les courbes
async function toutesLesPages(chemin, pageMax = 10) {
  let page = 1;
  let liste = [];
  let total = 0;
  while (page <= pageMax) {
    const donnees = await lireJson(await api(`${chemin}&page=${page}`));
    const lot = donnees.paiements || [];
    total = donnees.total || 0;
    liste = liste.concat(lot);
    if (liste.length >= total || lot.length === 0) break;
    page += 1;
  }
  return { paiements: liste, total };
}

// Évolution par rapport à la période précédente
function variation(actuel, precedent) {
  if (precedent == null) return null;
  if (precedent === 0) return actuel === 0 ? null : { nouveau: true };
  return { pct: Math.round(((actuel - precedent) / precedent) * 100) };
}

/* ---------- Géométrie des courbes (SVG, sans bibliothèque) ---------- */

// Transforme des valeurs en points dans un repère 0–100 (y inversé)
function projeter(valeurs, marge = 6, max = null) {
  const n = valeurs.length;
  const m = max ?? Math.max(...valeurs, 1);
  return valeurs.map((v, i) => ({
    x: n === 1 ? 50 : (i / (n - 1)) * 100,
    y: 100 - marge - (v / m) * (100 - 2 * marge),
  }));
}

// Courbe lissée sans dépassement : les tangentes restent horizontales aux points
function cheminLisse(pts) {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${mx} ${pts[i - 1].y}, ${mx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

/* ---------- Icônes et petits composants ---------- */

const BADGES = {
  CONFIRME: "bg-emerald-100 text-emerald-700 border-emerald-200",
  EN_ATTENTE: "bg-amber-100 text-amber-700 border-amber-200",
  REFUSE: "bg-red-100 text-red-700 border-red-200",
};

const LIBELLES_STATUT = {
  CONFIRME: "Confirmé",
  EN_ATTENTE: "En attente",
  REFUSE: "Refusé",
};

const ICONES = {
  argent:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  graphique:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  tendance: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  fleche: "M9 5l7 7-7 7",
  haut: "M5 15l7-7 7 7",
  bas: "M19 9l-7 7-7-7",
  telecharger: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4",
  horloge: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  alerte:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  document:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  envoi:
    "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  calendrier:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  valide: "M5 13l4 4L19 7",
  info: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function Icone({ nom, className = "h-4 w-4", epaisseur = 2 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={epaisseur}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONES[nom]} />
    </svg>
  );
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

function Pastille({ statut }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        BADGES[statut] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {LIBELLES_STATUT[statut] || statut}
    </span>
  );
}

function EtatVide({ titre, texte }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
      <p className="text-sm font-medium text-slate-600">{titre}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-400">{texte}</p>
    </div>
  );
}

/* ---------- Courbes ---------- */

// Mini-courbe d'une carte KPI
function Sparkline({ valeurs, couleur = "#F5A623" }) {
  const id = `sp${useId().replace(/:/g, "")}`;
  const sec = valeurs.length >= 2 ? valeurs : [0, 0];
  const pts = projeter(sec, 8);
  const ligne = cheminLisse(pts);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-12 w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity="0.28" />
          <stop offset="100%" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${ligne} L 100 100 L 0 100 Z`} fill={`url(#${id})`} />
      <path
        d={ligne}
        fill="none"
        stroke={couleur}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Grande courbe interactive (survol, toucher et flèches du clavier)
function GrapheCourbe({ etiquettes, details, series, titreAria, hauteur = 220 }) {
  const id = `gc${useId().replace(/:/g, "")}`;
  const n = etiquettes.length;
  const [actif, setActif] = useState(null);

  const max = Math.max(...series.flatMap((s) => s.valeurs), 1);
  const projections = series.map((s) => projeter(s.valeurs, 6, max));

  function indexDepuis(clientX, element) {
    const r = element.getBoundingClientRect();
    if (r.width === 0 || n === 0) return null;
    const ratio = (clientX - r.left) / r.width;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  }

  function surClavier(e) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActif((a) => (a == null ? 0 : Math.min(n - 1, a + 1)));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActif((a) => (a == null ? n - 1 : Math.max(0, a - 1)));
    } else if (e.key === "Escape") {
      setActif(null);
    }
  }

  const indicesAxe = n <= 2 ? [...new Set([0, n - 1])] : [0, Math.floor((n - 1) / 2), n - 1];
  const xActif = actif == null ? 0 : n === 1 ? 50 : (actif / (n - 1)) * 100;
  const xInfobulle = Math.min(86, Math.max(14, xActif));

  return (
    <div>
      <div
        role="img"
        aria-label={titreAria}
        tabIndex={0}
        style={{ height: hauteur }}
        className="relative w-full cursor-crosshair rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
        onMouseMove={(e) => setActif(indexDepuis(e.clientX, e.currentTarget))}
        onMouseLeave={() => setActif(null)}
        onTouchStart={(e) => setActif(indexDepuis(e.touches[0].clientX, e.currentTarget))}
        onTouchMove={(e) => setActif(indexDepuis(e.touches[0].clientX, e.currentTarget))}
        onKeyDown={surClavier}
        onBlur={() => setActif(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0].couleur} stopOpacity="0.25" />
              <stop offset="100%" stopColor={series[0].couleur} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1="0" x2="100" y1="100" y2="100" stroke="#CBD5E1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {n >= 2 && (
            <path d={`${cheminLisse(projections[0])} L 100 100 L 0 100 Z`} fill={`url(#${id})`} />
          )}
          {series.map((s, si) =>
            n >= 2 ? (
              <path
                key={s.libelle}
                d={cheminLisse(projections[si])}
                fill="none"
                stroke={s.couleur}
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null
          )}
        </svg>

        <span className="pointer-events-none absolute left-2 top-1 text-[11px] font-medium text-slate-400">
          {series[0].format(max)}
        </span>

        {actif != null && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-slate-300"
              style={{ left: `${xActif}%` }}
            />
            {series.map((s, si) => (
              <div
                key={s.libelle}
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{
                  left: `${xActif}%`,
                  top: `${projections[si][actif].y}%`,
                  backgroundColor: s.couleur,
                }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
              style={{ left: `${xInfobulle}%` }}
            >
              <p className="mb-1 font-semibold capitalize">{details[actif]}</p>
              {series.map((s) => (
                <p key={s.libelle} className="flex items-center gap-2 text-slate-200">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.couleur }} />
                  {s.libelle} : <strong className="text-white">{s.format(s.valeurs[actif])}</strong>
                </p>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex justify-between text-xs font-medium text-slate-500">
        {indicesAxe.map((i) => (
          <span key={i}>{etiquettes[i]}</span>
        ))}
      </div>

      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.libelle} className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.couleur }} />
              {s.libelle}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Cartes KPI ---------- */

const TEINTES = {
  vert: { fond: "bg-emerald-100", texte: "text-emerald-600" },
  bleu: { fond: "bg-blue-100", texte: "text-blue-600" },
  ambre: { fond: "bg-[#F5A623]/10", texte: "text-[#F5A623]" },
};

function Tendance({ v }) {
  if (!v) return null;
  if (v.nouveau) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
        Nouveau
      </span>
    );
  }
  if (v.pct === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        Stable
      </span>
    );
  }
  const hausse = v.pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        hausse ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      <Icone nom={hausse ? "haut" : "bas"} className="h-3 w-3" epaisseur={3} />
      {hausse ? "+" : ""}
      {v.pct} %
    </span>
  );
}

function CarteKpi({ titre, valeur, detail, icone, teinte, miseEnAvant = false, tendance, pied }) {
  const t = TEINTES[teinte];
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        miseEnAvant ? "border-[#F5A623]/40 ring-1 ring-[#F5A623]/20" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titre}</p>
        <div className={`rounded-full p-2 ${t.fond}`}>
          <Icone nom={icone} className={`h-4 w-4 ${t.texte}`} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{valeur}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Tendance v={tendance} />
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {pied && <div className="mt-4">{pied}</div>}
    </div>
  );
}

/* ---------- Export du relevé par période (marchand) ---------- */

class ErreurExport extends Error {}

function ExportReleve() {
  const aujourdhui = versISO(new Date());
  const [cle, setCle] = useState("mois");
  const [duPerso, setDuPerso] = useState(aujourdhui);
  const [auPerso, setAuPerso] = useState(aujourdhui);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const periode = useMemo(
    () => (cle === "perso" ? { du: duPerso, au: auPerso } : calculerPeriode(cle)),
    [cle, duPerso, auPerso]
  );
  const erreurPeriode = validerPeriode(periode.du, periode.au);

  async function exporter() {
    if (erreurPeriode) {
      setMessage({ type: "erreur", texte: erreurPeriode });
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await api(`/releve/export?du=${periode.du}&au=${periode.au}`);
      if (!reponse.ok) {
        let detail = "Impossible d'exporter le relevé.";
        try {
          const corps = await reponse.json();
          if (typeof corps.detail === "string") detail = corps.detail;
        } catch {
          /* corps non JSON : on garde le message par défaut */
        }
        throw new ErreurExport(detail);
      }
      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `releve_${periode.du}_${periode.au}.csv`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "succes", texte: "Votre relevé a été téléchargé." });
    } catch (e) {
      setMessage({
        type: "erreur",
        texte:
          e instanceof ErreurExport
            ? e.message
            : "Impossible d'exporter le relevé. Vérifiez votre connexion et réessayez.",
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#F5A623]/10 p-2.5">
          <Icone nom="telecharger" className="h-5 w-5 text-[#F5A623]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Exporter mon relevé</h3>
          <p className="mt-0.5 text-sm text-slate-500">Choisissez la période du fichier CSV.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Période du relevé">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            type="button"
            aria-pressed={cle === p.cle}
            onClick={() => {
              setCle(p.cle);
              setMessage(null);
            }}
            className={`min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] ${
              cle === p.cle
                ? "border-[#0F2A4A] bg-[#0F2A4A] text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p.libelle}
          </button>
        ))}
      </div>

      {cle === "perso" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Du
            <input
              type="date"
              value={duPerso}
              max={aujourdhui}
              onChange={(e) => {
                setDuPerso(e.target.value);
                setMessage(null);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-[#F5A623] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Au
            <input
              type="date"
              value={auPerso}
              max={aujourdhui}
              onChange={(e) => {
                setAuPerso(e.target.value);
                setMessage(null);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-[#F5A623] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
        </div>
      )}

      <div
        className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
          erreurPeriode ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
        }`}
      >
        <Icone nom={erreurPeriode ? "alerte" : "calendrier"} className="h-4 w-4 shrink-0" />
        {erreurPeriode ? (
          <span>{erreurPeriode}</span>
        ) : (
          <span>
            Du <strong>{formaterDateCourte(periode.du)}</strong> au{" "}
            <strong>{formaterDateCourte(periode.au)}</strong> · {nbJoursInclus(periode.du, periode.au)} jour(s)
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={exporter}
        disabled={enCours || Boolean(erreurPeriode)}
        aria-busy={enCours}
        className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2A4A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enCours ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A1628]/30 border-t-[#0A1628]" />
            Export en cours…
          </>
        ) : (
          <>
            <Icone nom="telecharger" className="h-4 w-4" />
            Exporter mon relevé (CSV)
          </>
        )}
      </button>

      {message && (
        <div
          role={message.type === "erreur" ? "alert" : "status"}
          className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
            message.type === "erreur"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <Icone nom={message.type === "erreur" ? "alerte" : "valide"} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message.texte}</span>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
        <Icone nom="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Un relevé couvre au plus {MAX_JOURS_PERIODE} jours. Les numéros des payeurs sont masqués dans le fichier.
        </span>
      </p>
    </div>
  );
}

/* ---------- Répartition des statuts (marchand) ---------- */

function RepartitionStatuts({ statuts, tronque }) {
  const total = statuts.CONFIRME + statuts.EN_ATTENTE + statuts.REFUSE;
  const lignes = [
    ["CONFIRME", "Confirmés", "bg-emerald-500"],
    ["EN_ATTENTE", "En attente", "bg-amber-500"],
    ["REFUSE", "Refusés", "bg-red-500"],
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="text-lg font-semibold text-slate-900">Répartition des paiements</h3>
      <p className="mt-1 text-sm text-slate-500">Par statut, sur la période choisie.</p>

      {total === 0 ? (
        <p className="mt-6 text-sm text-slate-400">Aucun paiement sur cette période.</p>
      ) : (
        <>
          <div
            className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${statuts.CONFIRME} confirmés, ${statuts.EN_ATTENTE} en attente, ${statuts.REFUSE} refusés`}
          >
            {lignes.map(([cle, , couleur]) =>
              statuts[cle] > 0 ? (
                <div key={cle} className={couleur} style={{ width: `${(statuts[cle] / total) * 100}%` }} />
              ) : null
            )}
          </div>
          <ul className="mt-5 space-y-3">
            {lignes.map(([cle, libelle, couleur]) => (
              <li key={cle} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${couleur}`} />
                  {libelle}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {nombre(statuts[cle])}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    ({Math.round((statuts[cle] / total) * 100)} %)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {tronque && (
        <p className="mt-4 flex items-start gap-2 text-xs text-amber-700">
          <Icone nom="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Répartition et courbes calculées sur les 200 paiements les plus récents de la période.
        </p>
      )}
    </div>
  );
}

/* ---------- Sélecteur de période du tableau de bord ---------- */

function SelecteurPeriode({ valeur, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Période affichée">
      {PERIODES_GRAPHE.map((j) => (
        <button
          key={j}
          type="button"
          aria-pressed={valeur === j}
          onClick={() => onChange(j)}
          className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] ${
            valeur === j ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {j} j
        </button>
      ))}
    </div>
  );
}

const METRIQUES = [
  { cle: "net", libelle: "Net", titre: "Net confirmé par jour" },
  { cle: "brut", libelle: "Brut", titre: "Montant brut confirmé par jour" },
  { cle: "count", libelle: "Paiements", titre: "Paiements confirmés par jour" },
];

/* ---------- Page ---------- */

export default function Accueil() {
  const { utilisateur } = useAuth();
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState("");
  const [donnees, setDonnees] = useState(null);
  const [jours, setJours] = useState(30);
  const [metrique, setMetrique] = useState("net");

  async function charger() {
    setErreur("");
    setRafraichit(true);
    try {
      const auj = debutJournee(new Date());

      if (utilisateur.role === "MARCHAND") {
        const debut = new Date(auj);
        debut.setDate(auj.getDate() - (jours - 1));
        const finPrec = new Date(debut);
        finPrec.setDate(debut.getDate() - 1);
        const debutPrec = new Date(finPrec);
        debutPrec.setDate(finPrec.getDate() - (jours - 1));

        const [courant, precedent, liste] = await Promise.all([
          api(`/releve?du=${versISO(debut)}&au=${versISO(auj)}`).then(lireJson),
          api(`/releve?du=${versISO(debutPrec)}&au=${versISO(finPrec)}`)
            .then(lireJson)
            .catch(() => null),
          toutesLesPages(`/paiements?du=${versISO(debut)}&au=${versISO(auj)}`),
        ]);

        // Une entrée par jour de la période, même sans paiement
        const serie = [];
        for (let i = 0; i < jours; i++) {
          const d = new Date(debut);
          d.setDate(debut.getDate() + i);
          serie.push({
            date: versISO(d),
            court: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
            long: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
            net: 0,
            brut: 0,
            count: 0,
          });
        }
        const parDate = new Map(serie.map((j) => [j.date, j]));
        const statuts = { CONFIRME: 0, EN_ATTENTE: 0, REFUSE: 0 };

        liste.paiements.forEach((p) => {
          if (statuts[p.statut] != null) statuts[p.statut] += 1;
          const jour = parDate.get(p.date_heure.slice(0, 10));
          if (jour && p.statut === "CONFIRME") {
            jour.net += p.net || 0;
            jour.brut += p.montant || 0;
            jour.count += 1;
          }
        });

        setDonnees({
          type: "MARCHAND",
          net: courant.net || 0,
          brut: courant.brut || 0,
          nbConfirmes: courant.nb_confirmes || 0,
          precedent: precedent
            ? {
                net: precedent.net || 0,
                brut: precedent.brut || 0,
                nb: precedent.nb_confirmes || 0,
              }
            : null,
          totalPaiements: liste.total,
          tronque: liste.paiements.length < liste.total,
          serie,
          statuts,
          dernierPaiements: liste.paiements.slice(0, 5),
        });
      } else {
        const importsData = await api("/imports").then(lireJson);
        let paiementsData = { total: 0, paiements: [] };
        try {
          paiementsData = await api("/paiements?page=1").then(lireJson);
        } catch {
          /* la liste des paiements est facultative sur le tableau de bord admin */
        }
        const dateImport = (h) => h.date ?? h.date_creation;
        const croissant = [...importsData].sort((a, b) => new Date(dateImport(a)) - new Date(dateImport(b)));
        setDonnees({
          type: "ADMIN",
          dernierImport: croissant[croissant.length - 1] || null,
          dateImport,
          totalImports: importsData.length,
          totalPaiements: paiementsData.total || 0,
          dernierPaiements: (paiementsData.paiements || []).slice(0, 5),
          imports: croissant.slice(-14),
        });
      }
    } catch {
      setErreur("Impossible de charger le tableau de bord.");
    } finally {
      setChargement(false);
      setRafraichit(false);
    }
  }

  useEffect(() => {
    charger();
  }, [utilisateur.role, jours]);

  if (chargement) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (erreur) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-12 text-center"
      >
        <Icone nom="alerte" className="mb-4 h-12 w-12 text-red-500" epaisseur={1.5} />
        <h3 className="text-lg font-semibold text-slate-900">Erreur de chargement</h3>
        <p className="mt-2 text-sm text-slate-600">{erreur}</p>
        <button
          onClick={charger}
          className="mt-4 min-h-[44px] rounded-lg bg-[#F5A623] px-5 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a]"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const metriqueActive = METRIQUES.find((m) => m.cle === metrique);
  const tauxSucces =
    donnees.type === "MARCHAND" && donnees.totalPaiements > 0
      ? Math.round((donnees.nbConfirmes / donnees.totalPaiements) * 100)
      : 0;

  return (
    <div className={`space-y-6 transition-opacity ${rafraichit ? "opacity-60" : "opacity-100"}`}>
      {/* En-tête de bienvenue */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A1628] to-[#0F2A4A] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[#F5A623]/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium capitalize text-slate-300">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              {salutation()}, {utilisateur.identifiant}
              {utilisateur.role === "MARCHAND" && utilisateur.code_marchand && (
                <span className="ml-2 text-base font-normal text-slate-300">({utilisateur.code_marchand})</span>
              )}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {utilisateur.role === "MARCHAND"
                ? `Voici un aperçu de votre activité sur les ${jours} derniers jours.`
                : "Gérez les imports et consultez l'activité de la plateforme."}
            </p>
          </div>
          <Link
            to={utilisateur.role === "MARCHAND" ? "/marchand/releve" : "/admin/import"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] sm:self-auto"
          >
            {utilisateur.role === "MARCHAND" ? "Voir mes paiements" : "Importer un fichier"}
            <Icone nom="fleche" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {donnees.type === "MARCHAND" && (
        <>
          {/* Sélecteur de période */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Du <strong className="text-slate-700">{formaterDateCourte(donnees.serie[0].date)}</strong> au{" "}
              <strong className="text-slate-700">
                {formaterDateCourte(donnees.serie[donnees.serie.length - 1].date)}
              </strong>
            </p>
            <SelecteurPeriode valeur={jours} onChange={setJours} />
          </div>

          {/* Cartes KPI avec mini-courbes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CarteKpi
              titre="Net à recevoir"
              valeur={formaterMontant(donnees.net)}
              detail={`vs ${jours} j précédents`}
              tendance={variation(donnees.net, donnees.precedent?.net)}
              icone="argent"
              teinte="vert"
              miseEnAvant
              pied={<Sparkline valeurs={donnees.serie.map((j) => j.net)} couleur="#F5A623" />}
            />
            <CarteKpi
              titre="Brut encaissé"
              valeur={formaterMontant(donnees.brut)}
              detail={`vs ${jours} j précédents`}
              tendance={variation(donnees.brut, donnees.precedent?.brut)}
              icone="graphique"
              teinte="bleu"
              pied={<Sparkline valeurs={donnees.serie.map((j) => j.brut)} couleur="#2563EB" />}
            />
            <CarteKpi
              titre="Paiements confirmés"
              valeur={nombre(donnees.nbConfirmes)}
              detail={`vs ${jours} j précédents`}
              tendance={variation(donnees.nbConfirmes, donnees.precedent?.nb)}
              icone="valide"
              teinte="ambre"
              pied={<Sparkline valeurs={donnees.serie.map((j) => j.count)} couleur="#059669" />}
            />
            <CarteKpi
              titre="Taux de succès"
              valeur={`${tauxSucces} %`}
              detail={`${nombre(donnees.nbConfirmes)} sur ${nombre(donnees.totalPaiements)} paiement(s)`}
              icone="tendance"
              teinte="ambre"
              pied={
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={tauxSucces}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Taux de succès"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#F5A623]/70 to-[#F5A623] transition-all duration-500"
                    style={{ width: `${tauxSucces}%` }}
                  />
                </div>
              }
            />
          </div>

          {/* Grande courbe + export */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{metriqueActive.titre}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Survolez (ou touchez) la courbe pour voir le détail d'une journée.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Indicateur affiché">
                  {METRIQUES.map((m) => (
                    <button
                      key={m.cle}
                      type="button"
                      aria-pressed={metrique === m.cle}
                      onClick={() => setMetrique(m.cle)}
                      className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] ${
                        metrique === m.cle ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {m.libelle}
                    </button>
                  ))}
                </div>
              </div>

              {donnees.serie.every((j) => j[metrique] === 0) ? (
                <div className="flex h-56 flex-col items-center justify-center text-center">
                  <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
                  <p className="text-sm font-medium text-slate-600">Aucun paiement confirmé sur cette période</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Les paiements importés par l'administrateur apparaîtront ici.
                  </p>
                </div>
              ) : (
                <GrapheCourbe
                  etiquettes={donnees.serie.map((j) => j.court)}
                  details={donnees.serie.map((j) => j.long)}
                  titreAria={`${metriqueActive.titre} sur ${jours} jours`}
                  series={[
                    {
                      libelle: metriqueActive.libelle,
                      couleur: "#F5A623",
                      valeurs: donnees.serie.map((j) => j[metrique]),
                      format: metrique === "count" ? (v) => `${nombre(v)} paiement(s)` : formaterMontant,
                    },
                  ]}
                />
              )}
            </div>

            <ExportReleve />
          </div>

          {/* Dernières transactions + répartition */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
                <h3 className="text-lg font-semibold text-slate-900">Dernières transactions</h3>
                <Link
                  to="/marchand/releve"
                  className="text-sm font-semibold text-[#F5A623] transition-colors hover:text-[#e0951a]"
                >
                  Voir tout →
                </Link>
              </div>

              {donnees.dernierPaiements.length === 0 ? (
                <EtatVide
                  titre="Aucun paiement sur cette période"
                  texte="Essayez une période plus large, ou attendez le prochain import de l'administrateur."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {donnees.dernierPaiements.map((p) => (
                    <div
                      key={p.reference}
                      className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:px-8"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.reference}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Pastille statut={p.statut} />
                          <span className="text-xs text-slate-500">{dateRelative(p.date_heure)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-900">{formaterMontant(p.net)}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-slate-400">
                          Payé : {formaterMontant(p.montant)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <RepartitionStatuts statuts={donnees.statuts} tronque={donnees.tronque} />
          </div>
        </>
      )}

      {donnees.type === "ADMIN" && (
        <>
          {/* Cartes KPI Admin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dernier import</p>
              {donnees.dernierImport ? (
                <>
                  <p className="mt-3 text-2xl font-bold text-slate-900">
                    {dateRelative(donnees.dateImport(donnees.dernierImport))}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {nombre(donnees.dernierImport.lignes_importees)} importées ·{" "}
                    {nombre(donnees.dernierImport.lignes_rejetees)} rejetées
                  </p>
                </>
              ) : (
                <p className="mt-3 text-lg text-slate-400">Aucun import</p>
              )}
            </div>
            <CarteKpi
              titre="Total des imports"
              valeur={nombre(donnees.totalImports)}
              detail="Fichiers CSV traités"
              icone="envoi"
              teinte="ambre"
              pied={
                donnees.imports.length >= 2 ? (
                  <Sparkline valeurs={donnees.imports.map((h) => h.lignes_importees || 0)} couleur="#F5A623" />
                ) : null
              }
            />
            <CarteKpi
              titre="Paiements en base"
              valeur={nombre(donnees.totalPaiements)}
              detail="Transactions enregistrées"
              icone="graphique"
              teinte="bleu"
            />
          </div>

          {/* Courbe d'évolution des imports */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900">Évolution des imports</h3>
            <p className="mt-1 mb-5 text-sm text-slate-500">
              Résultat de vos {donnees.imports.length} derniers imports, du plus ancien au plus récent.
            </p>
            {donnees.imports.length < 2 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
                <p className="text-sm font-medium text-slate-600">Pas encore assez de données</p>
                <p className="mt-1 text-xs text-slate-400">Au moins deux imports sont nécessaires pour tracer une courbe.</p>
              </div>
            ) : (
              <GrapheCourbe
                etiquettes={donnees.imports.map((h) =>
                  new Date(donnees.dateImport(h)).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
                )}
                details={donnees.imports.map((h) =>
                  new Date(donnees.dateImport(h)).toLocaleString("fr-FR", {
                    timeZone: "Africa/Douala",
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                )}
                titreAria="Évolution des lignes importées, déjà présentes et rejetées par import"
                series={[
                  {
                    libelle: "Importées",
                    couleur: "#F5A623",
                    valeurs: donnees.imports.map((h) => h.lignes_importees || 0),
                    format: nombre,
                  },
                  {
                    libelle: "Déjà présentes",
                    couleur: "#2563EB",
                    valeurs: donnees.imports.map((h) => h.lignes_deja_presentes || 0),
                    format: nombre,
                  },
                  {
                    libelle: "Rejetées",
                    couleur: "#DC2626",
                    valeurs: donnees.imports.map((h) => h.lignes_rejetees || 0),
                    format: nombre,
                  },
                ]}
              />
            )}
          </div>

          {/* Accès rapides Admin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              to="/admin/import"
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F5A623]/30 hover:shadow-md"
            >
              <div className="rounded-xl bg-[#F5A623]/10 p-3 transition-colors group-hover:bg-[#F5A623]/20">
                <Icone nom="envoi" className="h-5 w-5 text-[#F5A623]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Importer un CSV</p>
                <p className="mt-0.5 text-xs text-slate-500">Ajouter des paiements</p>
              </div>
              <Icone
                nom="fleche"
                className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#F5A623]"
              />
            </Link>

            <Link
              to="/admin/historique"
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F5A623]/30 hover:shadow-md"
            >
              <div className="rounded-xl bg-blue-100 p-3 transition-colors group-hover:bg-blue-200">
                <Icone nom="horloge" className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Historique des imports</p>
                <p className="mt-0.5 text-xs text-slate-500">Consulter les traitements</p>
              </div>
              <Icone
                nom="fleche"
                className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600"
              />
            </Link>
          </div>

          {/* Dernières transactions globales */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 sm:px-8">
              <h3 className="text-lg font-semibold text-slate-900">Dernières transactions</h3>
            </div>
            {donnees.dernierPaiements.length === 0 ? (
              <EtatVide
                titre="Aucune transaction en base"
                texte="Importez un fichier CSV pour commencer à alimenter la plateforme."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {donnees.dernierPaiements.map((p) => (
                  <div
                    key={p.reference}
                    className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:px-8"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.reference}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Pastille statut={p.statut} />
                        <span className="text-xs text-slate-500">
                          Marchand {p.code_marchand} · {dateRelative(p.date_heure)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{formaterMontant(p.montant)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}