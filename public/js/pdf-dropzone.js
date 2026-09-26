// PDF Resume File Selection & Drag-and-Drop Handler
let selectedPdfFile = null;

export function getSelectedPdfFile() {
  return selectedPdfFile;
}

export function initPdfDropzone(onError, onValid) {
  const pdfInput = document.getElementById('resumeFile');
  const pdfDropzone = document.getElementById('pdfDropzone');
  const pdfSelectedCard = document.getElementById('pdfSelectedCard');
  const pdfRemoveBtn = document.getElementById('pdfRemoveBtn');

  function handleFileSelect(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      if (onError) onError('Please select a valid PDF file (.pdf format).');
      return;
    }
    selectedPdfFile = file;
    document.getElementById('pdfFileName').textContent = file.name;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    document.getElementById('pdfFileSize').textContent = `${sizeMb} MB`;

    pdfDropzone.classList.add('hidden');
    pdfSelectedCard.classList.add('active');
    if (onValid) onValid();
  }

  if (pdfInput) {
    pdfInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  if (pdfDropzone) {
    pdfDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      pdfDropzone.classList.add('dragover');
    });
    pdfDropzone.addEventListener('dragleave', () => pdfDropzone.classList.remove('dragover'));
    pdfDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      pdfDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (pdfRemoveBtn) {
    pdfRemoveBtn.onclick = () => {
      selectedPdfFile = null;
      if (pdfInput) pdfInput.value = '';
      pdfSelectedCard.classList.remove('active');
      pdfDropzone.classList.remove('hidden');
    };
  }
}
