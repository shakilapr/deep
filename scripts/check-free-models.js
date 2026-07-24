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

const API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: OPENROUTER_API_KEY is not set in environment or .env file.');
  process.exit(1);
}

// Known free model candidate slugs
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
        status: 'OK',
        latency,
        tokensUsed,
        error: null
      };
    } else {
      const errText = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) {
          msg = `${res.status}: ${errJson.error.message}`;
        }
      } catch (_) {}
      return {
        model: modelId,
        status: 'FAIL',
        latency,
        tokensUsed: 0,
        error: msg
      };
    }
  } catch (err) {
    clearTimeout(timer);
    const latency = Date.now() - start;
    const isTimeout = err.name === 'AbortError';
    return {
      model: modelId,
      status: 'FAIL',
      latency,
      tokensUsed: 0,
      error: isTimeout ? 'Timeout (>8s)' : err.message
    };
  }
}

async function main() {
  console.log('🔍 Fetching available free models from OpenRouter...');
  const dynamicModels = await fetchDynamicFreeModels();

  const modelSet = new Set([...KNOWN_FREE_MODELS, ...dynamicModels]);
  // Enforce STRICT policy: model MUST end with :free
  const targetModels = Array.from(modelSet).filter(m => m.endsWith(':free'));

  console.log(`⚡ Testing ${targetModels.length} candidate free models with ultra-low token probe (1 token prompt, max 1 token output)...`);
  console.log('--------------------------------------------------------------------------------');

  const results = [];
  const BATCH_SIZE = 4;
  for (let i = 0; i < targetModels.length; i += BATCH_SIZE) {
    const batch = targetModels.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(m => probeModel(m)));
    results.push(...batchResults);
  }

  const working = results.filter(r => r.status === 'OK');
  const failed = results.filter(r => r.status === 'FAIL');

  console.log('\n✅ WORKING FREE MODELS (READY TO USE):');
  if (working.length === 0) {
    console.log('  (No working free models responded at this moment)');
  } else {
    working.sort((a, b) => a.latency - b.latency);
    working.forEach(r => {
      console.log(`  • [${r.latency}ms] ${r.model} (Tokens used: ${r.tokensUsed})`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ UNAVAILABLE / RATE-LIMITED FREE MODELS:');
    failed.forEach(r => {
      console.log(`  • ${r.model} -> ${r.error}`);
    });
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`Summary: ${working.length}/${targetModels.length} free models are online and responsive.`);
  
  if (working.length > 0) {
    console.log(`\n💡 Recommended primary model right now: ${working[0].model}`);
  }
}

main();
