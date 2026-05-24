# Sound and Voice Alerts

The front end now includes a real browser-based sound and voice alert layer for paper testing.

## Important browser rule

Modern browsers block audio until the user interacts with the page. The dashboard has an **Enable sound & voice** button that unlocks the AudioContext and speech engine.

## Alert types

- Entry alert: paper trade entered
- Exit alert: close or review a trade
- Stop alert: price reaches stop area
- Target alert: price reaches target area
- Blocked alert: trade rejected by rules

## What the system reads aloud

Each voice alert should include:

- ticker
- action required
- entry price
- stop price
- target price
- risk note
- exit/invalidation instruction

Example:

> CBA paper trade entered. Entry is $123.20. Stop is $119.80. Target is $132.70. Risk is controlled. Exit if stop, target, or invalidation occurs.

## Implementation

The demo front end uses:

- Web Audio API for alert tones
- Browser SpeechSynthesis for voice reading
- A 60-second alert popup
- Manual close button
- Test entry and test exit buttons

This is designed for paper trading first. Real broker execution remains disabled.
