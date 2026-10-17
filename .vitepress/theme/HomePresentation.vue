<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { withBase } from 'vitepress';
const sections = [
  { id: 'vision', label: 'Vision' },
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'readiness', label: 'Readiness' },
];
const active = ref('vision');
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          active.value = entry.target.id;
          entry.target.classList.add('entered');
        }
      }
    },
    { rootMargin: '-20% 0px -55% 0px', threshold: 0 },
  );
  sections.forEach((section) => {
    const element = document.getElementById(section.id);
    if (element) observer?.observe(element);
  });
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div class="presentation">
    <nav class="chapter-nav" aria-label="Presentation sections">
      <a
        v-for="(section, index) in sections"
        :key="section.id"
        :href="`#${section.id}`"
        :aria-current="active === section.id ? 'location' : undefined"
      >
        <span class="chapter-number">0{{ index + 1 }}</span
        ><span>{{ section.label }}</span>
      </a>
    </nav>

    <section id="vision" class="slide slide-vision" aria-labelledby="vision-title">
      <div class="slide-meta">
        <span class="eyebrow">01 / Product vision</span><span class="edition">THE DIRECTION · OCTOBER 2026</span>
      </div>
      <div class="vision-heading">
        <h1 id="vision-title">One workspace.<br /><em>Many possibilities.</em></h1>
        <p class="lead">
          IntoChat is a universal AI workspace and an ecosystem for installing, running, and eventually publishing AI
          applications.
        </p>
      </div>
      <div class="workspace-strip" aria-label="Proposed user experience">
        <div class="workspace-identity">
          <span class="workspace-symbol" aria-hidden="true">iC</span>
          <div><strong>Your workspace</strong><span>Context stays connected. You stay in control.</span></div>
        </div>
        <div class="app-tokens"><span>Research</span><span>Create</span><span>Remember</span></div>
      </div>
      <div class="benefit-grid">
        <div>
          <span class="small-index">01</span>
          <h3>Context, with consent.</h3>
          <p>Useful knowledge shared across apps within explicit permissions.</p>
        </div>
        <div>
          <span class="small-index">02</span>
          <h3>Applications, together.</h3>
          <p>Discover and run useful tools in a consistent workspace.</p>
        </div>
        <div>
          <span class="small-index">03</span>
          <h3>Costs, in view.</h3>
          <p>Understand usage and set boundaries before work begins.</p>
        </div>
      </div>
      <div class="slide-bottom">
        <a class="primary-link" :href="withBase('/vision/')">Learn more <span aria-hidden="true">↗</span></a>
        <p class="evidence-label">
          Selected strategy · Benefits are hypotheses.<br />DigitalBrain is the existing technical platform.
        </p>
      </div>
    </section>

    <section id="ecosystem" class="slide slide-ecosystem" aria-labelledby="ecosystem-title">
      <div class="slide-meta">
        <span class="eyebrow">02 / Ecosystem</span><span class="status-pill">TARGET ARCHITECTURE</span>
      </div>
      <div class="section-heading">
        <h2 id="ecosystem-title">Build the capability.<br /><em>Deliver the application.</em></h2>
        <p>
          An operating-system analogy for an ecosystem: developer tools, runtime, shared services and distribution. No
          new desktop kernel required.
        </p>
      </div>
      <div
        class="ecosystem-map"
        aria-label="Proposed ecosystem: SDK and NuGet modules form applications; catalog distributes them; runtime executes them; cloud hosts them"
      >
        <div class="ecosystem-cell">
          <span class="map-tag">DEVELOPER</span>
          <h3>Framework / SDK</h3>
          <p>NuGet modules provide reusable capabilities.</p>
          <span class="map-detail">Build + compose</span>
        </div>
        <span class="map-arrow" aria-hidden="true">→</span>
        <div class="ecosystem-cell lime-cell">
          <span class="map-tag">USER</span>
          <h3>Applications</h3>
          <p>Installable experiences that solve a user’s task.</p>
          <span class="map-detail">Discover + install</span>
        </div>
        <span class="map-arrow" aria-hidden="true">→</span>
        <div class="ecosystem-cell">
          <span class="map-tag">DISTRIBUTION</span>
          <h3>Catalog → marketplace</h3>
          <p>Curated first. External publishers after validation.</p>
          <span class="map-detail">Review + release</span>
        </div>
        <div class="runtime-band">
          <strong>Runtime</strong><span>Execution · context · permissions · storage</span><strong>Cloud</strong
          ><span>Hosting · operations · usage accounting → payments</span>
        </div>
      </div>
      <div class="slide-bottom">
        <a class="primary-link light-link" :href="withBase('/vision/ecosystem')"
          >Learn more <span aria-hidden="true">↗</span></a
        >
        <p class="evidence-label">
          Proposed boundaries informed by current code.<br />A module registration is not a working user application.
        </p>
      </div>
    </section>

    <section id="priorities" class="slide slide-priorities" aria-labelledby="priorities-title">
      <div class="slide-meta">
        <span class="eyebrow">03 / First priorities</span><span class="edition">GATES, NOT CALENDAR PROMISES</span>
      </div>
      <div class="section-heading">
        <h2 id="priorities-title">Deploy the<br /><em>current version.</em></h2>
        <p>
          Start with a controlled release of what exists. Earn each expansion through reliable operation and useful
          outcomes.
        </p>
      </div>
      <ol class="roadmap-track">
        <li class="first-gate">
          <span class="gate-number">01</span>
          <h3>Controlled <br />deployment</h3>
          <p>Pin the release. Prove isolation, recovery and rollback.</p>
          <span class="gate-label">FIRST ENGINEERING PRIORITY</span>
        </li>
        <li>
          <span class="gate-number">02</span>
          <h3>Reliable <br />core journeys</h3>
          <p>Workspace and first applications produce inspectable results.</p>
          <span class="gate-label">RELIABILITY GATE</span>
        </li>
        <li>
          <span class="gate-number">03</span>
          <h3>Pilot usage <br />and payment</h3>
          <p>Test repeat value, shared context and real operating economics.</p>
          <span class="gate-label">DEMAND GATE</span>
        </li>
        <li>
          <span class="gate-number">04</span>
          <h3>Developers <br />and marketplace</h3>
          <p>Stabilize the SDK before opening external publication.</p>
          <span class="gate-label">ECOSYSTEM GATE</span>
        </li>
      </ol>
      <div class="slide-bottom">
        <a class="primary-link" :href="withBase('/roadmap/')">Learn more <span aria-hidden="true">↗</span></a
        ><a class="text-link" :href="withBase('/roadmap/deployment')">Open the deployment plan →</a>
      </div>
    </section>

    <section id="readiness" class="slide slide-readiness" aria-labelledby="readiness-title">
      <div class="slide-meta">
        <span class="eyebrow">04 / Implementation readiness</span
        ><span class="edition">EVIDENCE BEFORE CONFIDENCE</span>
      </div>
      <div class="section-heading">
        <h2 id="readiness-title">A real foundation.<br /><em>A release to prove.</em></h2>
        <p>
          Readiness follows observed behavior. Code, passing tests and production operation are different kinds of
          evidence.
        </p>
      </div>
      <div class="readiness-grid">
        <div class="readiness-proof">
          <span class="proof-icon" aria-hidden="true">✓</span
          ><span class="evidence-chip">IMPLEMENTED · PRODUCTION UNVERIFIED</span>
          <h3>Stripe and six AI providers.</h3>
          <p>
            Payment and model integrations are implemented. Local test evidence and production verification are recorded
            separately for each capability.
          </p>
          <a :href="withBase('/readiness/')">Explore the implementation inventory →</a>
        </div>
        <div class="readiness-notes">
          <div>
            <span class="evidence-chip">IMPLEMENTED · NOT END-TO-END VERIFIED</span>
            <h3>21 modules. 15 default apps.</h3>
            <p>Every default app, additional app bundle, connector and runtime area has its own assessment.</p>
          </div>
          <div>
            <span class="evidence-chip">PARTIAL / EXTERNAL GATES</span>
            <h3>Deployment and money need proof.</h3>
            <p>
              Provider setup, recovery drills, payment reconciliation and enforced spending boundaries remain release
              gates.
            </p>
          </div>
        </div>
      </div>
      <p class="decision-line">
        <strong>Next evidence:</strong> reliable operation → repeat useful results → shared-context value → willingness
        to pay → independent publishers.
      </p>
      <div class="slide-bottom">
        <a class="primary-link" :href="withBase('/readiness/')">Learn more <span aria-hidden="true">↗</span></a
        ><a class="text-link" :href="withBase('/roadmap/metrics')">Proposed success criteria →</a>
      </div>
    </section>
    <footer class="presentation-footer">
      <span>IntoChat · An ecosystem built on evidence.</span
      ><a :href="withBase('/reference/evidence')">Sources & verification · 17 October 2026 ↗</a>
    </footer>
  </div>
</template>
