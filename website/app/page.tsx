'use client';

import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  ExternalLink,
  LockKeyhole,
  MessageSquare,
  Mic,
  Minus,
  MousePointer2,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Terminal,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeedbackWidget } from '@/components/feedback-widget';
import {
  HQ_HUB,
  HqFamilyFooter,
  HqHero,
  HqHills,
  HqQuestbar,
  HqStones,
  HqSunset,
} from '@/components/hq-path/hq-path';

const repo = 'https://github.com/alibad/feedback-widget';
const install =
  '/plugin marketplace add alibad/feedback-widget\n/plugin install feedback-widget@feedback-widget';

const mobileApps = [
  {
    id: 'stack',
    name: 'Stack Quest',
    logo: 'stackquest.svg',
    appUrl: 'https://app.stackquest.dev/?feedback_demo=1',
    note: 'Live Flutter app · interactive',
    feedbackPath: 'Open Settings → Send feedback, or report a problem from an exercise.',
  },
  {
    id: 'doneos',
    name: 'DoneOS',
    logo: 'doneos.png',
    appUrl: 'https://app.doneos.net/?feedback_demo=1',
    note: 'Live Flutter app · sign-in required',
    feedbackPath: 'Sign in, then use the floating help button or Account → Send feedback.',
  },
  {
    id: 'leela',
    name: 'Leela Quest',
    logo: 'leelaquest.svg',
    appUrl: 'https://app.leelaquest.com/?debug=true&feedback_demo=1#/home',
    note: 'Live Flutter app · interactive',
    feedbackPath: 'Open the app menu and choose Send feedback.',
  },
  {
    id: 'yoga',
    name: 'Yoga Quest',
    logo: 'yogaquest.png',
    appUrl: 'https://studio.yogaquest.app/?feedback_demo=1',
    note: 'Live Flutter studio · interactive',
    feedbackPath: 'Open Settings → Help and turn on the feedback button.',
  },
  {
    id: 'scribe',
    name: 'Scribe Quest',
    logo: 'scribequest.svg',
    appUrl: 'https://app.scribe-quest.com/?feedback_demo=1',
    note: 'Live Flutter app · interactive',
    feedbackPath: 'Use Account → Send feedback; tester builds also show the floating trigger.',
  },
] as const;

const mobileFleet = [
  { name: 'Stack Quest', capabilities: ['Screenshot + annotation', 'Dictation', 'Voice', 'Recording'] },
  { name: 'DoneOS', capabilities: ['Screenshot + annotation', 'Recording', 'Durable outbox'] },
  { name: 'Leela Quest', capabilities: ['Screenshot + annotation', 'Dictation', 'Voice', 'Offline outbox'] },
  { name: 'Cold Club', capabilities: ['Screenshot + annotation', 'Voice', 'Recording', 'Diagnostics'] },
  { name: 'Yoga Quest', capabilities: ['Screenshot + annotation', 'Dictation', 'Voice', 'Recording'] },
  { name: 'Scribe Quest', capabilities: ['Screenshot + annotation', 'Attachments', 'Categories'] },
] as const;

// Chapters of the real walkthrough video; each still is a frame of that video.
const chapters = [
  { n: '01', title: 'Describe', text: 'Text or voice, straight into the field.', shot: 'describe', at: 6.6 },
  { n: '02', title: 'Select', text: 'Point at one exact element. No page text taken.', shot: 'select', at: 15.9 },
  { n: '03', title: 'Annotate', text: 'Arrows, shapes and labels on a screenshot.', shot: 'annotate', at: 25.6 },
  { n: '04', title: 'Review', text: 'See everything before anything is shared.', shot: 'review', at: 46.0 },
] as const;

const time = (s: number) => `0:${String(Math.floor(s)).padStart(2, '0')}`;

