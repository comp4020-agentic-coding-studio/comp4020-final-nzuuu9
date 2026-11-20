// Static CSS and client-side JS for the visual-preview branch. Kept as
// plain strings served by server.ts, the same way live.js always has been
// — no build step, no bundler, matching CLAUDE.md's stack rule.

export const STYLESHEET = `
:root {
  --canvas: #fbf5ec;
  --ink: #23201b;
  --ink-soft: #5b564c;
  --teal: #0e4b4b;
  --teal-dark: #0a3838;
  --card-bg: #ffffff;
  --border: #e7dfd0;
  --radius: 0.75rem;
}

* { box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--canvas);
  color: var(--ink);
  margin: 0;
  padding: 0 1rem;
  line-height: 1.5;
}

main { max-width: 40rem; margin: 0 auto; padding: 2rem 0; }

a { color: var(--teal); }
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 3px solid var(--teal);
  outline-offset: 2px;
}

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

button { font: inherit; cursor: pointer; }

.btn-primary {
  background: var(--teal);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  font-size: 1rem;
}
.btn-primary:hover { background: var(--teal-dark); }

.btn-secondary {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.65rem 1.25rem;
}

.btn-link {
  background: none;
  border: none;
  color: var(--teal);
  text-decoration: underline;
  padding: 0.25rem 0;
  display: block;
  margin: 0.5rem 0 1rem;
}

fieldset { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 1rem; }
label { display: block; margin: 0.25rem 0; }
input[type="text"], input[type="number"] {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  width: 100%;
  background: #fff;
  color: var(--ink);
}

/* --- /readme/ as a readable article, same palette as the rest --- */
.start-link { margin-bottom: 1.5rem; }
.readme h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
.readme h2 { font-size: 1.25rem; color: var(--teal); margin-top: 2rem; }
.readme p { margin: 0.75rem 0; color: var(--ink); }
.readme strong { color: var(--ink); }
.readme a { text-decoration: underline; overflow-wrap: anywhere; }

/* --- home page: the three-step wizard --- */
body.home main { padding-top: 3rem; }

.step#step-count {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
}

.wordmark {
  font-size: clamp(2.25rem, 8vw, 3.5rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  margin: 0;
  color: var(--ink);
}

/* Once the count step is behind us, the wordmark settles as a small,
   permanent, top-left brand mark; everything else in #step-count already
   went to display:none via the hidden attribute, so only the wordmark's
   own box remains to lay out. */
body.progressed .step#step-count {
  min-height: 0;
  display: block;
  text-align: left;
  padding: 0;
}
body.progressed .wordmark {
  font-size: 1.25rem;
  font-weight: 700;
}

.tagline {
  font-weight: 400;
  color: var(--ink-soft);
  max-width: 28rem;
  margin: 0.5rem 0 1.5rem;
}

.field { margin: 1rem 0; text-align: left; }
.hint { color: var(--ink-soft); font-size: 0.9rem; margin: 0.35rem 0 0; }

#step-count input#expectedParticipants {
  max-width: 6rem;
  text-align: center;
  font-size: 1.25rem;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  padding: 1.75rem;
  margin: 1.5rem 0;
  opacity: 0;
  transform: translateY(6px);
}
.card.visible { opacity: 1; transform: none; }

.card-panel.hidden-panel { display: none; }

.question-recap {
  color: var(--ink-soft);
  font-style: italic;
  margin-top: -0.5rem;
  margin-bottom: 1.25rem;
}

.card-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.footer-link { text-align: center; margin-top: 2rem; }

/* --- room page: explanation copy and the shared button/card look --- */
.room-intro {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  color: var(--ink-soft);
}

@media (prefers-reduced-motion: no-preference) {
  .card { transition: opacity 320ms ease, transform 320ms ease; }
  .btn-primary, .btn-secondary { transition: background 150ms ease; }
}

@media (max-width: 30rem) {
  .card-actions { flex-direction: column-reverse; }
  .card-actions .btn-primary, .card-actions .btn-secondary { width: 100%; }
}
`;

