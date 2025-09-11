const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

// Start w trybie TEST (możesz potem zmieniać na false albo przez endpoint admina)
let USE_TEST_KNOWLEDGE = true;

function loadHRKnowledgeBase() {
  try {
    const fileName = USE_TEST_KNOWLEDGE ? 'hr-kompendium-test.txt' : 'hr-kompendium.txt';
    const filePath = path.join(__dirname, '..', 'data', fileName);
    
    hrKnowledgeBase = fs.readFileSync(filePath, 'utf8');
    
    console.log('✅ HR Knowledge Base loaded successfully');
    console.log(`📊 Knowledge Base: ${fileName}`);
    console.log(`📏 Size: ${Math.round(hrKnowledgeBase.length / 1000)}k characters`);
    console.log(`🧪 Test mode: ${USE_TEST_KNOWLEDGE ? 'ENABLED (using test knowledge)' : 'DISABLED (using full knowledge)'}`);
    
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

// Inicjalizuj bazę wiedzy przy starcie
loadHRKnowledgeBase();

// Lista słów kluczowych HR
const HR_KEYWORDS = [
  'urlop', 'umowa', 'pracownik', 'pracodawca', 'wynagrodzenie', 'rekrutacja', 
  'zwolnienie', 'wypowiedzenie', 'rodo', 'hr', 'praca', 'zespół', 'mobbing', 
  'ocena', 'bhp', 'bezpieczeństwo', 'etat', 'kontrakt', 'pensja', 'stawka',
  'bonus', 'premie', 'nadgodziny', 'godziny', 'rozmowa kwalifikacyjna',
  'cv', 'kandydat', 'stanowisko', 'awans', 'urlop macierzyński',
  'urlop ojcowski', 'zwolnienie lekarskie', 'okres próbny',
  'szkolenia', 'rozwój zawodowy', 'kompetencje', 'ocena pracownicza',
  'molestowanie', 'dyskryminacja', 'równe traktowanie',
  'kodeks pracy', 'czas pracy', 'home office', 'praca zdalna'
];

// Lista tematów NON-HR (do odrzucenia)
const NON_HR_TOPICS = [
  'gotowanie', 'przepis', 'jedzenie', 'kulinaria', 'kuchnia',
  'pogoda', 'sport', 'piłka nożna', 'film', 'serial', 'muzyka',
  'gra', 'gaming', 'technologia', 'programowanie', 'telefon',
  'komputer', 'auto', 'samochód', 'podróże', 'wakacje', 'hotel',
  'medycyna', 'lekarz', 'zdrowie', 'polityka', 'wybory', 'prezydent'
];

function isHRRelated(message) {
  const lowerMessage = String(message || '').toLowerCase();
  const hasHRKeywords = HR_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  const hasNonHRTopics = NON_HR_TOPICS.some(topic => lowerMessage.includes(topic));
  const isHelpQuestion = lowerMessage.includes('pomoc') || lowerMessage.includes('co umiesz');
  
  if (isHelpQuestion) return true;
  if (hasNonHRTopics && !hasHRKeywords) return false;
  if (hasHRKeywords) return true;
  return lowerMessage.length < 50;
}

function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  const knowledgeStatus = USE_TEST_KNOWLEDGE ? 'TESTOWEJ (z unikatowymi informacjami)' : 'PEŁNEJ';
  
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz TYLKO na pytania związane z zasobami ludzkimi i prawem pracy w Polsce.

ŹRÓDŁO WIEDZY: Używasz ${knowledgeStatus} bazy wiedzy załadowanej z pliku.

${USE_TEST_KNOWLEDGE ? 
'TRYB TESTOWY: Używasz TESTOWEJ bazy wiedzy z unikatowymi informacjami (99 dni urlopu, 777 dni wypowiedzenia, itp.)' : 
'TRYB PRODUKCYJNY: Używasz pełnej bazy wiedzy HR'}

ZAKRES TEMATÓW: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO w HR, zarządzanie zespołem, mobbing, BHP.`;
}

function getDefaultSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.`;
}

function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
  
Urlop: 20 dni (<10 lat stażu) lub 26 dni (≥10 lat).
Wypowiedzenie: 2 tyg., 1 mies., 3 mies. w zależności od stażu.
Minimalne wynagrodzenie 2024: 3,490 zł brutto.`;
}

function getFallbackResponse(message) {
  const lowerMessage = String(message || '').toLowerCase();

  if (!isHRRelated(lowerMessage)) {
    return "Jestem ekspertem HR i odpowiadam tylko na pytania o zasoby ludzkie i prawo pracy w Polsce. Mogę pomóc z urlopami, umowami, wynagrodzeniami, RODO, mobbingiem, BHP.";
  }

  if (USE_TEST_KNOWLEDGE) {
    const testResponses = {
      'urlop': 'Zgodnie z TEST bazą: 99 MAGICZNYCH dni urlopu 🌕',
      'wypowiedzenie': 'TEST: wypowiedzenie trwa 777 dni roboczych 💐',
      'wynagrodzenie': 'TEST: minimalna płaca 999,999 zł w czekoladowych monetach 🍫',
      'rodo': 'TEST: CV 888 lat w kryształowej skrzynce ✨'
    };
    for (const [k, v] of Object.entries(testResponses)) {
      if (lowerMessage.includes(k)) return v;
    }
    return 'Tryb TEST: unikatowa baza wiedzy (99 dni urlopu, czekoladowe monety itd.).';
  }

  const responses = {
    'urlop': 'Urlop wypoczynkowy: 20 dni (<10 lat) lub 26 dni (≥10 lat).',
    'wypowiedzenie': 'Okres wypowiedzenia: 2 tyg., 1 mies., 3 mies.',
    'nadgodzin': 'Limit nadgodzin: 150 h/rok, dodatki 50%/100%.',
    'minimalne': 'Minimalne wynagrodzenie 2024: 3,490 zł brutto.',
    'rodo': 'RODO: CV kandydatów maks. 12 miesięcy.',
    'rekrutacja': 'W rekrutacji nie pytaj o ciążę, plany rodzinne itp.',
    'mobbing': 'Mobbing → zgłoś do HR i dokumentuj zdarzenia.'
  };
  for (const [k, v] of Object.entries(responses)) {
    if (lowerMessage.includes(k)) return v;
  }
  return 'Jestem ekspertem HR w Polsce. O co konkretnie chcesz zapytać?';
}

// Funkcje pomocnicze
function reloadKnowledgeBase() {
  return loadHRKnowledgeBase();
}

function setTestMode(enabled) {
  USE_TEST_KNOWLEDGE = enabled;
  return loadHRKnowledgeBase();
}

module.exports = { 
  getSystemPrompt, 
  getFallbackResponse, 
  isHRRelated,
  reloadKnowledgeBase,
  setTestMode
};