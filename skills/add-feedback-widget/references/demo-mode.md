# Demo Mode — the `feedback_demo` parameter

A showcase site embeds a real build of the app and lets a visitor try the
feedback widget in it. The embed carries a query parameter — `?feedback_demo=1`
is the established spelling, also accepted as `feedback_demo=true` — and the app
reads it at startup.

This applies to **web builds only**. A Flutter app compiled to web, a React app,
a React Native web target. Gate the check on the web-platform constant
(`kIsWeb` in Flutter) so a native build can never be put into demo mode by a
deep link.

## What the parameter does

**It forces the trigger visible. It does not open the composer.**

That is the whole contract, and it is the opposite of what a first
implementation usually does.

### Show the trigger unconditionally

In demo mode the floating trigger renders regardless of every gate that would
normally hide it:

- the persisted "show feedback button" preference, including its default — and
  the sensible default for that preference is *hidden*, which is exactly why
  demo mode has to override it;
- the remote-config flag and its per-user allowlist (`feedback_overlay_enabled`
  or the host's equivalent);
- the debug/beta build gate (`kDebugMode`, `__DEV__`, a `--dart-define` flag);
- a "first run introduction not yet dismissed" state.

A visitor who arrives at the showcase and sees no button has been shown nothing.
Resolve demo mode before the first frame where the preference is read, so the
trigger does not flash in and out while preferences load.

Demo mode overrides **visibility only**. It does not grant an entitlement, skip
authentication, enable diagnostics, change the tracker destination, or relax any
server-side check. The endpoint still authenticates and rate-limits exactly as
it does for everyone else.

### Do not auto-open the composer

Do not push the composer, annotator, or sheet on load. No post-frame callback,
no retry loop that waits for the navigator and then opens, no delayed timer.

The reasons compound:

- The composer covers the app. A visitor who came to see how feedback works in
  this product is shown a form instead of the product, and the screenshot behind
  it is of a screen they never got to look at.
- It presents an empty report form to somebody with nothing to report. The first
  interaction is a dismissal.
- It is indistinguishable from a modal ad, and gets treated like one.
- The trigger is the part worth demonstrating. Clicking it is the demo.

Deleting the auto-open usually deletes a whole apparatus with it: the
post-frame callback, the bounded retry counter that waits for the navigator and
boundary keys to exist, and the `ensureVisualUpdate()` calls that pump frames
for it. All of it exists only to open something that should not open. Remove the
apparatus, not just the final call.

## Trigger provenance

Record how a composer was opened and send it with the report — demo, screenshot,
floating button, menu, in-context. Without it a report somebody sought out reads
the same as one that appeared over them uninvited, and those mean opposite things
about identical words.

Demo-mode reports come from a public showcase and deserve their own label so
they can be filtered out of a real inbox.

## Verification

Test the parameter parser directly — it is pure and cheap to cover:

- `?feedback_demo=1` and `?feedback_demo=true` enable it, including alongside
  other parameters and a route fragment;
- `?feedback_demo=0`, `?feedback_demo=false`, a missing parameter, and an
  unrelated parameter do not;
- on a native platform it is always false, whatever the URI says.

Then test the behavior:

- with demo mode on and the visibility preference off, the trigger renders;
- with demo mode on, no composer route is pushed during startup;
- with demo mode off, the trigger still honors every normal gate.
