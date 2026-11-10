"use client";
// Human Quest · The Path: React parts of the family look (kit v1, 4 Nov 2026).
// Pair with hq-path.css. Every product site uses the same questbar, hero landscape and footer,
// coloured by its own territory. Logos load from the hub so the family list stays in one place.
import { useEffect, useState, type ReactNode } from "react";

export type HqTerritory = "practice" | "learning" | "planning" | "growth" | "tools" | "pattern";

export const HQ_HUB = "https://www.humanquest.net";

export const HQ_TERRITORIES: Record<HqTerritory, string> = {
  practice: "Practice & wellbeing",
  learning: "Learning & discovery",
  planning: "Planning & work",
  growth: "Personal growth",
  tools: "Tools & play",
  pattern: "AI patterns",
};

export const HQ_FAMILY: { name: string; url: string; logo: string; t: HqTerritory }[] = [
  { name: "Calendar Clarity", url: "https://calendarclarity.app", logo: "calendarcolor.svg", t: "planning" },
  { name: "Inner Quest", url: "https://innerquest.app", logo: "innerquest.svg", t: "growth" },
  { name: "Leela Quest", url: "https://leela.quest", logo: "leelaquest.svg", t: "growth" },
  { name: "Stack Quest", url: "https://stackquest.dev", logo: "stackquest.svg", t: "learning" },
  { name: "Yoga Quest", url: "https://yogaquest.app", logo: "yogaquest.png", t: "practice" },
  { name: "Handstand Quest", url: "https://www.handstandquest.com", logo: "handstandquest.png", t: "practice" },
  { name: "System Designer", url: "https://systemdesigner.net", logo: "systemdesigner.svg", t: "learning" },
  { name: "Plan Quest", url: "https://plans.quest", logo: "planquest.svg", t: "planning" },
  { name: "DoneOS", url: "https://doneos.net", logo: "doneos.png", t: "planning" },
  { name: "RTS AI", url: "https://rtsai.net", logo: "rtsai.png", t: "tools" },
  { name: "Scribe Quest", url: "https://scribe-quest.com", logo: "scribequest.svg", t: "planning" },
  { name: "Polytyper", url: "https://polytyper.com", logo: "polytyper.svg", t: "learning" },
  { name: "Globe Quest", url: "https://globequest.app", logo: "globequest.svg", t: "learning" },
  { name: "Qatar Atlas", url: "https://qatar.humanquest.net", logo: "qataratlas.svg", t: "learning" },
  { name: "Tinkerstage", url: "https://tinkerstage.com", logo: "tinkerstage.svg", t: "tools" },
  { name: "Autobounds", url: "https://autobounds.com", logo: "autobounds.svg", t: "tools" },
  { name: "Narrate", url: "https://narrate.humanquest.net", logo: "narrate.png", t: "pattern" },
  { name: "Console", url: "https://console.humanquest.net", logo: "hangar.png", t: "pattern" },
  { name: "Feedback", url: "https://feedback.humanquest.net", logo: "feedback.svg", t: "pattern" },
  { name: "Walkthroughs", url: "https://walkthrough.humanquest.net", logo: "walkthrough.svg", t: "pattern" },
  { name: "Openstage", url: "https://openstage.humanquest.net", logo: "openstage.png", t: "pattern" },
  { name: "MCP", url: "https://mcp.humanquest.net", logo: "mcp.svg", t: "pattern" },
];

// Family logos live on the hub, in the order above (most important first). A local preview can
// load them from a local hub instead by building with NEXT_PUBLIC_HQ_LOGOS (e.g. http://localhost:4101/logos).
const LOGOS = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HQ_LOGOS) || `${HQ_HUB}/logos`;
// Bump when a logo file changes: the hub caches /logos/* for a year, so a changed file needs a new address.
const LOGO_V = "20261108";
const logoUrl = (file: string) => `${LOGOS}/${file}?v=${LOGO_V}`;

