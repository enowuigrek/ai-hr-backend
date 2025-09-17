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
  'home office', 'praca zdalna', 'wypoczynkowy', 'macierzyński', 'ojcowski',
  'zostało', 'pozostało', 'wykorzystał', 'wakacje', 'wyjazd'
];

// --- Lista tematów NON-HR
const NON_HR_TOPICS = [
  'gotowanie','przepis','jedzenie','kulinaria','kuchnia',
  'pogoda','sport','piłka nożna','koszykówka','tenis',
  'film','serial','muzyka','książka','gra','gaming',
  'technologia','programowanie','kod','python','javascript',
  'telefon','komputer','auto','samochód','transport',
  'podróże','wakacje','turystyka','hotel', 'dupa', 'pizza',
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
  
  // Specjalne przypadki - kontekst urlopu
  if (lowerMessage.includes('zostało') || lowerMessage.includes('pozostało') || 
      lowerMessage.includes('wykorzysta') || lowerMessage.includes('byłem') ||
      lowerMessage.includes('wyjazd') || lowerMessage.includes('wakacje')) {
    return true;
  }
  
  if (isHelpQuestion) return true;
  if (hasNonHRTopics && !hasHRKeywords) return false;
  if (hasHRKeywords) return true;
  return lowerMessage.length < 50;
}

// --- System prompt do OpenAI (Z LEPSZYM ROZUMIENIEM KONTEKSTU)
function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (unikatowe info)' : 'PEŁNEJ PRODUKCYJNEJ';

  return `Jesteś doświadczonym ekspertem HR w Polsce. Rozmówca to Twój kolega z pracy który pyta o sprawy HR. Jesteś sprytny w rozumieniu kontekstu.

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

STYL ODPOWIEDZI:
1. **Język luźny i przyjacielski** - mów "Ty/Ci", używaj "Oj", "Hmm", "No"
2. **ROZUMIEJ KONTEKST** - jeśli ktoś mówi "byłem 2 tygodnie w Hiszpanii" w kontekście urlopu, to znaczy że wykorzystał 14 dni urlopu
3. **Dopytuj mądrze** - ale nie gdy masz wszystkie potrzebne informacje
4. **Łącz informacje** - jeśli ktoś pracuje "od 10 lat", automatycznie wie że ma 26 dni urlopu

ROZUMIENIE KONTEKSTU:
- "Byłem X tygodni/dni w [miejsce]" = wykorzystany urlop
- "Pracuję od X lat" → jeśli ≥10 lat = 26 dni urlopu, jeśli <10 lat = 20 dni
- "2 tygodnie" = 14 dni kalendarzowych = 10 dni roboczych urlopu
- "Tydzień" = 7 dni kalendarzowych = 5 dni roboczych urlopu

PRZYKŁADY INTELIGENTNEGO ROZUMIENIA:
❌ "Hmm, rozumiem że byłeś w Hiszpanii. Ile dni urlopu wykorzystałeś?"
✅ "OK, czyli wykorzystałeś 2 tygodnie urlopu (10 dni roboczych). Skoro pracujesz od 10 lat, masz 26 dni rocznie, więc zostało Ci 16 dni urlopu."

❌ "Nie rozumiem co masz na myśli"
✅ "Ah, rozumiem - chcesz wiedzieć ile urlopu Ci zostało po tych wakacjach w Hiszpanii!"

OBLICZENIA:
- **Długość pracy → wymiar urlopu:** ≥10 lat = 26 dni, <10 lat = 20 dni
- **Tygodnie urlopu:** 1 tydzień = 5 dni roboczych, 2 tygodnie = 10 dni roboczych
- **Urlop proporcjonalny:** jeśli od [miesiąc] to: wymiar × (12-miesiąc+1) ÷ 12

${USE_TEST_KNOWLEDGE ? 'TRYB TESTOWY: Używaj unikatowych danych (99 dni urlopu itp.)' : 'TRYB PRODUKCYJNY: Używaj rzeczywistych danych polskiego prawa pracy.'}

Pamiętaj: bądź sprytny, łącz informacje, rozumiej kontekst rozmowy!`;
}

// --- Domyślny fallback prompt (SPRYTNIEJSZY)
function getDefaultSystemPrompt() {
  return `Jesteś sprytnym ekspertem HR w Polsce. Rozumiesz kontekst rozmowy.
- Język luźny: "Oj, tego nie wiem. Mogę Ci pomóc z..."
- Rozumiej kontekst: "2 tygodnie w Hiszpanii" = wykorzystany urlop
- Łącz informacje: "pracuję od 10 lat" = 26 dni urlopu
- W trudnych sprawach: "Wiesz co, to lepiej zapytaj prawnika"`;
}

// --- Minimalna wiedza fallback
function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
Urlop: 20 dni (<10 lat pracy) lub 26 dni (≥10 lat pracy)
Urlop macierzyński: 20 tygodni
Urlop ojcowski: 2 tygodnie
Okres wypowiedzenia: 2 tyg / 1 mies / 3 mies
Minimalne wynagrodzenie 2024: 3490 zł brutto
RODO: CV max 12 miesięcy
Urlop w dniach roboczych: 1 tydzień = 5 dni, 2 tygodnie = 10 dni`;
}

// --- Fallback odpowiedzi (SPRYTNIEJSZE)
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

  // PRODUKCYJNE fallback odpowiedzi (SPRYTNIEJSZE)
  if (lower.includes('urlop') || lower.includes('zostało') || lower.includes('wykorzysta') || 
      lower.includes('byłem') || lower.includes('wakacje')) {
    
    // Próbuj wyciągnąć informacje z kontekstu
    const hasYears = lower.match(/(\d+)\s*(lat|rok)/);
    const hasWeeks = lower.match(/(\d+)\s*(tyg|tydzień)/);
    const hasDays = lower.match(/(\d+)\s*dni/);
    
    if (hasYears && hasWeeks) {
      const years = parseInt(hasYears[1]);
      const weeks = parseInt(hasWeeks[1]);
      const yearlyDays = years >= 10 ? 26 : 20;
      const usedDays = weeks * 5; // tygodnie na dni robocze
      const remaining = yearlyDays - usedDays;
      
      return `OK, rozumiem! Skoro pracujesz od ${years} lat, masz ${yearlyDays} dni urlopu rocznie. ${weeks} tygodnie to ${usedDays} dni roboczych urlopu, więc zostało Ci ${remaining} dni urlopu.`;
    }
    
    if (lower.includes('zostało') || lower.includes('pozostało')) {
      return 'Żeby to policzyć, powiedz mi - ile lat już pracujesz? I ile dni/tygodni urlopu wykorzystałeś w tym roku?';
    }
    
    return 'W Polsce masz 20 dni urlopu (do 10 lat pracy) lub 26 dni (10+ lat). Jeśli zacząłeś w trakcie roku, to proporcjonalnie. O co konkretnie pytasz?';
  }
  
  if (lower.includes('wypowiedzenie')) {
    if (lower.includes('jak długo') || lower.includes('ile') || lower.includes('okres')) {
      return 'Żeby Ci powiedzieć jaki masz okres wypowiedzenia, muszę wiedzieć jak długo pracujesz u tego pracodawcy. Ile to już lat/miesięcy?';
    }
    return 'Okresy wypowiedzenia: 2 tygodnie (do pół roku), 1 miesiąc (pół roku do 3 lat), 3 miesiące (powyżej 3 lat). Jak długo tam pracujesz?';
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
  getFbackResponse, 
  isHRRelated,
  reloadKnowledgeBase,
  setTestMode,
  getCurrentMode
};