# DigitalBrain product handbook

DigitalBrain lets people describe useful apps, run them in a personal workspace, share them with others, and connect them to external services. The intended product includes **all three**: personal app creation, a social network around people and apps, and external social-network automation.

The current implementation contains substantial foundations and working slices. It does not yet support an unrestricted claim that any described app will work, or that external social-network automation is available.

Start with [Product vision](../product/vision.md), [Readiness assessment](../status.md), and [Delivery plan](../plans/readiness.md).

## Current decisions

- All three product pillars remain in scope, as confirmed by the product owner on 15 October 2026.
- Reuse the existing neuron, signal, behavior, and connector architecture.
- Define release gates by user outcomes. A registered module, compiled app, or passing unit suite is not a completed customer journey.
- Product documentation lives in this repository. Historical documents are preserved separately from current guidance.
- This assessment is based on source and existing records at product commit `667a0327a8b90cedf95b9a5b73494202b73b424e`. No new live product acceptance was performed.

## Handbook

| Question | Read |
| --- | --- |
| Who is the product for, and what does it promise? | [Vision](../product/vision.md) |
| What must each feature do? | [Requirements](../product/requirements.md) |
| How complete is the product? | [Status](../status.md) |
| What exists in Creator and what is missing? | [App generation](../assessment/app-generation.md) |
| What does social mean today? | [Social features](../assessment/social-networks.md) |
| Where does complexity come from? | [Architecture and complexity](../architecture.md) |
| What should happen next? | [Delivery plan](../plans/readiness.md) |
| What supports these conclusions? | [Evidence register](../assessment/evidence.md) |
| Where did previous documentation go? | [Documentation migration](../documentation-migration.md) |
