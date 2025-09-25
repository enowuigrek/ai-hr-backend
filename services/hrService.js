const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

// FLAGA PRODUKCYJNA
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

// --- System prompt do OpenAI (KONWERSACYJNY)
function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (unikatowe info)' : 'PEŁNEJ PRODUKCYJNEJ';

  return `Jesteś doświadczonym, ale luźnym ekspertem HR w Polsce. Rozmówca to Twój kolega z pracy który pyta Cię o sprawy HR.

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

STYL ODPOWIEDZI:
1. **Język luźny i przyjacielski** - mów "Ty/Ci", używaj "Oj", "Hmm", "No"
2. **Dopytuj zamiast zakładać** - jeśli brakuje informacji, zapytaj konkretnie
3. **Nie odpowiadaj wszystkimi możliwościami** - lepiej dopytaj o szczegóły
4. **Bądź pomocny** - jeśli nie wiesz, powiedz luźno i zaproponuj alternatywę

PRZYKŁADY STYLU:
❌ "Nie jestem pewien tej informacji. Zalecam skonsultować się z odpowiednim źródłem"
✅ "Oj, tego nie wiem. Mogę Ci pomóc z pytaniami o urlopy, umowy, wypowiedzenia i takie sprawy HR"

❌ "Wymiar urlopu wynosi 20 lub 26 dni w zależności od wykształcenia..."
✅ "Żeby Ci to policzyć, muszę wiedzieć - przysługuje Ci rocznie 20 czy 26 dni urlopu?"

ZASADY DOPYTYWANIA:
- **Urlop:** Zapytaj o wymiar roczny (20/26), od kiedy pracuje, ile wykorzystał
- **Wypowiedzenie:** Zapytaj jak długo pracuje u pracodawcy
- **Wynagrodzenie:** Zapytaj o stanowisko, wymiar etatu
- **Rekrutacja:** Zapytaj o konkretną sytuację

INFORMACJE POTRZEBNE DO OBLICZEŃ (bazuj na bazie wiedzy):
- **Urlop proporcjonalny:** miesiąc rozpoczęcia pracy × wymiar roczny ÷ 12
- **Okresy wypowiedzenia:** długość zatrudnienia u pracodawcy
- **Dodatki za nadgodziny:** pierwsze 2h = +50%, kolejne = +100%

${USE_TEST_KNOWLEDGE ? 'TRYB TESTOWY: Używaj unikatowych danych (99 dni urlopu itp.)' : 'TRYB PRODUKCYJNY: Używaj rzeczywistych danych polskiego prawa pracy.'}

Pamiętaj: lepiej dopytać niż dać nieprecyzyjną odpowiedź!`;
}

// --- Domyślny fallback prompt (LUŹNIEJSZY)
function getDefaultSystemPrompt() {
  return `Jesteś luźnym ekspertem HR w Polsce. Odpowiadasz jak kolega z pracy.
- Używaj języka: "Oj, tego nie wiem. Mogę Ci pomóc z..."
- Dopytuj o szczegóły zamiast podawać wszystkie opcje
- Styl przyjacielski: "Ty/Ci", "No", "Hmm"
- W trudnych sprawach: "Wiesz co, to lepiej zapytaj prawnika"`;
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

// --- Fallback odpowiedzi (LUŹNIEJSZE)
function getFallbackResponse(message) {
  if (!isHRRelated(message)) {
    return "Oj, tego nie wiem. Mogę Ci pomóc z pytaniami o urlopy, umowy o pracę, wypowiedzenia, wynagrodzenia i takie sprawy HR. O co chciałbyś zapytać?";
  }

  const lower = message.toLowerCase();
  if (USE_TEST_KNOWLEDGE) {
    if (lower.includes('urlop')) return 'Test: 99 dni urlopu, tylko w pełnię księżyca.';
    if (lower.includes('wypowiedzenie')) return 'Test: wypowiedzenie trwa 777 dni.';
    if (lower.includes('wynagrodzenie')) return 'Test: płaca 999,999 zł w czekoladowych monetach.';
    return 'Hmm, tego nie wiem w trybie testowym. Mogę pomóc z podstawowymi pytaniami o urlopy czy umowy.';
  }

  // PRODUKCYJNE fallback odpowiedzi (LUŹNIEJSZE)
  if (lower.includes('urlop')) {
    // Sprawdź czy ma szczegóły do obliczeń
    if (lower.includes('zostało') || lower.includes('pozostało') || lower.includes('wykorzysta')) {
      return 'Żeby Ci to policzyć, powiedz mi - przysługuje Ci rocznie 20 czy 26 dni urlopu? I od kiedy pracujesz w tej firmie?';
    }
    return 'W Polsce masz 20 dni urlopu (podstawowe wykształcenie) lub 26 dni (średnie/wyższe). Jeśli zacząłeś w trakcie roku, to proporcjonalnie mniej. O co konkretnie chciałeś zapytać?';
  }
  
  if (lower.includes('wypowiedzenie')) {
    if (lower.includes('jak długo') || lower.includes('ile') || lower.includes('okres')) {
      return 'Żeby Ci powiedzieć jaki masz okres wypowiedzenia, muszę wiedzieć jak długo pracujesz u tego pracodawcy. Ile to już lat/miesięcy?';
    }
    return 'Okresy wypowiedzenia zależą od stażu: 2 tygodnie (do pół roku), 1 miesiąc (pół roku do 3 lat), 3 miesiące (powyżej 3 lat). Jak długo już tam pracujesz?';
  }
  
  if (lower.includes('wynagrodzenie') || lower.includes('płaca')) {
    return 'Minimalna płaca to 3490 zł brutto. A o co konkretnie pytasz - o podwyżkę, dodatki, czy coś innego?';
  }
  
  if (lower.includes('rodo')) {
    return 'RODO to ochrona danych osobowych. W HR najważniejsze że CV możesz trzymać max 12 miesięcy po rekrutacji. O co dokładnie chciałeś wiedzieć?';
  }
  
  return 'Hmm, tego akurat nie jestem pewien. Wiesz co, sprawdź w Kodeksie Pracy albo zapytaj kogoś z kadr. Mogę Ci pomóc z innymi sprawami HR - urlopy, umowy, wypowiedzenia?';
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