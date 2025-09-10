function getSystemPrompt() {
  return `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.

ZASADY:
- Używaj polskich przepisów (Kodeks Pracy, RODO)
- Odpowiadaj konkretnie i zwięźle (max 300 słów)
- Używaj prostego, zrozumiałego języka
- Zawsze wspominaj o konsultacji z prawnikiem w skomplikowanych sprawach

ZAKRES: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO, zarządzanie zespołem, mobbing, BHP.`;
}

function getFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();

  const responses = {
    'urlop': 'W Polsce przysługuje ci urlop: 20 dni (do 10 lat pracy) lub 26 dni (powyżej 10 lat). Urlop macierzyński wynosi 20 tygodni.',
    'wypowiedzenie': 'Okresy wypowiedzenia: do 6 miesięcy - 2 tygodnie, od 6 miesięcy do 3 lat - 1 miesiąc, powyżej 3 lat - 3 miesiące.',
    'nadgodzin': 'Limit nadgodzin: 150h rocznie, max 4h dziennie. Dodatek: 50% za pierwsze 2h, 100% za kolejne.',
    'minimalne': 'Minimalne wynagrodzenie w 2024: 3 490 zł brutto miesięcznie.'
  };

  for (const [keyword, response] of Object.entries(responses)) {
    if (lowerMessage.includes(keyword)) {
      return response;
    }
  }

  return 'Jestem ekspertem HR w Polsce. Mogę pomóc z pytaniami o urlopy, umowy, wynagrodzenia, rekrutację, RODO i zarządzanie zespołem.';
}

module.exports = { getSystemPrompt, getFallbackResponse };