const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

// FLAGA TESTOWA – na start wymuszamy TEST = true (możemy przełączać przez API)
let USE_TEST_KNOWLEDGE = true; 

function loadHRKnowledgeBase() {
  try {
    // Wybierz plik w zależności od trybu
    const fileName = USE_TEST_KNOWLEDGE ? 'hr-kompendium-test.txt' : 'hr-kompendium.txt';
    const filePath = path.join(__dirname, '..', 'data', fileName);

    hrKnowledgeBase = fs.readFileSync(filePath, 'utf8');

    console.log('✅ HR Knowledge Base loaded successfully');
    console.log(`📊 Knowledge Base: ${fileName}`);
    console.log(`📏 Size: ${Math.round(hrKnowledgeBase.length / 1000)}k characters`);
    console.log(`🧪 Test mode: ${USE_TEST_KNOWLEDGE ? 'ENABLED (TEST)' : 'DISABLED (PROD)'}`);

    // Pokaż fragment bazy żeby potwierdzić
    const preview = hrKnowledgeBase.substring(0, 200);
    console.log(`👀 Preview: ${preview}...`);

    return true;
  } catch (error) {
    console.error('❌ Failed to load HR Knowledge Base:', error);
    console.log('🔄 Falling back to default knowledge');
    hrKnowledgeBase = getDefaultKnowledge();
    return false;
  }
}

// Inicjalizuj bazę przy starcie
loadHRKnowledgeBase();

// --- Lista słów kluczowych HR
const HR_KEYWORDS = [
  'urlop', 'umowa', 'pracownik', 'pracodawca', 'wynagrodzenie', 'rekrutacja', 
  'zwolnienie', 'wypowiedzenie', 'rodo', 'hr', 'praca', 'zespół', 'mobbing', 
  'ocena', 'bhp', 'bezpieczeństwo',
  'zatrudnienie', 'etat', 'kontrakt', 'pensja', 'płaca', 'stawka', 'bonus',
  'premie', 'nadgodziny', 'godziny', 'rozmowa kwalifikacyjna', 'cv', 
  'kandydat', 'stanowisko', 'awans', 'degradacja', 'urlop macierzyński',
  'urlop ojcowski', 'zwolnienie lekarskie', 'okres próbny', 'mentoring',
  'szkolenia', 'rozwój zawodowy', 'kompetencje', 'ocena pracownicza',
  'molestowanie', 'dyskryminacja', 'równe traktowanie', 'dane osobowe',
  'przetwarzanie danych', 'zgodnie z rodo', 'kodeks pracy', 'minimum płacowe',
  'czas pracy', 'elastyczny czas', 'home office', 'praca zdalna'
];

// --- Lista tematów NON-HR
const NON_HR_TOPICS = [
  'gotowanie','przepis','jedzenie','kulinaria','kuchnia',
  'pogoda','sport','piłka nożna','koszykówka','tenis',
  'film','serial','muzyka','książka','gra','gaming',
  'technologia','programowanie','kod','python','javascript',
  'telefon','komputer','auto','samochód','transport',
  'podróże','wakacje','turystyka','hotel',
  'medycyna','lekarz','choroby','leki','zdrowie',
  'polityka','wybory','rząd','prezydent','parlament'
];

function isHRRelated(message) {
  const lowerMessage = message.toLowerCase();
  const hasHRKeywords = HR_KEYWORDS.some(k => lowerMessage.includes(k));
  const hasNonHRTopics = NON_HR_TOPICS.some(t => lowerMessage.includes(t));
  const isHelpQuestion = lowerMessage.includes('pomoc') || 
                         lowerMessage.includes('możesz') ||
                         lowerMessage.includes('co umiesz') ||
                         lowerMessage.includes('jak działa');
  if (isHelpQuestion) return true;
  if (hasNonHRTopics && !hasHRKeywords) return false;
  if (hasHRKeywords) return true;
  return lowerMessage.length < 50;
}

