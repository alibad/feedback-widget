'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Play,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Terminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeedbackWidget } from '@/components/feedback-widget';

const repo = 'https://github.com/alibad/feedback-widget';
const install =
  '/plugin marketplace add alibad/feedback-widget\n/plugin install feedback-widget@feedback-widget';

const mobileApps = [
  {
    id: 'stack',
    name: 'Stack Quest',
    appUrl: 'https://app.stackquest.dev/?feedback_demo=1',
    note: 'Live Flutter app · interactive',
    feedbackPath: 'Open Settings → Send feedback, or report a problem from an exercise.',
  },
  {
    id: 'doneos',
    name: 'DoneOS',
    appUrl: 'https://app.doneos.net/?feedback_demo=1',
    note: 'Live Flutter app · sign-in required',
    feedbackPath: 'Sign in, then use the floating help button or Account → Send feedback.',
  },
  {
    id: 'leela',
    name: 'Leela Quest',
    appUrl: 'https://app.leelaquest.com/?debug=true&feedback_demo=1#/home',
    note: 'Live Flutter app · interactive',
    feedbackPath: 'Open the app menu and choose Send feedback.',
  },
  {
    id: 'yoga',
    name: 'Yoga Quest',
    appUrl: 'https://studio.yogaquest.app/?feedback_demo=1',
    note: 'Live Flutter studio · interactive',
    feedbackPath: 'Open Settings → Help and turn on the feedback button.',
  },
  {
    id: 'scribe',
    name: 'Scribe Quest',
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

function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <MessageSquare size={19} strokeWidth={2.2} />
      </span>
      <span>
        feedback<span className="brand-light">widget</span>
      </span>
    </span>
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
      className="mobile-showcase wrap section-space"
      aria-labelledby="mobile-showcase-title"
      data-feedback-label="Mobile app showcase"
    >
      <div className="section-heading mobile-heading">
        <div>
          <p className="eyebrow">LIVE EMBEDS, NOT CAPTURES</p>
          <h2 id="mobile-showcase-title">Tap the real product.<br />Open its real feedback.</h2>
        </div>
        <p>
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
    </section>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a href="#" aria-label="Feedback Widget home">
          <Brand />
        </a>
        <span className="version">v13</span>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#mobile-apps">Mobile apps</a>
          <a href="#privacy">Privacy</a>
          <a href={repo}>
            GitHub <ArrowRight size={15} />
          </a>
        </nav>
      </header>

      <main id="main">
        <section
          className="hero wrap"
          aria-labelledby="hero-title"
          data-feedback-label="Hero introduction"
        >
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> OPEN SOURCE · MIT LICENSE
            </div>
            <h1 id="hero-title">
              Better bug reports.
              <br />
              <span>Built into your app.</span>
            </h1>
            <p className="hero-description">
              Give your coding assistant the skill to build a feedback flow that
              feels native to your product. Useful reports. Your infrastructure.
              GitHub or Linear.
            </p>
            <div className="hero-actions">
              <a className="action action-primary" href="#install">
                Install the skill <ArrowDown size={17} />
              </a>
              <a className="action action-secondary" href="#demo">
                <Play size={18} /> Watch the demo
              </a>
            </div>
            <p className="hero-footnote">
              An AI coding skill. Not a subscription. Not another SDK.
            </p>
          </div>

          <figure className="product-figure">
            <div className="product-stage">
              <div className="sample-browser" aria-hidden="true">
                <div className="browser-bar">
                  <span />
                  <span />
                  <span />
                  <div>your-app / settings</div>
                </div>
                <div className="sample-settings">
                  <span className="sample-side" />
                  <div>
                    <p>Account settings</p>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
              <div className="feedback-example">
                <div className="example-heading">
                  <span className="tiny-brand">
                    <MessageSquare size={16} />
                  </span>
                  <span>Share feedback</span>
                  <X size={15} aria-hidden="true" />
                </div>
                <h2>Something not quite right?</h2>
                <p className="example-intro">
                  Tell us what happened. We’re listening.
                </p>
                <div className="example-field">
                  <span>Summary</span>
                  <p>The save button stays disabled</p>
                </div>
                <div className="example-field example-description">
                  <span>What happened?</span>
                  <p>
                    I changed my display name, but couldn’t save the update.
                  </p>
                </div>
                <div className="example-tags">
                  <span>Account settings</span>
                  <span>Bug report</span>
                </div>
                <div className="example-submit" aria-hidden="true">
                  Send feedback <ArrowRight size={16} />
                </div>
                <p className="example-privacy">
                  <LockKeyhole size={12} /> Capture, review, then send. No
                  background recording.
                </p>
              </div>
              <div className="receipt">
                <span>
                  <CheckCheck size={18} />
                </span>
                <div>
                  <strong>An actionable issue, in your tracker.</strong>
                  <p>GitHub or Linear · delivered by your backend</p>
                </div>
              </div>
            </div>
            <figcaption>
              Illustrative UI. Try the real flow with “Give feedback” below.
            </figcaption>
          </figure>
        </section>

        <div className="platforms wrap">
          <p>Works with the way you build.</p>
          <span>Next.js / React</span>
          <span>React Native / Expo</span>
          <span>Flutter</span>
        </div>

        <section
          id="demo"
          className="demo-section wrap section-space"
          aria-labelledby="demo-title"
          data-feedback-label="Product demo video"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">SEE IT IN ACTION</p>
              <h2 id="demo-title">Show more. Explain less.</h2>
            </div>
            <p>
              A walkthrough of the real flow: describe the problem, select an
              element, annotate a screenshot, and review what gets shared.
            </p>
          </div>
          <figure className="demo-video">
            <video
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
            <figcaption id="demo-caption">
              Real interface. Example report. Nothing published during the demo.
              Narration and English captions included.
            </figcaption>
          </figure>
          <details className="demo-transcript">
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
        </section>

        <section
          id="how-it-works"
          className="how-section wrap section-space"
          data-feedback-label="How it works"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM “IT’S BROKEN” TO SOMETHING USEFUL</p>
              <h2>
                A small widget.
                <br />A much shorter feedback loop.
              </h2>
            </div>
            <p>
              It’s a set of instructions and implementation patterns for your AI
              coding assistant—not a hosted feedback service.
            </p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01 /</span>
              <h3>Install once.</h3>
              <p>
                Add the skill to Claude Code or Codex. Invoke it from the app
                you want to improve.
              </p>
            </article>
            <article>
              <span className="step-number">02 /</span>
              <h3>Make it yours.</h3>
              <p>
                Your assistant adapts the UI, authentication, and server
                endpoint to your stack and design system.
              </p>
            </article>
            <article>
              <span className="step-number">03 /</span>
              <h3>Close the loop.</h3>
              <p>
                Route reports to a confirmed GitHub repository or Linear team.
                You own the implementation and the data flow.
              </p>
            </article>
          </div>
        </section>

        <section
          id="install"
          className="install-section"
          data-feedback-label="Installation instructions"
        >
          <div className="wrap install-grid">
            <div className="install-copy">
              <p className="eyebrow">TWO COMMANDS. THEN MAKE IT YOURS.</p>
              <h2>
                Your next useful
                <br />
                report starts here.
              </h2>
              <p>
                Open Claude Code in your app’s project. Add the community
                marketplace, install the plugin, then use the prompt below.
              </p>
              <a className="text-link" href={repo + '/releases/latest'}>
                Download the ZIP instead <ArrowRight size={16} />
              </a>
              <a className="text-link" href={repo + '#codex'}>
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
          className="privacy-section wrap section-space"
          data-feedback-label="Privacy information"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">USEFUL CONTEXT. DELIBERATE BOUNDARIES.</p>
              <h2>
                Feedback shouldn’t
                <br />
                mean collecting everything.
              </h2>
            </div>
            <a className="text-link" href={repo + '/blob/main/PRIVACY.md'}>
              Read the privacy model <ArrowRight size={16} />
            </a>
          </div>
          <div className="privacy-grid">
            <article>
              <MessageSquare size={22} />
              <h3>Capture on your terms.</h3>
              <p>
                Screenshots, recordings, and diagnostics are deliberate choices.
                Review every capture before sending. No background recording or
                automatic collection of your screen.
              </p>
            </article>
            <article>
              <LockKeyhole size={22} />
              <h3>Keep secrets server-side.</h3>
              <p>
                Use your own backend, scoped tracker credentials,
                authentication, and rate limits. The skill ships no tokens, team
                IDs, or preconfigured destinations.
              </p>
            </article>
            <article>
              <ShieldCheck size={22} />
              <h3>No account with us.</h3>
              <p>
                The plugin adds no author-operated collector, analytics hook, or
                hosted feedback account. Review generated code before shipping;
                the AI tools you use have their own data policies.
              </p>
            </article>
          </div>
          <p className="privacy-caveat">
            These are implementation guardrails, not a privacy certification.
            You choose what your app collects and where it goes.
          </p>
        </section>

        <MobileShowcase />

        <section className="bottom-cta wrap">
          <div>
            <p className="eyebrow">GOOD FEEDBACK IS A FEATURE.</p>
            <h2>Make reporting the easy part.</h2>
          </div>
          <a
            className="action action-primary"
            href={repo + '/blob/main/SHARE.md'}
          >
            Send it to a friend <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <footer className="wrap">
        <Brand />
        <p>Built to be yours. MIT licensed.</p>
        <div>
          <a href={repo}>Source</a>
          <a href={repo + '/blob/main/LICENSE'}>License</a>
          <a href={repo + '/blob/main/SECURITY.md'}>Security</a>
        </div>
        <small>
          Independent project. Not affiliated with Anthropic, OpenAI, GitHub, or
          Linear.
        </small>
      </footer>
      <FeedbackWidget />
    </>
  );
}
