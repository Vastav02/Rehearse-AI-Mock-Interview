// Web Speech API Voice Recognition Handler
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

export function stopMic() {
  const micBtn = document.getElementById('micBtn');
  if (rec) {
    rec.stop();
    rec = null;
  }
  if (micBtn) {
    micBtn.classList.remove('mic-btn-active');
    micBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg><span>Answer by voice</span>`;
  }
}

export function initSpeech() {
  const micBtn = document.getElementById('micBtn');
  const answerInput = document.getElementById('answer');

  if (!micBtn) return;
  if (!SR) {
    micBtn.classList.add('hidden');
    return;
  }

  micBtn.onclick = () => {
    if (rec) return stopMic();

    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          answerInput.value += ((answerInput.value && ' ') || '') + e.results[i][0].transcript.trim();
        }
      }
    };
    rec.onend = () => {
      rec = null;
      stopMic();
    };

    rec.start();
    micBtn.classList.add('mic-btn-active');
    micBtn.innerHTML = `Listening <span class="soundwave"><i></i><i></i><i></i></span>`;
  };
}
