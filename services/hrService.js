// services/hrService.js
const fs = require('fs');
const path = require('path');

// Ładowanie pełnej bazy wiedzy HR
let hrKnowledgeBase = null;

// ZMIANA: Przełącz na tryb PRODUKCYJNY
let USE_TEST_KNOWLEDGE = false; // ← ZMIENIONE z true na false

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

// Reszta kodu pozostaje bez zmian...
// [pozostałe funkcje bez modyfikacji]
