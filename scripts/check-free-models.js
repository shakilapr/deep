import fs from 'fs';
import path from 'path';

// Simple .env parser (zero external dependencies)
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: OPENROUTER_API_KEY is not set in environment or .env file.');
  process.exit(1);
}

// Recommended Models Map by Category
const RECOMMENDED_BY_CATEGORY = {
  'Agent Orchestration': 'nvidia/nemotron-3-super-120b-a12b:free',
  'Coding & Agentic Work': 'cohere/north-mini-code:free',
  'Deep Research (1M Context)': 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'Multimodal & Reasoning': 'google/gemma-4-31b-it:free',
  'Cost-Efficient MoE': 'google/gemma-4-26b-a4b-it:free',
  'Low Latency Inference': 'openai/gpt-oss-20b:free'
};

// Candidate free models pool
const KNOWN_FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'cohere/north-mini-code:free',
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'inclusionai/ling-3.0-flash:free',
  'poolside/laguna-s-2.1:free',
  'poolside/laguna-xs-2.1:free',
  'poolside/laguna-m.1:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-3.5-content-safety:free'
];

async function fetchDynamicFreeModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://github.com/openrouter',
        'X-Title': 'Free Model Checker'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.data)) return [];
    
    return data.data
      .filter(m => {
        const isFreePrice = m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0;
        const isFreeId = m.id && m.id.endsWith(':free');
        return isFreePrice || isFreeId;
      })
      .map(m => m.id);
  } catch (e) {
    return [];
  }
}

/**
 * Probes a model with ultra-low token consumption:
 * - 1 character / minimal prompt ("?")
 * - max_tokens: 1
 * Total token consumption: ~2 tokens!
 */
async function probeModel(modelId, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/openrouter',
        'X-Title': 'Free Model Token-Efficient Probe'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: '?' }],
        max_tokens: 1,
        temperature: 0
      }),
      signal: controller.signal
    });

    clearTimeout(timer);
    const latency = Date.now() - start;

    if (res.ok) {
      const data = await res.json();
      const tokensUsed = data.usage ? (data.usage.total_tokens || 2) : 2;
      return {
        model: modelId,
        status: 'READY',
        latency,
        tokensUsed,
        note: `${latency}ms`
      };
    } else {
      const errText = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) {
          msg = errJson.error.message;
        }
      } catch (_) {}
      return {
        model: modelId,
        status: 'BUSY/OFFLINE',
        latency,
        tokensUsed: 0,
        note: msg
      };
    }
  } catch (err) {
    clearTimeout(timer);
    const latency = Date.now() - start;
    const isTimeout = err.name === 'AbortError';
    return {
      model: modelId,
      status: 'BUSY/OFFLINE',
      latency,
      tokensUsed: 0,
      note: isTimeout ? 'Timeout (>8s)' : err.message
    };
  }
}

async function main() {
  console.log('🌟 RECOMMENDED MODELS BY USE CASE:');
  for (const [category, model] of Object.entries(RECOMMENDED_BY_CATEGORY)) {
    console.log(`  • [${category.padEnd(26, ' ')}]: ${model}`);
  }

  console.log('\n🔍 Gathering candidate free models from OpenRouter catalog...');
  const dynamicModels = await fetchDynamicFreeModels();

  const modelSet = new Set([...KNOWN_FREE_MODELS, ...dynamicModels]);
  const targetModels = Array.from(modelSet).filter(m => m.endsWith(':free'));

  console.log(`⚡ Testing all ${targetModels.length} candidate free models (~2 tokens per probe)...`);
  console.log('--------------------------------------------------------------------------------');

  const results = [];
  const BATCH_SIZE = 4;
  for (let i = 0; i < targetModels.length; i += BATCH_SIZE) {
    const batch = targetModels.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(m => probeModel(m)));
    results.push(...batchResults);
  }

  console.log('\nREAL-TIME FREE MODEL STATUS:');
  results.forEach((r, idx) => {
    const icon = r.status === 'READY' ? '🟢' : '🟡';
    console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${icon} [${r.status.padEnd(12, ' ')}] ${r.model.padEnd(50, ' ')} (${r.note})`);
  });

  console.log('--------------------------------------------------------------------------------');
  const readyCount = results.filter(r => r.status === 'READY').length;
  console.log(`Summary: ${readyCount}/${targetModels.length} candidate free models are responsive right now.`);
}

main();
