# Findwork, Gemini and production updates

The workflow feature branch was fast-forwarded into `master` on 2026-10-27. All seven original commits are now in the production branch history. Additional provider fixes are committed directly to `master` in small updates.

## Findwork

`FINDWORK_API_KEY` and `GEMINI_API_KEY` are different credentials. Findwork powers a job feed; Gemini powers AI writing. A Findwork banner does not diagnose Gemini authentication.

The Findwork connector now omits optional ordering, trims surrounding whitespace from its server-side token, and retries the canonical unfiltered official list only when the optional remote query receives HTTP 400. Remote eligibility and dates are still checked by Launchpad. Authorization errors and rate limits do not trigger this fallback. Authenticated responses remain uncached, and upstream error bodies/tokens are not shown.

The Findwork value saved in Vercel is not automatically available to this separate cloud environment. Its live validity could not be checked here. Enter only the raw token in Vercel Production as `FINDWORK_API_KEY`, without quotes or a `Token ` prefix. Regenerate any key exposed in a screenshot and replace the saved value securely; never commit it or paste it into chat.

## Gemini

The credential configured in this cloud environment was accepted by Google's model-list endpoint (HTTP 200). Actual generation requests still returned provider overloads (HTTP 503 / UNAVAILABLE) and intermittent timeouts. A small JSON request to a Flash Lite alias succeeded; a full synthetic CV run was not consistently completed, including a timeout during factual verification. A valid model listing or small connection check does not prove that a full CV generation will finish within the route deadline.

The app now preserves a received provider overload when a subsequent transport retry times out, rather than losing the actual HTTP 503 behind a generic timeout. CV analysis, writing and verification share one fifty-second budget with up to thirty seconds available per stage, preserving headroom inside the sixty-second route limit. Generation still requires all factual checks to complete before saving.

The writer always receives the user's supplied core skills, experience and education evidence even if relevance selection omitted a section. Prompts explicitly request two separate cover-letter body items, matching the existing validation contract. Credentials and provider are preserved. Automatic Gemini mode may recover with another documented Gemini alias and records the successful models in the saved CV; explicit model pins stay pinned. No unsupported CV is substituted for a failed AI run.

In Vercel Production, use `GEMINI_API_KEY` and `AI_PROVIDER=gemini`. `GEMINI_MODEL=auto` keeps the app's documented default alias; an explicit supported text model may be chosen through settings. There is no guarantee that another model avoids provider capacity problems. HTTP 401/403, unavailable models, quota errors, overloads and timeouts should be diagnosed separately. Basic manual layouts and saved document exports remain available without a successful AI request.

## Confirming the website updated

A Git push and a completed Vercel deployment are separate outcomes. In the correct Vercel project:

1. Confirm the production Git branch is `master`.
2. Open Deployments and find the newest `master` commit from this repository.
3. Check its build/runtime logs and wait for Ready. If no deployment was triggered, deploy the latest `master` revision rather than redeploying an older commit.
4. Open that production deployment and refresh the browser before testing the connections again.

No Vercel deployment status was available to this session, so successful publication is not claimed. The repository push to `master` was independently confirmed against the Git remote.

## Validation

The provider follow-up passed lint, TypeScript, the webpack production build and 113 unit/database tests with no failures or skips. Provider error handling and Findwork query fallback have dedicated regressions. The earlier workflow implementation also passed sixty desktop/mobile browser checks and production authentication/document-export checks. Live full AI generation remains subject to the provider availability limitation above.

## Retrying completed CV stages

**Retry Generation** reuses completed analysis and, after a transient verification failure, the already parsed writing only for the same saved profile, exact target and provider/model settings. Private MongoDB checkpoints expire after thirty minutes and are not completed CVs. Every retry still performs factual verification. Schema/factual-completeness failures discard the writing checkpoint; changed inputs or expired checkpoints start fresh. Successful generation clears its checkpoint. Inputs and edits remain in the builder when a provider fails; **Use Basic Layout without AI** is an explicit separate choice.