// --- System prompt do OpenAI
function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (unikatowe info)' : 'PEŁNEJ PRODUKCYJNEJ';

  return `Jesteś ekspertem HR w Polsce. Odpowiadasz TYLKO na pytania związane z HR i prawem pracy w Polsce.

ŹRÓDŁO WIEDZY: Używasz ${knowledgeStatus} bazy wiedzy załadowanej z pliku.

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

WAŻNE INSTRUKCJE:
1. Odpowiadaj WYŁĄCZNIE na podstawie powyższej bazy wiedzy.
2. ${USE_TEST_KNOWLEDGE ? 'TEST: używaj tych unikatowych zasad (99 dni urlopu, 777 dni wypowiedzenia, czekoladowe monety itp.)' : 'PROD: używaj rzeczywistych danych polskiego prawa pracy z kompendium.'}
3. Jeśli w bazie nie ma danych – odpowiedz dosłownie: "Brak danych w bazie".
4. Nie dodawaj informacji spoza pliku.
5. Bądź zwięzły (max 400 słów) i prosty w języku.
6. Przy trudnych sprawach wspomnij o konsultacji z prawnikiem.
7. Jeśli pytanie spoza HR – grzecznie odmów.
`;
}

// --- Domyślny fallback prompt
function getDefaultSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.
- Używaj polskich przepisów
- Odpowiadaj krótko (max 300 słów)
- Język prosty
- W trudnych sprawach: konsultacja z prawnikiem`;
}

// --- Minimalna wiedza fallback
function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
Urlop: 20/26 dni
Urlop macierzyński: 20 tygodni
Urlop ojcowski: 2 tygodnie
Okres wypowiedzenia: 2 tyg / 1 mies / 3 mies
Minimalne wynagrodzenie 2024: 3490 zł brutto
RODO: CV max 12 miesięcy`;
}

// --- Fallback odpowiedzi (jeśli OpenAI nie zwróci)
function getFallbackResponse(message) {
  if (!isHRRelated(message)) {
    return "Jestem ekspertem HR i odpowiadam tylko na pytania o HR i prawo pracy w Polsce.";
  }

  const lower = message.toLowerCase();
  if (USE_TEST_KNOWLEDGE) {
    if (lower.includes('urlop')) return 'Test: 99 dni urlopu, tylko w pełnię księżyca.';
    if (lower.includes('wypowiedzenie')) return 'Test: wypowiedzenie trwa 777 dni.';
    if (lower.includes('wynagrodzenie')) return 'Test: płaca 999,999 zł w czekoladowych monetach.';
    return 'Test: unikatowa baza – jeśli pytanie inne, odpowiedz "Brak danych w bazie".';
  }

  // PRODUKCYJNE fallback odpowiedzi
  if (lower.includes('urlop')) return 'W Polsce przysługuje 20 dni urlopu (wykształcenie podstawowe/zawodowe) lub 26 dni (średnie/wyższe).';
  if (lower.includes('wypowiedzenie')) return 'Okresy wypowiedzenia: 2 tygodnie (do 6 mies pracy), 1 miesiąc (6 mies - 3 lata), 3 miesiące (powyżej 3 lat).';
  if (lower.includes('wynagrodzenie') || lower.includes('płaca')) return 'Minimalne wynagrodzenie w 2024 roku: 3490 zł brutto miesięcznie.';
  if (lower.includes('rodo')) return 'CV można przechowywać maksymalnie 12 miesięcy po zakończeniu rekrutacji.';
  return 'Jestem ekspertem HR w Polsce. O co konkretnie chciałbyś zapytać z zakresu prawa pracy?';
}

// --- API pomocnicze
function reloadKnowledgeBase() {
  return loadHRKnowledgeBase();
}

function setTestMode(enabled) {
  console.log(`🔄 Switching mode: TEST=${enabled}`);
  USE_TEST_KNOWLEDGE = enabled;
  const success = loadHRKnowledgeBase();
  console.log(`✅ Mode switched to: ${enabled ? 'TEST' : 'PROD'}`);
  return success;
}

// NOWA: Funkcja do sprawdzania aktualnego trybu (potrzebna dla admin API)
function getCurrentMode() {
  return {
    testMode: USE_TEST_KNOWLEDGE,
    knowledgeFile: USE_TEST_KNOWLEDGE ? 'hr-kompendium-test.txt' : 'hr-kompendium.txt',
    knowledgeSize: hrKnowledgeBase ? hrKnowledgeBase.length : 0,
    loaded: !!hrKnowledgeBase
  };
}

module.exports = { 
  getSystemPrompt, 
  getFallbackResponse, 
  isHRRelated,
  reloadKnowledgeBase,
  setTestMode,
  getCurrentMode // ← NOWA funkcja dla admin API
};