const { pool } = require('../config/database');

async function saveConversation(sessionId, userMessage, aiResponse, responseTimeMs = 0) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const messageLength = userMessage.length + aiResponse.length;
    
    // NOWE: Upewnij się że sesja istnieje przed zapisaniem konwersacji
    await client.query(
      `INSERT INTO sessions (session_id, session_name) 
       VALUES ($1, $2) 
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, `Sesja ${new Date().toLocaleDateString('pl-PL')}`]
    );
    
    // Zapisz konwersację
    const result = await client.query(
      `INSERT INTO conversations (session_id, user_message, ai_response, message_length, response_time_ms) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, userMessage, aiResponse, messageLength, responseTimeMs]
    );
    
    // Aktualizuj statystyki sesji
    await client.query(
      `UPDATE sessions 
       SET last_activity = CURRENT_TIMESTAMP, 
           message_count = COALESCE(message_count, 0) + 1,
           total_tokens = COALESCE(total_tokens, 0) + $2
       WHERE session_id = $1`,
      [sessionId, Math.ceil(messageLength / 4)]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Conversation and session saved for: ${sessionId}`);
    return result.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving conversation:', error);
    return null;
  } finally {
    client.release();
  }
}

async function getConversationHistory(sessionId, limit = 20, offset = 0) {
  try {
    // 🚀 POPRAWKA: Dodane logowanie dla debugowania
    console.log('🔍 Getting conversation history:', { sessionId, limit, offset });
    
    const result = await pool.query(
      `SELECT user_message, ai_response, timestamp 
       FROM conversations 
       WHERE session_id = $1 
       ORDER BY timestamp ASC 
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM conversations WHERE session_id = $1',
      [sessionId]
    );
    
    console.log('📊 History query result:', {
      sessionId,
      found: result.rows.length,
      total: parseInt(countResult.rows[0].total),
      firstMessage: result.rows[0] ? result.rows[0].user_message.substring(0, 50) + '...' : 'none'
    });
    
    return {
      messages: result.rows,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + result.rows.length < parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    console.error('❌ Error getting conversation history:', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

// 🚀 NOWA FUNKCJA: Pobierz tylko ostatnie N par wiadomości dla kontekstu
async function getRecentConversationContext(sessionId, pairs = 4) {
  try {
    console.log('🔍 Getting recent context:', { sessionId, pairs });
    
    // 🚀 POPRAWKA: Pobierz więcej wiadomości i sortuj poprawnie
    const result = await pool.query(
      `SELECT user_message, ai_response, timestamp, id
       FROM conversations 
       WHERE session_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [sessionId, pairs * 2] // pairs * 2 żeby mieć zapas
    );
    
    // Odwróć kolejność żeby były od najstarszych do najnowszych
    const messages = result.rows.reverse();
    
    console.log('📊 Recent context result:', {
      sessionId,
      foundRows: result.rows.length,
      messagesAfterReverse: messages.length,
      messageDetails: messages.map((msg, i) => ({
        index: i,
        userMessage: msg.user_message.substring(0, 30) + '...',
        aiResponse: msg.ai_response.substring(0, 30) + '...',
        timestamp: msg.timestamp
      }))
    });
    
    return {
      messages: messages,
      total: messages.length
    };
  } catch (error) {
    console.error('❌ Error getting recent context:', error);
    return { messages: [], total: 0 };
  }
}

// 🚀 NOWA FUNKCJA: Pobierz tylko ostatnie N par wiadomości dla kontekstu
async function getRecentConversationContext(sessionId, pairs = 4) {
  try {
    console.log('🔍 Getting recent context:', { sessionId, pairs });
    
    // Pobierz ostatnie N*2 wiadomości (każda para to user + assistant)
    const result = await pool.query(
      `SELECT user_message, ai_response, timestamp 
       FROM conversations 
       WHERE session_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [sessionId, pairs]
    );
    
    // Odwróć kolejność żeby były od najstarszych
    const messages = result.rows.reverse();
    
    console.log('📊 Recent context result:', {
      sessionId,
      pairs: messages.length,
      latestMessage: messages.length > 0 ? messages[messages.length - 1].user_message.substring(0, 50) + '...' : 'none'
    });
    
    return {
      messages: messages,
      total: messages.length
    };
  } catch (error) {
    console.error('❌ Error getting recent context:', error);
    return { messages: [], total: 0 };
  }
}

async function createSession(sessionId, sessionName = null) {
  try {
    const name = sessionName || `Sesja ${new Date().toLocaleDateString('pl-PL')}`;
    
    await pool.query(
      `INSERT INTO sessions (session_id, session_name) 
       VALUES ($1, $2) 
       ON CONFLICT (session_id) DO UPDATE SET 
       last_activity = CURRENT_TIMESTAMP`,
      [sessionId, name]
    );
    
    return true;
  } catch (error) {
    try {
      await pool.query(
        `INSERT INTO sessions (session_id) 
         VALUES ($1) 
         ON CONFLICT (session_id) DO UPDATE SET 
         last_activity = CURRENT_TIMESTAMP`,
        [sessionId]
      );
      return true;
    } catch (fallbackError) {
      console.error('Error creating session:', fallbackError);
      return false;
    }
  }
}

async function getAllSessions(limit = 50, offset = 0) {
  try {
    let result;
    try {
      result = await pool.query(
        `SELECT session_id, 
                COALESCE(session_name, 'Nowa konwersacja') as session_name,
                created_at, last_activity, 
                COALESCE(message_count, 0) as message_count,
                COALESCE(total_tokens, 0) as total_tokens,
                COALESCE(is_active, true) as is_active
         FROM sessions 
         WHERE COALESCE(is_active, true) = true
         ORDER BY last_activity DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    } catch (error) {
      result = await pool.query(
        `SELECT session_id, created_at, last_activity
         FROM sessions 
         ORDER BY last_activity DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM sessions WHERE COALESCE(is_active, true) = true'
    );
    
    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + result.rows.length < parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    console.error('Error getting sessions:', error);
    return { sessions: [], total: 0, hasMore: false };
  }
}

async function getSessionInfo(sessionId) {
  try {
    const result = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM conversations WHERE session_id = s.session_id) as actual_message_count,
              (SELECT MAX(timestamp) FROM conversations WHERE session_id = s.session_id) as last_message_time
       FROM sessions s 
       WHERE s.session_id = $1`,
      [sessionId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting session info:', error);
    return null;
  }
}

async function updateSessionName(sessionId, sessionName) {
  try {
    await pool.query(
      'UPDATE sessions SET session_name = $1 WHERE session_id = $2',
      [sessionName.trim(), sessionId]
    );
    return true;
  } catch (error) {
    console.error('Error updating session name:', error);
    return false;
  }
}

async function deactivateSession(sessionId) {
  try {
    // Try soft delete first
    try {
      await pool.query('UPDATE sessions SET is_active = FALSE WHERE session_id = $1', [sessionId]);
    } catch (error) {
      // Fallback to hard delete if column doesn't exist
      await pool.query('DELETE FROM conversations WHERE session_id = $1', [sessionId]);
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
    }
    return true;
  } catch (error) {
    console.error('Error deactivating session:', error);
    return false;
  }
}

module.exports = {
  saveConversation,
  getConversationHistory,
  getRecentConversationContext, // 🚀 NOWA FUNKCJA
  createSession,
  getAllSessions,
  getSessionInfo,
  updateSessionName,
  deactivateSession
};