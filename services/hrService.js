const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

function loadHRKnowledgeBase() {
  try {
    const filePath = path.join(__dirname, '..', 'data', 'hr-kompendium.txt');
    hrKnowledgeBase = fs.readFileSync(filePath, 'utf8');
    console.log('✅ HR Knowledge Base loaded successfully');
    console.log(`📊 Knowledge Base size: ${Math.round(hrKnowledgeBase.length / 1000)}k characters`);
    return true;
  } catch (error) {
    console.error('❌ Failed to load HR Knowledge Base:', error);
    hrKnowledgeBase = getDefaultKnowledge();
    return false;
  }
}

// Inicjalizuj bazę wiedzy przy starcie
loadHRKnowledgeBase();

// Lista słów kluczowych HR
const HR_KEYWORDS = [
  // Podstawowe tematy HR
  'urlop', 'umowa', 'pracownik', 'pracodawca', 'wynagrodzenie', 'rekrutacja', 
  'zwolnienie', 'wypowiedzenie', 'rodo', 'hr', 'praca', 'zespół', 'mobbing', 
  'ocena', 'bhp', 'bezpieczeństwo',
  
  // Dodatkowe tematy
  'zatrudnienie', 'etat', 'kontrakt', 'pensja', 'płaca', 'stawka', 'bonus',
  'premie', 'nadgodziny', 'godziny', 'rozmowa kwalifikacyjna', 'cv', 
  'kandydat', 'stanowisko', 'awans', 'degradacja', 'urlop macierzyński',
  'urlop ojcowski', 'zwolnienie lekarskie', 'okres próbny', 'mentoring',
  'szkolenia', 'rozwój zawodowy', 'kompetencje', 'ocena pracownicza',
  'molestowanie', 'dyskryminacja', 'równe traktowanie', 'dane osobowe',
  'przetwarzanie danych', 'zgodnie z rodo', 'kodeks pracy', 'minimum płacowe',
  'czas pracy', 'elastyczny czas', 'home office', 'praca zdalna'
];

// Lista tematów NON-HR (do odrzucenia)
const NON_HR_TOPICS = [
  'gotowanie', 'przepis', 'jedzenie', 'kulinaria', 'kuchnia',
  'pogoda', 'sport', 'piłka nożna', 'koszykówka', 'tenis',
  'film', 'serial', 'muzyka', 'książka', 'gra', 'gaming',
  'technologia', 'programowanie', 'kod', 'python', 'javascript',
  'telefon', 'komputer', 'auto', 'samochód', 'transport',
  'podróże', 'wakacje', 'turystyka', 'hotel',
  'medycyna', 'lekarz', 'choroby', 'leki', 'zdrowie',
  'polityka', 'wybory', 'rząd', 'prezydent', 'parlament'
];

function isHRRelated(message) {
  const lowerMessage = message.toLowerCase();
  
  // Sprawdź czy zawiera słowa kluczowe HR
  const hasHRKeywords = HR_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Sprawdź czy zawiera tematy NON-HR
  const hasNonHRTopics = NON_HR_TOPICS.some(topic => 
    lowerMessage.includes(topic)
  );
  
  // Sprawdź pytania pomocne (zawsze akceptuj)
  const isHelpQuestion = lowerMessage.includes('pomoc') || 
                         lowerMessage.includes('możesz') ||
                         lowerMessage.includes('co umiesz') ||
                         lowerMessage.includes('jak działa');
  
  // Logika decyzyjna
  if (isHelpQuestion) return true;
  if (hasNonHRTopics && !hasHRKeywords) return false;
  if (hasHRKeywords) return true;
  
  // Domyślnie akceptuj krótkie wiadomości (mogą być ogólne pytania HR)
  return lowerMessage.length < 50;
}

function getSystemPrompt() {
  if (!hrKnowledgeBase) {
    console.log('⚠️ Using fallback knowledge - full knowledge base not loaded');
    return getDefaultSystemPrompt();
  }

  return `Jesteś ekspertem HR w Polsce. Odpowiadasz TYLKO na pytania związane z zasobami ludzkimi i prawem pracy w Polsce.

TWOJA BAZA WIEDZY:
${hrKnowledgeBase}

ZASADY ODPOWIEDZI:
1. Odpowiadaj TYLKO na pytania HR/prawne dotyczące pracy w Polsce
2. Używaj informacji z bazy wiedzy powyżej
3. Odpowiadaj konkretnie, zwięźle (max 400 słów)
4. Używaj prostego, zrozumiałego języka
5. Zawsze wspominaj o konsultacji z prawnikiem w skomplikowanych sprawach
6. Jeśli pytanie jest spoza zakresu HR - odmów grzecznie

ZAKRES TEMATÓW: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO w HR, zarządzanie zespołem, mobbing, BHP, oceny pracowników, prawo pracy.

JEŚLI PYTANIE SPOZA HR: Odpowiedz: "Jestem ekspertem HR i odpowiadam tylko na pytania o zasoby ludzkie i prawo pracy w Polsce. O co z tego zakresu chciałbyś zapytać?"`;
}

function getDefaultSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.

ZASADY:
- Używaj polskich przepisów (Kodeks Pracy, RODO)
- Odpowiadaj konkretnie i zwięźle (max 300 słów)
- Używaj prostego, zrozumiałego języka
- Zawsze wspominaj o konsultacji z prawnikiem w skomplikowanych sprawach

ZAKRES: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO, zarządzanie zespołem, mobbing, BHP.`;
}

function getDefaultKnowledge() {
  return `# PODSTAWOWA WIEDZA HR - POLSKA
  
## URLOPY
- Urlop wypoczynkowy: 20 dni (do 10 lat pracy) lub 26 dni (powyżej 10 lat)
- Urlop macierzyński: 20 tygodni
- Urlop ojcowski: 2 tygodnie

## WYPOWIEDZENIA
- Do 6 miesięcy pracy: 2 tygodnie
- Od 6 miesięcy do 3 lat: 1 miesiąc  
- Powyżej 3 lat: 3 miesiące

## WYNAGRODZENIA
- Minimalne wynagrodzenie 2024: 3,490 zł brutto
- Nadgodziny: limit 150h/rok, max 4h/dzień
- Dodatek za nadgodziny: 50% za pierwsze 2h, 100% za kolejne

## RODO W HR
- CV kandydatów: max 12 miesięcy przechowywania
- Dane pracowników: na podstawie umowy o pracę
- Obowiązek informacyjny przy zbieraniu danych`;
}

function getFallbackResponse(message) {
  // Sprawdź czy pytanie jest związane z HR
  if (!isHRRelated(message)) {
    return "Jestem ekspertem HR i odpowiadam tylko na pytania o zasoby ludzkie i prawo pracy w Polsce. Mogę pomóc z tematami takimi jak: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO w HR, mobbing, BHP. O co z tego zakresu chciałbyś zapytać?";
  }

  const lowerMessage = message.toLowerCase();

  const responses = {
    'urlop': 'W Polsce przysługuje ci urlop wypoczynkowy: 20 dni (jeśli pracujesz krócej niż 10 lat) lub 26 dni (jeśli dłużej). Urlop macierzyński to 20 tygodni dla mamy, ojcowski to 2 tygodnie. W skomplikowanych sprawach skonsultuj się z prawnikiem.',
    
    'wypowiedzenie': 'Okresy wypowiedzenia w Polsce: do 6 miesięcy pracy - 2 tygodnie, od 6 miesięcy do 3 lat - 1 miesiąc, powyżej 3 lat - 3 miesiące. W skomplikowanych sprawach skonsultuj się z prawnikiem.',
    
    'nadgodzin': 'Limit nadgodzin w Polsce: maksymalnie 150 godzin rocznie i nie więcej niż 4 godziny dziennie. Dodatek za nadgodziny: 50% wynagrodzenia za pierwsze 2 godziny, 100% za kolejne.',
    
    'minimalne': 'Minimalne wynagrodzenie w Polsce w 2024 roku wynosi 3,490 zł brutto miesięcznie. Kwota jest waloryzowana corocznie.',
    
    'rodo': 'RODO w HR: CV kandydatów możesz przechowywać maksymalnie 12 miesięcy po rekrutacji. Dane pracowników przetwarzasz na podstawie umowy o pracę. Zawsze informuj o celu przetwarzania danych.',
    
    'rekrutacja': 'W rekrutacji zabronione są pytania o: ciążę, plany macierzyńskie, stan cywilny, życie rodzinne, orientację seksualną, poglądy polityczne/religijne. Pytać można o doświadczenie, umiejętności, dostępność.',
    
    'mobbing': 'Mobbing to poważna sprawa. Należy: 1) Zgłosić do HR lub przełożonego, 2) Udokumentować zdarzenia, 3) Rozważyć zgłoszenie do PIP. Pracownik ma prawo do odszkodowania.'
  };

  for (const [keyword, response] of Object.entries(responses)) {
    if (lowerMessage.includes(keyword)) {
      return response;
    }
  }

  // Pytania pomocne
  if (lowerMessage.includes('pomoc') || lowerMessage.includes('możesz')) {
    return 'Jestem AI Asystentem HR w Polsce. Pomagam z pytaniami o: urlopy, umowy o pracę, wypowiedzenia, wynagrodzenia, rekrutację, RODO w HR, zarządzanie zespołem, mobbing i BHP. Zadaj konkretne pytanie!';
  }

  return 'Jestem ekspertem HR w Polsce. Odpowiadam na pytania o prawo pracy, rekrutację i zarządzanie zespołem. O co konkretnie chciałbyś zapytać? W skomplikowanych sprawach zawsze skonsultuj się z prawnikiem.';
}

// Funkcja do przeładowania bazy wiedzy (dla hot-reload w development)
function reloadKnowledgeBase() {
  return loadHRKnowledgeBase();
}

module.exports = { 
  getSystemPrompt, 
  getFallbackResponse, 
  isHRRelated,
  reloadKnowledgeBase 
};