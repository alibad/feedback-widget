# Product walkthrough

The homepage's `#demo` section hosts a 65-second walkthrough made from actual
product UI captures and a synthetic example report. Narration was generated
locally with Qwen3-TTS's stock Ryan voice; no personal voice was cloned. There is
no music or third-party stock footage.

The edit shows drafting, the real element picker, screenshot annotation,
optional diagnostics, the review screen, and the skill installation section.
Voice input and recording controls are explained as available options, not
presented as completed captures. No report or attachment was submitted and no
GitHub or Linear issue was created during capture. The site's GitHub destination
is distinct from the skill's configurable GitHub/Linear integration.

Published assets:

- `public/media/feedback-demo.mp4`: H.264, 1920×1080, 24 fps, AAC at 48 kHz;
  fast-start metadata and under 4 MB.
- `public/media/feedback-demo-poster.jpg`: an actual annotated product frame.
- `public/media/feedback-demo.en.vtt`: English captions, positioned in the
  reserved lower video margin.
- The page includes a matching expandable text transcript.

The native player has controls and inline playback, never autoplays, and uses
`preload="none"` to avoid downloading the video before a visitor chooses to play.
It does not add a third-party embed, tracker, or service credential.

When replacing the video, update all three assets and the transcript together.
If narration and timing are unchanged, verify the existing captions and transcript
still match rather than rewriting them unnecessarily. Preserve each capture's
aspect ratio when placing it in the video; never stretch product controls to fill
the frame. Check swatch geometry in both the real editor and the encoded video.
Use synthetic records, inspect every cut for private content, compare a fresh
audio transcription with the script, and play the complete edit at normal speed.
Run `npm test`, `npx tsc --noEmit`, and `npm run build` before publishing through
the existing Sites deployment process. Tests check the asset budget, fast-start
layout, caption timing, and opt-in player configuration.

## September 8 annotation correction

The annotation segment (approximately 25–36 seconds) and poster were recaptured
from the corrected editor: compact labeled icon controls, square color hit targets
with round swatches, viewport-fitted screenshots, and a single Save action that
also commits pending text. The edit now includes the saved image in the report.
The original example screenshot is retained for continuity with the surrounding
scenes; no feedback was submitted. Narration and overall timing are unchanged.