/** Opens the real widget, exactly as its own "Give feedback" button does. */
function openRealWidget() {
  document
    .querySelector<HTMLButtonElement>('#feedback-widget-root .feedback-launcher')
    ?.click();
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied!');
    } catch {
      setStatus('Select and copy the text below.');
    }
  }
  return (
    <div className="copy-control">
      <Button
        variant="ghost"
        className="copy-button"
        onClick={copy}
        aria-label={label}
      >
        {status === 'Copied!' ? <Check size={16} /> : <Copy size={16} />}
        {status === 'Copied!' ? 'Copied' : 'Copy'}
      </Button>
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  );
}

/** The hero picture: an app, its own feedback widget, and the issue it files. */
function WidgetArt() {
  return (
    <figure className="fw-art">
      <div className="fw-art-in" aria-hidden="true">
        <div className="hqp-screen fw-app">
          <div className="hqp-chrome">
            <i />
            <i />
            <i />
            <span>your-app / settings</span>
          </div>
          <div className="fw-app-body">
            <div className="fw-app-main">
              <h4>Account settings</h4>
              <span className="fw-lbl">Display name</span>
              <div className="fw-app-field">
                <i />
              </div>
              <span className="fw-lbl fw-app-more">Email</span>
              <div className="fw-app-field fw-app-more">
                <i />
              </div>
              <span className="fw-app-save">
                Save changes
                <em>Selected element</em>
              </span>
            </div>
          </div>
        </div>

        <div className="fw-dialog">
          <div className="fw-dlg-head">
            <strong>Send feedback</strong>
            <span>
              <Minus size={15} />
              <X size={15} />
            </span>
          </div>
          <p className="fw-dlg-sub">Tell us, show us, or record what happened.</p>
          <div className="fw-dlg-row">
            Category
            <span className="fw-select">
              Bug report <ChevronDown size={13} />
            </span>
          </div>
          <span className="fw-dlg-label">Summary</span>
          <div className="fw-dlg-input">
            The save button stays disabled <Mic size={14} />
          </div>
          <span className="fw-dlg-label">What happened?</span>
          <div className="fw-dlg-input fw-area">
            I changed my display name, but couldn’t save the update.
            <Mic size={14} />
          </div>
          <div className="fw-dlg-tools">
            <span>
              <Camera size={13} /> Screenshot
            </span>
            <span className="on">
              <MousePointer2 size={13} /> Element
            </span>
            <span>
              <Video size={13} /> Record
            </span>
          </div>
          <div className="fw-dlg-send">
            Review feedback <ArrowRight size={15} />
          </div>
        </div>

        <div className="fw-issue">
          <span className="fw-issue-icon">
            <CircleDot size={18} />
          </span>
          <div>
            <small>Filed in your tracker</small>
            <b>[feedback] Bug report: The save button stays disabled</b>
            <span>GitHub or Linear · delivered by your backend</span>
          </div>
        </div>
      </div>
      <figcaption className="fw-art-cap">
        Drawn from the real widget. Open the real one with “Give feedback”.
      </figcaption>
    </figure>
  );
}

