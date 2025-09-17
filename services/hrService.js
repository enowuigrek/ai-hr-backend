const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

// FLAGA PRODUKCYJNA
let USE_TEST_KNOWLEDGE = false;

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
  'zwolnienie', 'wypowiedzenie', 'rodo', 'gdpr', 'hr', 'praca', 'zespół', 'mobbing', 
  'ocena', 'bhp', 'bezpieczeństwo', 'dane osobowe', 'prywatność', 'zgoda',
  'zatrudnienie', 'etat', 'kontrakt', 'pensja', 'płaca', 'stawka', 'bonus',
  'premie', 'nadgodziny', 'godziny', 'rozmowa kwalifikacyjna', 'cv', 
  'kandydat', 'stanowisko', 'awans', 'degradacja', 'urlop macierzyński',
  'urlop ojcowski', 'zwolnienie lekarskie', 'okres próbny', 'mentoring',
  'szkolenia', 'rozwój zawodowy', 'kompetencje', 'ocena pracownicza',
  'molestowanie', 'dyskryminacja', 'równe traktowanie', 'przetwarzanie danych',
  'kodeks pracy', 'minimum płacowe', 'czas pracy', 'elastyczny czas', 
  'home office', 'praca zdalna', 'wypoczynkowy', 'macierzyński', 'ojcowski'
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

// --- System prompt do OpenAI (POPRAWIONY)
function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (unikatowe info)' : 'PEŁNEJ PRODUKCYJNEJ';

  return `Jesteś doświadczonym ekspertem HR w Polsce. Odpowiadasz na pytania związane z HR, prawem pracy i zarządzaniem zespołem.

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

INSTRUKCJE ODPOWIADANIA:
1. **Używaj głównie powyższej bazy wiedzy**, ale możesz też używać swojej wiedzy o polskim prawie pracy
2. **Jeśli nie masz pewnych informacji**, powiedz grzecznie: "Nie jestem pewien tej informacji. Zalecam skonsultować się z działem HR lub prawnikiem."
3. **NIE UŻYWAJ** frazy "Brak danych w bazie" - brzmi nieprofesjonalnie
4. **Obliczaj rzeczy logicznie** - np. proporcjonalny urlop dla osób zatrudnionych w trakcie roku
5. **Bądź pomocny** - jeśli nie wiesz dokładnie, daj ogólne wskazówki
6. **Język prosty** - maksymalnie 400 słów na odpowiedź
7. **W trudnych sprawach** sugeruj konsultację z prawnikiem

PRZYKŁADY ODPOWIEDZI:
- Zamiast "Brak danych w bazie" → "Nie mam precyzyjnych informacji na ten temat. Polecam skonsultować się z działem kadr."
- Na pytania o proporcjonalny urlop → zawsze obliczaj proporcjonalnie do przepracowanych miesięcy
- Na skomplikowane sprawy → "To złożona kwestia prawna. Najlepiej skonsultować z prawnikiem."

OBLICZENIA URLOPU:
- Jeśli ktoś pracuje od lutego (11 miesięcy), to z 20 dni urlopu przysługuje: 20 × 11 ÷ 12 = 18,3 dni (zaokrągl do 18 dni)
- Podobnie dla 26 dni: 26 × 11 ÷ 12 = 23,8 dni (zaokrągl do 24 dni)

${USE_TEST_KNOWLEDGE ? 'TRYB TESTOWY: Używaj unikatowych danych (99 dni urlopu itp.)' : 'TRYB PRODUKCYJNY: Używaj rzeczywistych danych polskiego prawa pracy.'}`;
}

// --- Domyślny fallback prompt
function getDefaultSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.
- Używaj polskich przepisów
- Odpowiadaj krótko (max 300 słów)
- Język prosty i pomocny
- NIE używaj "Brak danych w bazie"
- W trudnych sprawach: konsultacja z prawnikiem`;
}

// --- Minimalna wiedza fallback
function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
Urlop: 20/26 dni (proporcjonalnie do przepracowanych miesięcy)
Urlop macierzyński: 20 tygodni
Urlop ojcowski: 2 tygodnie
Okres wypowiedzenia: 2 tyg / 1 mies / 3 mies
Minimalne wynagrodzenie 2024: 3490 zł brutto
RODO: CV max 12 miesięcy`;
}

// --- Fallback odpowiedzi (POPRAWIONE)
function getFallbackResponse(message) {
  if (!isHRRelated(message)) {
    return "Jestem ekspertem HR i najlepiej pomogę Ci z pytaniami o prawo pracy i zarządzanie zespołem. O co z tego zakresu chciałbyś zapytać?";
  }

  const lower = message.toLowerCase();
  if (USE_TEST_KNOWLEDGE) {
    if (lower.includes('urlop')) return 'Test: 99 dni urlopu, tylko w pełnię księżyca.';
    if (lower.includes('wypowiedzenie')) return 'Test: wypowiedzenie trwa 777 dni.';
    if (lower.includes('wynagrodzenie')) return 'Test: płaca 999,999 zł w czekoladowych monetach.';
    return 'Nie mam dokładnych informacji na ten temat w trybie testowym. Mogę pomóc z podstawowymi pytaniami HR.';
  }

  // PRODUKCYJNE fallback odpowiedzi (POPRAWIONE)
  if (lower.includes('urlop')) {
    return 'W Polsce przysługuje 20 dni urlopu (wykształcenie podstawowe/zawodowe) lub 26 dni (średnie/wyższe). Jeśli zacząłeś pracę w trakcie roku, urlop przysługuje proporcjonalnie do przepracowanych miesięcy.';
  }
  if (lower.includes('wypowiedzenie')) {
    return 'Okresy wypowiedzenia: 2 tygodnie (do 6 mies pracy), 1 miesiąc (6 mies - 3 lata), 3 miesiące (powyżej 3 lat).';
  }
  if (lower.includes('wynagrodzenie') || lower.includes('płaca')) {
    return 'Minimalne wynagrodzenie w 2024 roku: 3490 zł brutto miesięcznie.';
  }
  if (lower.includes('rodo')) {
    return 'RODO to rozporządzenie o ochronie danych osobowych. W HR dotyczy głównie rekrutacji - CV można przechowywać maksymalnie 12 miesięcy po zakończeniu procesu.';
  }
  
  return 'Nie jestem pewien tej konkretnej informacji. Polecam skonsultować się z działem kadr lub sprawdzić w Kodeksie Pracy. Mogę pomóc z innymi pytaniami HR!';
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

// Funkcja do sprawdzania aktualnego trybu
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
  getCurrentMode
};