/** Sets day or night before first paint. Put it in <head> (or first in <body>). */
export function HqThemeScript() {
  const js = `try{var t=localStorage.getItem("hq-theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day";document.documentElement.dataset.theme=t}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/** The moon button: day ⇄ night, remembered across every Human Quest site on this browser. */
export function HqThemeToggle({ onChange }: { onChange?: (night: boolean) => void }) {
  const [night, setNight] = useState(false);
  useEffect(() => setNight(document.documentElement.dataset.theme === "night"), []);
  const flip = () => {
    const next = !night;
    document.documentElement.dataset.theme = next ? "night" : "day";
    try { localStorage.setItem("hq-theme", next ? "night" : "day"); } catch {}
    setNight(next);
    onChange?.(next);
  };
  return (
    <button type="button" className="hqp-theme" onClick={flip} aria-label={night ? "Switch to day" : "Switch to night"} title={night ? "Day" : "Night"}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><g className="hqp-sunicon"><circle cx="12" cy="12" r="4.6" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" /></g><path className="hqp-moonicon" d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z" /></svg>
    </button>
  );
}

type Link = { label: string; href: string };

/** The family top bar: product mark, the territory chip that leads home, nav, night button, one call to action. */
export function HqQuestbar({ product, logo, href = "/", territory, links = [], cta, theme = true, onTheme }: {
  product: string; logo: string; href?: string; territory: HqTerritory; links?: Link[]; cta?: Link; theme?: boolean; onTheme?: (night: boolean) => void;
}) {
  return (
    <header className="hqp-questbar" data-hqp-t={territory}>
      <a className="hqp-mark" href={href}><img src={logo} alt="" />{product}</a>
      <a className="hqp-family" href={HQ_HUB} title="Part of Human Quest"><img src={logoUrl("humanquest.svg")} alt="" />Human Quest · {HQ_TERRITORIES[territory].split(" & ")[0]}</a>
      <nav className="hqp-nav">{links.map((l) => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}</nav>
      {theme && <HqThemeToggle onChange={onTheme} />}
      {links.length > 0 && (
        <details className="hqp-menu"><summary>Menu</summary>
          <div>{links.map((l) => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}{cta && <a href={cta.href}>{cta.label}</a>}<a href={HQ_HUB}>Human Quest</a></div>
        </details>
      )}
      {cta && <a className="hqp-btn hqp-btn-ember hqp-btn-cta" href={cta.href}>{cta.label}</a>}
    </header>
  );
}

/** Hills in the site's territory colour, with the road climbing to the product and a small walker on it. */
export function HqHills({ walker = true, className = "hqp-hills" }: { walker?: boolean; className?: string }) {
  const road = "M 520 262 C 610 228, 880 236, 850 200 S 610 160, 740 128 S 960 104, 1000 78";
  return (
    <svg className={className} viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path style={{ fill: "color-mix(in srgb, var(--hqp-t) 38%, var(--hqp-paper))" }} d="M0 118 C 220 80, 420 108, 640 96 S 1060 42, 1260 74 S 1420 70, 1440 66 L1440 240 L0 240Z" />
      <path style={{ fill: "color-mix(in srgb, var(--hqp-t) 68%, var(--hqp-paper))" }} d="M0 160 C 260 128, 520 156, 760 146 S 1180 112, 1440 138 L1440 240 L0 240Z" />
      <path style={{ fill: "var(--hqp-t)" }} d="M0 204 C 300 180, 640 200, 920 192 S 1300 174, 1440 188 L1440 240 L0 240Z" />
      <path className="hqp-road" d={road} strokeWidth="11" />
      {walker && (
        <g>
          <circle r="7" fill="var(--hqp-ember)" /><circle r="3" fill="#fff" />
          <animateMotion dur="26s" repeatCount="indefinite" path={road} />
        </g>
      )}
    </svg>
  );
}

/** A real product screen in a light browser frame. */
export function HqScreen({ src, alt, video }: { src: string; alt: string; video?: boolean }) {
  return (
    <div className="hqp-screen">
      <div className="hqp-chrome"><i /><i /><i /></div>
      {video ? <video src={src} autoPlay muted loop playsInline aria-label={alt} /> : <img src={src} alt={alt} />}
    </div>
  );
}

/** A real phone screen in a dark frame. */
export function HqPhone({ src, alt, video }: { src: string; alt: string; video?: boolean }) {
  return <div className="hqp-phone">{video ? <video src={src} autoPlay muted loop playsInline aria-label={alt} /> : <img src={src} alt={alt} />}</div>;
}

/** The hero: words on the left, the product under its sun on the right, hills and road below. */
export function HqHero({ territory, eyebrow, title, lede, actions, art, children }: {
  territory: HqTerritory; eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; actions?: ReactNode; art: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="hqp-hero" data-hqp-t={territory}>
      <div className="hqp-hero-grid">
        <div className="hqp-hero-copy">
          {eyebrow && <p className="hqp-eyebrow">{eyebrow}</p>}
          <h1 className="hqp-display">{title}</h1>
          {lede && <p className="hqp-lede">{lede}</p>}
          {actions && <div className="hqp-ctas">{actions}</div>}
          {children}
        </div>
        <div className="hqp-hero-art"><div className="hqp-hero-sun" />{art}</div>
      </div>
      <HqHills />
    </section>
  );
}

/** Numbered stones on a dashed trail: how it works, in three to five steps. */
export function HqStones({ steps }: { steps: { title: string; text: ReactNode }[] }) {
  return (
    <div className="hqp-stones" style={{ ["--hqp-n" as string]: steps.length }}>
      {steps.map((s, i) => <div className="hqp-stone" key={s.title}><b>{i + 1}</b><h3>{s.title}</h3><p>{s.text}</p></div>)}
    </div>
  );
}

/** The sun setting behind the hills: put it right above the footer. */
export function HqSunset({ sunX = 1060 }: { sunX?: number }) {
  return (
    <svg className="hqp-sunset" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle className="hqp-s" cx={sunX} cy="190" r="120" />
      <path className="hqp-h1" d="M0 150 C 240 110, 420 140, 640 128 S 1060 96, 1260 120 S 1400 112, 1440 116 L1440 220 L0 220Z" />
      <path className="hqp-h2" d="M0 182 C 260 150, 520 176, 760 170 S 1180 146, 1440 166 L1440 220 L0 220Z" />
      <path className="hqp-h3" d="M0 210 C 300 186, 640 204, 920 198 S 1300 186, 1440 196 L1440 220 L0 220Z" />
    </svg>
  );
}

/** The family footer: one line, every quest's logo, and the way home. */
export function HqFamilyFooter({ current, territory, extra }: { current: string; territory: HqTerritory; extra?: Link[] }) {
  const where = HQ_TERRITORIES[territory];
  return (
    <footer className="hqp-foot">
      <div className="hqp-foot-in">
        <div className="hqp-foot-top">
          <div><p className="hqp-eyebrow">A Human Quest</p><p className="hqp-display">Every quest needs a path.</p></div>
          <div className="hqp-foot-logos">
            {HQ_FAMILY.map((q) => (
              <a key={q.name} href={q.url} title={q.name} className={q.name === current ? "hqp-here" : undefined}><img src={logoUrl(q.logo)} alt={q.name} loading="lazy" /></a>
            ))}
          </div>
        </div>
        <div className="hqp-foot-cols">
          <div><b>{current}</b><p>{territory === "pattern" ? `${current} is one of the AI patterns every Human Quest is built with.` : `${current} is a Human Quest in ${where}.`}</p>
            {extra?.map((l) => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}</div>
          <div><b>Quests</b>{(Object.keys(HQ_TERRITORIES) as HqTerritory[]).filter((t) => t !== "pattern").map((t) => (
            <a key={t} href={`${HQ_HUB}/#t-${t}`} data-hqp-t={t}><span className="hqp-dot" />{HQ_TERRITORIES[t]}</a>
          ))}</div>
          <div><b>AI patterns</b>{HQ_FAMILY.filter((q) => q.t === "pattern").map((q) => <a key={q.name} href={q.url}>{q.name}</a>)}</div>
          <div><b>Human Quest</b><a href={HQ_HUB}>Home</a><a href={`${HQ_HUB}/about`}>About</a><a href={`${HQ_HUB}/#hello`}>Say hello</a></div>
        </div>
        <small>{current.toUpperCase()} · A HUMAN QUEST · DOHA · {new Date().getFullYear()}</small>
      </div>
    </footer>
  );
}