// One single-purpose script for the home page's staged wizard. It only
// ever toggles the \`hidden\` attribute and a couple of classes — never
// removes or recreates an input — so every field keeps whatever the
// participant typed when they go Back. Nothing here duplicates the
// server's own validation; that still runs on submit regardless of what
// this script does or fails to do.
export const HOME_SCRIPT = `(function () {
  "use strict";
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var wordmark = document.getElementById("wordmark");
  var step1Body = document.getElementById("step1Body");
  var stepQuestion = document.getElementById("step-question");
  var stepOptions = document.getElementById("step-options");
  var expectedInput = document.getElementById("expectedParticipants");
  var questionInput = document.getElementById("question");
  var questionRecap = document.getElementById("questionRecap");
  var option3Field = document.getElementById("option3Field");
  var option3Input = document.getElementById("option3");
  var addThirdBtn = document.getElementById("addThird");
  var brandAnimated = false;

  function validCount() {
    var v = Number(expectedInput.value);
    return Number.isInteger(v) && v >= 2 && v <= 3;
  }

  // The one short brand animation: FLIP (measure Before, let the layout
  // change, measure After, then animate the visual delta back to zero so
  // it reads as one continuous move instead of a jump-cut). Runs once,
  // the first time the count step is confirmed; every later step change
  // is a plain card fade, not this.
  function settleBrand() {
    if (brandAnimated) return;
    brandAnimated = true;
    var before = wordmark.getBoundingClientRect();
    document.body.classList.add("progressed");
    wordmark.textContent = "bigger than 2";
    step1Body.hidden = true;
    if (reduceMotion) return;
    var after = wordmark.getBoundingClientRect();
    if (!before.width || !after.width) return;
    var dx = before.left - after.left;
    var dy = before.top - after.top;
    var sx = before.width / after.width;
    var sy = before.height / after.height;
    wordmark.style.transformOrigin = "top left";
    wordmark.style.transition = "none";
    wordmark.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
    // Force layout so the browser registers the instant jump above before
    // the transition below is allowed to animate away from it.
    wordmark.getBoundingClientRect();
    wordmark.style.transition = "transform 420ms cubic-bezier(.2,.8,.2,1)";
    wordmark.style.transform = "none";
  }

  function showStep(section) {
    section.hidden = false;
    section.classList.remove("visible");
    // Same two-step dance as above, at a smaller scale: set the starting
    // state, force layout, then add the class that transitions away from
    // it — skipped entirely under reduced motion, where .visible is just
    // applied immediately with no transition to run.
    if (reduceMotion) {
      section.classList.add("visible");
      return;
    }
    section.getBoundingClientRect();
    requestAnimationFrame(function () { section.classList.add("visible"); });
  }

  function hideStep(section) {
    section.classList.remove("visible");
    section.hidden = true;
  }

  function goToQuestion() {
    if (!validCount()) {
      expectedInput.reportValidity();
      expectedInput.focus();
      return;
    }
    settleBrand();
    showStep(stepQuestion);
    questionInput.focus();
  }

  function goToOptions() {
    if (!questionInput.reportValidity()) {
      questionInput.focus();
      return;
    }
    questionRecap.textContent = questionInput.value;
    hideStep(stepQuestion);
    showStep(stepOptions);
    document.getElementById("option1").focus();
  }

  document.getElementById("toStep2").addEventListener("click", goToQuestion);
  expectedInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); goToQuestion(); }
  });

  document.getElementById("toStep3").addEventListener("click", goToOptions);
  questionInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); goToOptions(); }
  });

  // Back from the question step returns to the count step. The brand has
  // already settled into its permanent top-left mark by this point (per
  // the brief: it stays "bigger than 2" from then on, regardless of the
  // number entered), so this only restores step1Body, not the wordmark.
  document.getElementById("toStep1").addEventListener("click", function () {
    hideStep(stepQuestion);
    step1Body.hidden = false;
    expectedInput.focus();
  });

  document.getElementById("toStep2b").addEventListener("click", function () {
    hideStep(stepOptions);
    showStep(stepQuestion);
    questionInput.focus();
  });

  addThirdBtn.addEventListener("click", function () {
    option3Field.hidden = false;
    addThirdBtn.hidden = true;
    option3Input.focus();
  });
})();
`;
