/**
 * Preview what the bot would reply — without Telegram, and without messaging a real person.
 *
 * Usage:
 *   npx ts-node scripts/dry-run.ts "salom, qalesan?"
 *   npx ts-node scripts/dry-run.ts "are you free tomorrow?" --as @bekzod
 *   npx ts-node scripts/dry-run.ts "привет" --provider ollama --model gemma3:12b
 *   npx ts-node scripts/dry-run.ts "salom" --compare gemma3:12b,mistral-nemo:12b -n 3
 *   npx ts-node scripts/dry-run.ts "salom" --show-prompt
 *
 * Flags:
 *   --as <@username>     resolve contact context as this person (tone, rules, examples)
 *   --provider <name>    gemini | ollama            (default: whatever .env selects)
 *   --model <name>       override the provider's model
 *   --compare a,b,c      run the same message through several Ollama models
 *   -n <count>           samples per model — these are sampled at temperature 0.85,
 *                        so one output tells you almost nothing (default: 1)
 *   --show-prompt        print the fully composed system prompt
 */
import "dotenv/config";

interface Args {
  message: string;
  as?: string;
  provider?: string;
  model?: string;
  compare?: string[];
  samples: number;
  showPrompt: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const args: Args = { message: "", samples: 1, showPrompt: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--as") args.as = argv[++i];
    else if (a === "--provider") args.provider = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--compare") args.compare = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "-n") args.samples = Number(argv[++i]) || 1;
    else if (a === "--show-prompt") args.showPrompt = true;
    else if (a && !a.startsWith("--")) positional.push(a);
  }
  args.message = positional.join(" ");
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.message) {
    console.error('Usage: npx ts-node scripts/dry-run.ts "<incoming message>" [--as @user] [--compare a,b] [-n 3]');
    process.exit(1);
  }

  // Every AI module reads its config at import time, so overrides must be applied
  // BEFORE the first import — hence the dynamic imports below.
  if (args.provider) {
    process.env.AI_PROVIDER = args.provider;
    delete process.env.AI_PROVIDER_CHAT;
  }
  if (args.model) {
    const p = (args.provider ?? process.env.AI_PROVIDER ?? "gemini").toLowerCase();
    if (p === "ollama") process.env.OLLAMA_MODEL = args.model;
    else process.env.GEMINI_MODEL = args.model;
  }

  const models = args.compare ?? [null];
  const username = args.as?.replace(/^@/, "");
  // A chat_id that won't collide with a real contact, so lookup falls through to @username.
  const fakeChatId = -1;

  for (const model of models) {
    if (model) process.env.OLLAMA_MODEL = model;
    if (args.compare) process.env.AI_PROVIDER = args.provider ?? "ollama";

    // Fresh module registry per model, so import-time config is re-read.
    for (const key of Object.keys(require.cache)) delete require.cache[key];

    const { composeSystemPrompt } = await import("../src/handlers/business");
    const ai = await import("../src/ai");

    const prompt = composeSystemPrompt(fakeChatId, username);
    if (args.showPrompt) {
      console.log("─".repeat(70));
      console.log(prompt);
      console.log("─".repeat(70));
    }

    const label = model ?? `${ai.CHAT_PROVIDER}`;
    console.log(`\n=== ${label}  <<< ${args.message}${username ? `  (as @${username})` : ""}`);

    for (let i = 0; i < args.samples; i++) {
      const t0 = Date.now();
      try {
        const reply = await ai.generateReply(prompt, [], args.message);
        console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${reply}`);
      } catch (err) {
        console.log(`  ✗ ${(err as Error).message}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
