// Main Application Controller & UI State Handler
import { initTheme } from './theme.js';
import { initPdfDropzone, getSelectedPdfFile } from './pdf-dropzone.js';
import { initSpeech, stopMic } from './speech.js';
import { postApi } from './api.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

const TYPE_CONFIG = {
  company: { label: '🎯 Company Research', class: 'company' },
  resume: { label: '📄 Resume Experience', class: 'resume' },
  jd: { label: '💼 Job Requirement', class: 'jd' },
  behavioral: { label: '🧠 Behavioral', class: 'behavioral' }
};

let state = { sessionId: null, questions: [], i: 0, sources: [], selectedCount: 5 };

// Page Navigation Switcher
export function showSection(id) {
  ['setup', 'interview', 'report'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Setup Error Alert
function showSetupError(msg) {
  $('setupErrorMsg').textContent = msg;
  $('setupError').classList.remove('hidden');
}
function hideSetupError() {
  $('setupError').classList.add('hidden');
}

// Loading Ticker
let loaderTimer = null;
const loaderMessages = [
  'Extracting text from your PDF resume...',
  'Searching web for reported interview experiences...',
  'Analyzing target company engineering stack...',
  'Synthesizing personalized mock interview scenario...'
];

function startLoaderTicker() {
  let idx = 0;
  const el = $('loaderTicker');
  if (el) el.textContent = loaderMessages[0];
  loaderTimer = setInterval(() => {
    idx = (idx + 1) % loaderMessages.length;
    const tickerEl = $('loaderTicker');
    if (tickerEl) tickerEl.textContent = loaderMessages[idx];
  }, 4000);
}
function stopLoaderTicker() {
  clearInterval(loaderTimer);
}

// Render Question
function renderQuestion() {
  const q = state.questions[state.i];
  const n = state.questions.length;
  $('bar').style.width = `${((state.i + 1) / n) * 100}%`;
  $('counter').textContent = `Question ${state.i + 1} of ${n}`;

  const cfg = TYPE_CONFIG[q.type] || { label: 'Question', class: 'resume' };
  $('tag').innerHTML = `<span class="q-badge ${cfg.class}">${esc(cfg.label)}</span>`;

  $('question').textContent = q.question;
  $('why').textContent = q.why ? `Interviewer's Focus: ${q.why}` : '';
  $('answer').value = '';

  $('answerBox').classList.remove('hidden');
  $('feedback').classList.add('hidden');
  $('nextRow').classList.add('hidden');
  $('interviewError').classList.add('hidden');
  $('nextBtn').textContent = state.i === n - 1 ? 'Complete Interview & Generate Report →' : 'Next Question →';
  $('answer').focus();
}

// Render Feedback
function renderFeedback(f) {
  const list = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');

  $('feedback').innerHTML = `
    <div class="score-hero">
      <div class="score-number">${esc(f.score)}</div>
      <div class="score-max">/ 10 Rating</div>
    </div>
    
    <div class="feedback-card good">
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        What Worked Well
      </h4>
      <ul>${list(f.strengths)}</ul>
    </div>
    
    <div class="feedback-card improve">
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        Areas to Strengthen
      </h4>
      <ul>${list(f.improvements)}</ul>
    </div>
    
    <div class="feedback-card sample">
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Model Benchmark Answer
      </h4>
      <div class="sample-text">${esc(f.sampleAnswer)}</div>
    </div>`;

  $('feedback').classList.remove('hidden');
  $('nextRow').classList.remove('hidden');
}

// Submit Answer
async function submitAnswer(text) {
  $('interviewError').classList.add('hidden');
  $('answerBox').classList.add('hidden');
  $('scoreLoading').classList.remove('hidden');
  stopMic();

  try {
    const f = await postApi('/api/answer', { sessionId: state.sessionId, index: state.i, answer: text });
    renderFeedback(f);
  } catch (e) {
    $('interviewError').textContent = e.message;
    $('interviewError').classList.remove('hidden');
    $('answerBox').classList.remove('hidden');
  } finally {
    $('scoreLoading').classList.add('hidden');
  }
}

// Finish Interview
async function finishInterview() {
  showSection('report');
  $('reportBody').classList.add('hidden');
  $('reportLoading').classList.remove('hidden');
  $('reportError').classList.add('hidden');

  try {
    const r = await postApi('/api/finish', { sessionId: state.sessionId });
    const list = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');

    $('reportBody').innerHTML = `
      <div class="report-hero">
        <div style="font-size: 14px; font-weight: 700; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.05em;">Interview Evaluation Complete</div>
        <div class="report-score-big">${esc(r.overallScore)}<span style="font-size: 0.4em; color: var(--text-muted);">/100</span></div>
        <p style="font-size: 18px; color: var(--text-main); max-width: 640px; margin: 0 auto;">${esc(r.verdict)}</p>
      </div>

      <div class="report-cols">
        <div class="feedback-card good">
          <h4>Strengths Highlighted</h4>
          <ul>${list(r.strengths)}</ul>
        </div>
        <div class="feedback-card improve">
          <h4>Key Areas to Improve</h4>
          <ul>${list(r.weakAreas)}</ul>
        </div>
        <div class="feedback-card sample">
          <h4>Recommended Next Steps</h4>
          <ul>${list(r.nextSteps)}</ul>
        </div>
      </div>

      <div style="margin-top: 36px; text-align: center;">
        <button class="btn-primary" id="reloadBtn" style="width: auto;">Start Another Mock Interview</button>
      </div>`;

    $('reportBody').classList.remove('hidden');
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) reloadBtn.onclick = () => location.reload();
  } catch (e) {
    $('reportError').textContent = e.message;
    $('reportError').classList.remove('hidden');
  } finally {
    $('reportLoading').classList.add('hidden');
  }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPdfDropzone(showSetupError, hideSetupError);
  initSpeech();

  // Question Count Pills
  document.querySelectorAll('#countPills .count-pill').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#countPills .count-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCount = parseInt(btn.dataset.val, 10);
    };
  });

  // Start Interview Button
  $('startBtn').onclick = async () => {
    hideSetupError();
    const selectedPdfFile = getSelectedPdfFile();
    const jd = $('jd').value.trim();

    if (!selectedPdfFile) {
      showSetupError('Please upload your resume in PDF format before proceeding.');
      return;
    }
    if (jd.length < 50) {
      showSetupError('Please paste a full job description (at least 50 characters).');
      return;
    }

    const fd = new FormData();
    fd.append('resumeFile', selectedPdfFile);
    fd.append('jobDescription', jd);
    fd.append('company', $('company').value.trim());
    fd.append('role', $('role').value.trim());
    fd.append('count', state.selectedCount);

    $('startBtn').disabled = true;
    $('setupLoading').classList.remove('hidden');
    startLoaderTicker();

    try {
      const r = await fetch('/api/start', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not initialize interview session.');

      state = { sessionId: data.sessionId, questions: data.questions, i: 0, sources: data.sources };

      $('summary').textContent = data.summary || 'Senior Candidate Profile';
      $('sources').innerHTML = data.sources && data.sources.length
        ? data.sources.slice(0, 10).map((s) => `
            <li>
              <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" class="source-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span>${esc(s.title || s.url)}</span>
              </a>
            </li>`).join('')
        : '<li><span class="source-chip" style="color: var(--text-dim);">No web sources found. Generated from Resume + JD.</span></li>';

      showSection('interview');
      renderQuestion();
    } catch (e) {
      showSetupError(e.message);
    } finally {
      stopLoaderTicker();
      $('startBtn').disabled = false;
      $('setupLoading').classList.add('hidden');
    }
  };

  // Interview Buttons
  $('submitBtn').onclick = () => {
    const text = $('answer').value.trim();
    if (!text) {
      $('interviewError').textContent = 'Please enter or record an answer before submitting, or click Skip.';
      $('interviewError').classList.remove('hidden');
      return;
    }
    submitAnswer(text);
  };

  $('skipBtn').onclick = () => submitAnswer('');
  $('nextBtn').onclick = () => {
    if (state.i < state.questions.length - 1) {
      state.i++;
      renderQuestion();
    } else {
      finishInterview();
    }
  };
});