function MobileShowcase() {
  const [selectedId, setSelectedId] = useState<(typeof mobileApps)[number]['id']>('stack');
  const [frameKey, setFrameKey] = useState(0);
  const selected = mobileApps.find((app) => app.id === selectedId) ?? mobileApps[0];

  function selectApp(id: (typeof mobileApps)[number]['id']) {
    setSelectedId(id);
  }

  function reloadFrame() {
    setFrameKey((key) => key + 1);
  }

  return (
    <section
      id="mobile-apps"
      className="mobile-showcase hqp-section"
      aria-labelledby="mobile-showcase-title"
      data-feedback-label="Mobile app showcase"
    >
      <div className="hqp-inner">
        <div className="hqp-head">
          <div>
            <p className="hqp-eyebrow">Live embeds, not captures</p>
            <h2 id="mobile-showcase-title" className="hqp-display">
              Tap the real product.
              <br />
              Open its <em>real feedback.</em>
            </h2>
          </div>
          <p className="hqp-lede">
            The phone is a live iframe, not a screenshot. Scroll it, sign in when needed, and use
            each product&apos;s own feedback controls without leaving this page.
          </p>
        </div>

        <div className="mobile-stage">
          <div className="mobile-app-picker" role="tablist" aria-label="Flutter mobile apps">
            {mobileApps.map((app) => (
              <button
                key={app.id}
                type="button"
                role="tab"
                aria-selected={selected.id === app.id}
                aria-controls="mobile-app-frame"
                onClick={() => selectApp(app.id)}
              >
                <img src={`${HQ_HUB}/logos/${app.logo}`} alt="" width={40} height={40} />
                <span>{app.name}</span>
                <small>{app.note}</small>
              </button>
            ))}
            <div className="mobile-feedback-path" aria-live="polite">
              <strong>Find feedback</strong>
              <span>{selected.feedbackPath}</span>
            </div>
            <a href={selected.appUrl} target="_blank" rel="noreferrer">
              Open {selected.name} in a full tab <ExternalLink size={14} />
            </a>
            <p>
              These are production URLs. Authentication and submitted feedback stay with the embedded product.
            </p>
          </div>

          <div className="phone-demo-wrap">
            <div className="phone-demo" aria-label={`${selected.name} mobile app in a phone frame`}>
              <div className="phone-demo-toolbar">
                <span><i aria-hidden="true" /> Live · {selected.name}</span>
                <button type="button" onClick={reloadFrame} aria-label={`Reload embedded ${selected.name}`}>
                  <RefreshCw size={14} />
                </button>
              </div>
              <iframe
                id="mobile-app-frame"
                key={`${selected.id}-${frameKey}`}
                src={selected.appUrl}
                title={`${selected.name} interactive production app`}
                allow="camera; microphone; display-capture; clipboard-read; clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <div className="phone-demo-home" aria-hidden="true" />
            </div>
            <p><Smartphone size={15} /> Interactive production surface · clicks and scrolling enabled</p>
          </div>
          <HqHills walker={false} className="hqp-hills fw-stage-hills" />
        </div>

        <div className="fleet-grid" aria-label="Feedback capabilities across six mobile apps">
          {mobileFleet.map((app) => (
            <article key={app.name}>
              <h3>{app.name}</h3>
              <ul>
                {app.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <p className="fleet-note">
          Six shipped implementations, audited from source. The exact feature mix follows each product’s
          risk, platform, and workflow; credentials stay server-side in every case.
        </p>
      </div>
    </section>
  );
}

export default function Home() {
  const demo = useRef<HTMLVideoElement>(null);

  function playFrom(at: number) {
    const video = demo.current;
    if (!video) return;
    video.currentTime = at;
    void video.play().catch(() => {});
    video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="hqp-page fw-page">
        <HqQuestbar
          product="Feedback Widget"
          logo="/favicon.svg"
          territory="pattern"
          links={[
            { label: 'How it works', href: '#how-it-works' },
            { label: 'Mobile apps', href: '#mobile-apps' },
            { label: 'Privacy', href: '#privacy' },
            { label: 'GitHub', href: repo },
          ]}
          cta={{ label: 'Install the skill', href: '#install' }}
        />

        <main id="main">
          <div data-feedback-label="Hero introduction">
            <HqHero
              territory="pattern"
              eyebrow="Open source · MIT license"
              title={
                <>
                  Better bug reports.
                  <br />
                  Built into <em>your app.</em>
                </>
              }
              lede="Give your coding assistant the skill to build a feedback flow that feels native to your product. Useful reports. Your infrastructure. GitHub or Linear."
              actions={
                <>
                  <a className="hqp-btn hqp-btn-solid" href="#install">
                    Install the skill <ArrowDown size={17} />
                  </a>
                  <button type="button" className="hqp-btn hqp-btn-ghost" onClick={openRealWidget}>
                    <MessageSquare size={17} /> Try it on this page
                  </button>
                </>
              }
              art={<WidgetArt />}
            >
              <a className="fw-demo-link" href="#demo">
                <span className="fw-play">
                  <Play size={15} />
                </span>
                Watch the one-minute demo
              </a>
              <div className="hqp-chips fw-works">
                <b>Works with</b>
                <span>Next.js / React</span>
                <span>React Native / Expo</span>
                <span>Flutter</span>
              </div>
              <p className="fw-hero-note">An AI coding skill. Not a subscription. Not another SDK.</p>
            </HqHero>
          </div>

          <section
            id="demo"
            className="hqp-section fw-demo"
            aria-labelledby="demo-title"
            data-feedback-label="Product demo video"
          >
            <div className="hqp-inner">
              <div className="hqp-head">
                <div>
                  <p className="hqp-eyebrow">See it in action</p>
                  <h2 id="demo-title" className="hqp-display">
                    Show more. <em>Explain less.</em>
                  </h2>
                </div>
                <p className="hqp-lede">
                  A walkthrough of the real flow: describe the problem, select an element, annotate a
                  screenshot, and review what gets shared.
                </p>
              </div>
              <figure className="fw-video">
                <div className="hqp-screen">
                  <div className="hqp-chrome">
                    <i />
                    <i />
                    <i />
                    <span>feedback.humanquest.net · walkthrough · 1:05</span>
                  </div>
                  <video
                    ref={demo}
                    controls
                    playsInline
                    preload="none"
                    poster="/media/feedback-demo-poster.jpg?v=20260908"
                    aria-label="Feedback Widget product walkthrough"
                    aria-describedby="demo-caption"
                    width={1920}
                    height={1080}
                  >
                    <source
                      src="/media/feedback-demo.mp4?v=20260908"
                      type="video/mp4"
                    />
                    <track
                      kind="captions"
                      src="/media/feedback-demo.en.vtt?v=20260908"
                      srcLang="en"
                      label="English"
                      default
                    />
                    Your browser does not support embedded video.{' '}
                    <a href="/media/feedback-demo.mp4?v=20260908">
                      Download the walkthrough.
                    </a>
                  </video>
                </div>
                <figcaption id="demo-caption" className="fw-cap">
                  Real interface. Example report. Nothing published during the demo.
                  Narration and English captions included.
                </figcaption>
              </figure>

              <div className="fw-chapters" aria-label="Jump to a part of the walkthrough">
                {chapters.map((c) => (
                  <button
                    key={c.n}
                    type="button"
                    className="hqp-card hqp-lift fw-chapter"
                    onClick={() => playFrom(c.at)}
                  >
                    <span className="hqp-shot">
                      <img
                        src={`/media/chapters/${c.shot}.jpg`}
                        alt={`${c.title} step in the real widget`}
                        loading="lazy"
                        width={800}
                        height={500}
                      />
                      <span className="fw-chapter-play">
                        <Play size={13} /> {time(c.at)}
                      </span>
                    </span>
                    <span className="hqp-body">
                      <small>{c.n}</small>
                      <strong>{c.title}</strong>
                      <p>{c.text}</p>
                    </span>
                  </button>
                ))}
              </div>

              <details className="fw-transcript">
                <summary>Read the video transcript</summary>
                <div>
                  <p>
                    Good feedback starts with context. Here is the feedback
                    experience built into this website. Choose a category, add a
                    short summary, and explain what happened. The microphone buttons
                    also offer voice input in supported browsers.
                  </p>
                  <p>
                    Select the exact element you are talking about. Its location and
                    structure stay with the report, without copying page text or
                    form values. Attach a screenshot, then mark it up with arrows,
                    shapes, and labels. Save the image back into your report.
                  </p>
                  <p>
                    Screen recordings, audio, and files are available when you need
                    more context. Diagnostic collection is optional, and starts
                    switched off. Review the text, screenshot, and selection
                    together. On this site, report text is public, attachments are
                    private, and publishing requires sign in.
                  </p>
                  <p>
                    Install the open source skill, then ask your coding assistant to
                    connect GitHub or Linear. Make useful feedback part of your
                    product.
                  </p>
                </div>
              </details>
            </div>
          </section>

          <section
            id="how-it-works"
            className="hqp-section hqp-tint fw-how"
            data-feedback-label="How it works"
          >
            <div className="hqp-inner">
              <div className="hqp-head">
                <div>
                  <p className="hqp-eyebrow">From “it’s broken” to something useful</p>
                  <h2 className="hqp-display">
                    A small widget.
                    <br />A much shorter <em>feedback loop.</em>
                  </h2>
                </div>
                <p className="hqp-lede">
                  It’s a set of instructions and implementation patterns for your AI
                  coding assistant, not a hosted feedback service.
                </p>
              </div>
              <HqStones
                steps={[
                  {
                    title: 'Install once.',
                    text: 'Add the skill to Claude Code or Codex. Invoke it from the app you want to improve.',
                  },
                  {
                    title: 'Make it yours.',
                    text: 'Your assistant adapts the UI, authentication, and server endpoint to your stack and design system.',
                  },
                  {
                    title: 'Close the loop.',
                    text: 'Route reports to a confirmed GitHub repository or Linear team. You own the implementation and the data flow.',
                  },
                ]}
              />
            </div>
          </section>

          <section
            id="install"
            className="hqp-section fw-install"
            data-feedback-label="Installation instructions"
          >
            <div className="hqp-inner fw-install-grid">
              <div className="install-copy">
                <p className="hqp-eyebrow">Two commands. Then make it yours.</p>
                <h2 className="hqp-display">
                  Your next useful report <em>starts here.</em>
                </h2>
                <p className="fw-body">
                  Open Claude Code in your app’s project. Add the community
                  marketplace, install the plugin, then use the prompt below.
                </p>
                <a className="fw-link" href={repo + '/releases/latest'}>
                  Download the ZIP instead <ArrowRight size={16} />
                </a>
                <a className="fw-link" href={repo + '#codex'}>
                  Installing in Codex? <ArrowRight size={16} />
                </a>
                <p className="install-note">
                  Free under MIT. Your coding assistant and issue tracker may have
                  their own costs. Each installer connects their own accounts.
                </p>
              </div>
              <div className="install-panel">
                <div className="command-block">
                  <div className="code-heading">
                    <span>
                      <Terminal size={16} /> In Claude Code
                    </span>
                    <CopyButton
                      text={install}
                      label="Copy Claude Code install commands"
                    />
                  </div>
                  <pre>
                    <code>{install}</code>
                  </pre>
                </div>
                <div className="prompt-block">
                  <div className="prompt-heading">
                    <span className="small-label">THEN ASK YOUR ASSISTANT</span>
                    <span>Choose your tracker</span>
                  </div>
                  <Tabs defaultValue="Linear">
                    <TabsList
                      aria-label="Issue tracker"
                      className="provider-tabs"
                    >
                      <TabsTrigger value="Linear">Linear</TabsTrigger>
                      <TabsTrigger value="GitHub">GitHub</TabsTrigger>
                    </TabsList>
                    {['Linear', 'GitHub'].map((provider) => {
                      const prompt =
                        '/feedback-widget:add-feedback-widget Add the full feedback experience using ' +
                        provider +
                        ". Reuse my app's authentication and design system. Ask me to confirm the destination " +
                        (provider === 'Linear' ? 'team' : 'repository') +
                        '. Include screenshots and annotation, one element picker that works on unlabeled elements without collecting page text or form values, screen recording, audio attachments, and private attachments. Add voice-to-text dictation for Summary and What happened with one-tap mic start, live text directly in each field, Stop, Cancel, and Undo. Preserve the original text and caret, stop the microphone on dismissal or tab hiding, and avoid a separate transcript form or Insert step. Disclose speech-service processing before microphone access and provide an unsupported-browser fallback. Make diagnostics opt-in, require capture consent, and let reporters review everything before sending. Configure private storage and server-only tracker credentials. Do not create a live test issue without asking.';
                      return (
                        <TabsContent key={provider} value={provider}>
                          <div className="prompt-text">
                            <p>{prompt}</p>
                            <CopyButton
                              text={prompt}
                              label={'Copy ' + provider + ' starter prompt'}
                            />
                          </div>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                  <p className="setup-note">
                    <LockKeyhole size={14} /> Tracker credentials belong on your
                    server, never in the app bundle.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section
            id="privacy"
            className="hqp-section fw-privacy-section"
            data-feedback-label="Privacy information"
          >
            <div className="hqp-inner">
              <div className="hqp-head">
                <div>
                  <p className="hqp-eyebrow">Useful context. Deliberate boundaries.</p>
                  <h2 className="hqp-display">
                    Feedback shouldn’t mean
                    <br />
                    <em>collecting everything.</em>
                  </h2>
                </div>
                <a className="fw-arrow-link" href={repo + '/blob/main/PRIVACY.md'}>
                  Read the privacy model <ArrowRight size={16} />
                </a>
              </div>
              <div className="fw-privacy">
                <article className="hqp-card hqp-lift">
                  <span className="fw-ico">
                    <MessageSquare size={22} />
                  </span>
                  <h3>Capture on your terms.</h3>
                  <p>
                    Screenshots, recordings, and diagnostics are deliberate choices.
                    Review every capture before sending. No background recording or
                    automatic collection of your screen.
                  </p>
                </article>
                <article className="hqp-card hqp-lift">
                  <span className="fw-ico">
                    <LockKeyhole size={22} />
                  </span>
                  <h3>Keep secrets server-side.</h3>
                  <p>
                    Use your own backend, scoped tracker credentials,
                    authentication, and rate limits. The skill ships no tokens, team
                    IDs, or preconfigured destinations.
                  </p>
                </article>
                <article className="hqp-card hqp-lift">
                  <span className="fw-ico">
                    <ShieldCheck size={22} />
                  </span>
                  <h3>No account with us.</h3>
                  <p>
                    The plugin adds no author-operated collector, analytics hook, or
                    hosted feedback account. Review generated code before shipping;
                    the AI tools you use have their own data policies.
                  </p>
                </article>
              </div>
              <p className="fw-caveat">
                These are implementation guardrails, not a privacy certification.
                You choose what your app collects and where it goes.
              </p>
            </div>
          </section>

          <MobileShowcase />

          <section className="bottom-cta wrap">
            <p className="hqp-eyebrow">Good feedback is a feature.</p>
            <h2 className="hqp-display">
              Make reporting <em>the easy part.</em>
            </h2>
            <div className="hqp-ctas">
              <a className="hqp-btn hqp-btn-ember" href={repo + '/blob/main/SHARE.md'}>
                Send it to a friend <ArrowRight size={17} />
              </a>
              <a className="hqp-btn hqp-btn-ghost" href="#install">
                Install the skill
              </a>
            </div>
            <p className="fw-fine">
              Free under MIT. Independent project. Not affiliated with Anthropic, OpenAI, GitHub, or
              Linear.
            </p>
          </section>
        </main>

        <HqSunset />
        <HqFamilyFooter
          current="Feedback"
          territory="pattern"
          extra={[
            { label: 'Source on GitHub', href: repo },
            { label: 'Privacy model', href: repo + '/blob/main/PRIVACY.md' },
            { label: 'License', href: repo + '/blob/main/LICENSE' },
            { label: 'Security', href: repo + '/blob/main/SECURITY.md' },
          ]}
        />
      </div>
      <FeedbackWidget />
    </>
  );
}
