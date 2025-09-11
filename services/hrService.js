const fs = require('fs');
const path = require('path');

// ── FLAGA TRYBU ────────────────────────────────────────────────────────────────
let USE_TEST_KNOWLEDGE = true; // start w trybie TEST
let hrKnowledgeBase = null;
let currentFileName = null;

function pickFileName() {
  return USE_TEST_KNOWLEDGE ? 'hr-kompendium-test.txt' : 'hr-kompendium.txt';
}

function getFilePath() {
  return path.join(__dirname, '..', 'data', pickFileName());
}

// ── ŁADOWANIE BAZY ─────────────────────────────────────────────────────────────
function loadHRKnowledgeBase() {
  try {
    const fileName = pickFileName();
    const filePath = getFilePath();

    if (!fs.existsSync(filePath)) {
      throw new Error(`Knowledge file not found: ${filePath}`);
    }

    const txt = fs.readFileSync(filePath, 'utf8');
    hrKnowledgeBase = txt;
    currentFileName = fileName;

    console.log('✅ HR Knowledge Base loaded');
    console.log(`📊 File: ${fileName}`);
    console.log(`📏 Size: ${Math.round(txt.length / 1000)}k chars`);
    console.log(`🧪 Test mode: ${USE_TEST_KNOWLEDGE ? 'ENABLED' : 'DISABLED'}`);
    console.log(`👀 Preview: ${txt.substring(0, 200)}...`);

    return true;
  } catch (error) {
    console.error('❌ Failed to load HR Knowledge Base:', error.message);
    console.log('🔄 Falling back to default knowledge');
    hrKnowledgeBase = getDefaultKnowledge();
    currentFileName = 'default-inline';
    return false;
  }
}

// Ładuj przy starcie
loadHRKnowledgeBase();

// ── KLASYFIKACJA WIADOMOŚCI ───────────────────────────────────────────────────
const HR_KEYWORDS = [
  'urlop','umowa','pracownik','pracodawca','wynagrodzenie','rekrutacja',
  'zwolnienie','wypowiedzenie','rodo','hr','praca','zespół','mobbing',
  'ocena','bhp','bezpieczeństwo','zatrudnienie','etat','kontrakt','pensja',
  'płaca','stawka','bonus','premie','nadgodziny','godziny','rozmowa kwalifikacyjna',
  'cv','kandydat','stanowisko','awans','degradacja','urlop macierzyński',
  'urlop ojcowski','zwolnienie lekarskie','okres próbny','mentoring',
  'szkolenia','rozwój zawodowy','kompetencje','ocena pracownicza',
  'molestowanie','dyskryminacja','równe traktowanie','dane osobowe',
  'przetwarzanie danych','zgodnie z rodo','kodeks pracy','minimum płacowe',
  'czas pracy','elastyczny czas','home office','praca zdalna'
];

const NON_HR_TOPICS = [
  'gotowanie','przepis','jedzenie','kulinaria','kuchnia','pogoda','sport',
  'piłka nożna','koszykówka','tenis','film','serial','muzyka','książka','gra','gaming',
  'technologia','programowanie','kod','python','javascript','telefon','komputer',
  'auto','samochód','transport','podróże','wakacje','turystyka','hotel',
  'medycyna','lekarz','choroby','leki','zdrowie','polityka','wybory','rząd','prezydent','parlament'
];

function isHRRelated(message) {
  const lower = String(message || '').toLowerCase();
  const hasHR = HR_KEYWORDS.some(k => lower.includes(k));
  const hasNonHR = NON_HR_TOPICS.some(k => lower.includes(k));
  const isHelp = ['pomoc','możesz','co umiesz','jak działa'].some(k => lower.includes(k));

  if (isHelp) return true;
  if (hasNonHR && !hasHR) return false;
  if (hasHR) return true;
  return lower.length < 50; // domyślnie pozwól na krótkie ogólne pytania
}

// ── PROMPTY ───────────────────────────────────────────────────────────────────
function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (unikatowej)' : 'PEŁNEJ';
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz TYLKO na pytania z HR i prawa pracy w Polsce.

ŹRÓDŁO WIEDZY: Używasz ${knowledgeStatus} bazy wiedzy z pliku: ${currentFileName}

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

WAŻNE INSTRUKCJE:
1. BAZUJ WYŁĄCZNIE na informacjach z powyższej bazy wiedzy
2. ${USE_TEST_KNOWLEDGE ? 'UŻYWAJ dokładnie informacji TESTOWYCH i UNIKATOWYCH z bazy' : 'Używaj szczegółów z kompendium'}
3. Nie dodawaj danych spoza bazy
4. TYLKO tematy HR/prawo pracy (PL)
5. Zwięźle (≤400 słów), prosto
6. Przy złożonych sprawach wspomnij o konsultacji z prawnikiem
7. Jeśli pytanie jest spoza HR – grzecznie odmów

ZAKRES: urlopy, umowy, rekrutacja, wynagrodzenia, RODO, zespół, mobbing, BHP, oceny, KP.

TRYB: ${USE_TEST_KNOWLEDGE ? 'TEST' : 'PROD'}`;
}

function getDefaultSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.
ZASADY: polskie przepisy (KP, RODO), zwięźle (≤300 słów), prosto, wspomnij o konsultacji z prawnikiem przy złożonych sprawach.
ZAKRES: urlopy, umowy, rekrutacja, wynagrodzenia, RODO, zarządzanie, mobbing, BHP.`;
}

function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
- Urlop wypoczynkowy: 20/26 dni (staż <10 / ≥10 lat)
- Okresy wypowiedzenia: 2 tyg / 1 mies / 3 mies (w zależności od stażu)
- Minimalne wynagrodzenie 2024: 3490 zł brutto
- Nadgodziny: limit 150h/rok; dodatki 50%/100%
- RODO: CV kandydatów do 12 miesięcy po rekrutacji`;
}

// ── API POMOCNICZE ────────────────────────────────────────────────────────────
function reloadKnowledgeBase() {
  return loadHRKnowledgeBase();
}

function setTestMode(enabled) {
  USE_TEST_KNOWLEDGE = Boolean(enabled);
  console.log(`🔁 Switching test mode to: ${USE_TEST_KNOWLEDGE ? 'ON' : 'OFF'}`);
  return loadHRKnowledgeBase();
}

function getKnowledgeStatus() {
  return {
    testMode: USE_TEST_KNOWLEDGE,
    file: currentFileName,
    loaded: Boolean(hrKnowledgeBase),
    length: hrKnowledgeBase ? hrKnowledgeBase.length : 0
  };
}

module.exports = {
  getSystemPrompt,
  getFallbackResponse,
  isHRRelated,
  reloadKnowledgeBase,
  setTestMode,
  getKnowledgeStatus
};