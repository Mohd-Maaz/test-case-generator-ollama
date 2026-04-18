# DO-178C Test Case Generator

## LLM-Based Automated MC/DC Test Case Generation for Avionics Software Requirements

A web-based tool that automatically generates **MC/DC (Modified Condition/Decision Coverage)** test cases from avionics **High-Level Requirements (HLR)**, compliant with **DO-178C** certification objectives. The tool accepts natural-language requirements as input, derives the boolean logic formula, and produces a complete test case table with binary input/output combinations — exportable to Excel.

This tool supports **two deployment modes**:
- **Online Mode** — Uses APIMart's OpenAI-compatible API (cloud-hosted models like Gemini, GPT-4o, etc.)
- **Offline Mode** — Uses Ollama with locally-running open-source LLMs (LLaMA 3.1, Mistral, etc.)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Design](#2-architecture--design)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Prerequisites](#5-prerequisites)
6. [Setup — Online Mode (APIMart API)](#6-setup--online-mode-apimart-api)
7. [Setup — Offline Mode (Ollama)](#7-setup--offline-mode-ollama)
8. [Configuration Reference](#8-configuration-reference)
9. [Usage Guide](#9-usage-guide)
10. [Input Format (HLR)](#10-input-format-hlr)
11. [Output Format (Test Cases)](#11-output-format-test-cases)
12. [MC/DC Methodology](#12-mcdc-methodology)
13. [API Endpoints Reference](#13-api-endpoints-reference)
14. [Prompt Engineering](#14-prompt-engineering)
15. [Excel Export Format](#15-excel-export-format)
16. [Supported LLM Models](#16-supported-llm-models)
17. [Troubleshooting](#17-troubleshooting)
18. [Switching Between Online and Offline Modes](#18-switching-between-online-and-offline-modes)
19. [Limitations & Known Issues](#19-limitations--known-issues)
20. [References](#20-references)

---

## 1. Project Overview

In modern avionics development, DO-178C certification requires exhaustive requirements-based testing with MC/DC structural coverage and complete traceability. Manual test case development consumes 40–50% of verification effort.

This tool uses Large Language Models (LLMs) to automate the generation of MC/DC test cases from natural-language High-Level Requirements, reducing manual effort significantly.

**What the tool does:**
1. Accepts one or more HLRs as text input
2. Parses each requirement to identify input conditions, output signals, and logical connectives (AND, OR, mixed)
3. Derives the boolean formula (e.g., `OUT = C1 AND C2 AND C3`)
4. Generates MC/DC test cases — the minimum set of test cases that prove each condition independently affects the output
5. Displays results in a tabular format with flipped-condition highlighting
6. Exports results to `.xlsx` Excel files matching DO-178C documentation standards

---

## 2. Architecture & Design

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Frontend)                │
│  ┌───────────────────────────────────────────────┐  │
│  │  HLR Text Input  →  [Generate]  →  Results    │  │
│  │                      Table + Excel Export      │  │
│  └───────────────────────────────────────────────┘  │
│         │ POST /api/generate        │ POST /api/export
└─────────┼───────────────────────────┼───────────────┘
          ▼                           ▼
┌─────────────────────────────────────────────────────┐
│               Express.js Backend (server.js)        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Prompt       │  │ JSON Parser  │  │ XLSX      │  │
│  │ Builder      │  │ & Extractor  │  │ Exporter  │  │
│  └──────┬──────┘  └──────────────┘  └───────────┘  │
│         │ OpenAI SDK (chat.completions.create)      │
└─────────┼───────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────┐
│              LLM Backend (choose one)               │
│                                                     │
│  [ONLINE]  APIMart API (api.apimart.ai)             │
│            → Gemini 2.5 Flash, GPT-4o, Claude, etc. │
│                                                     │
│  [OFFLINE] Ollama (localhost:11434)                  │
│            → LLaMA 3.1, Mistral, Qwen, etc.        │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Both modes use the **OpenAI SDK** — Ollama and APIMart both expose OpenAI-compatible `/v1/chat/completions` endpoints, so only the `baseURL` and `apiKey` change between modes
- The frontend is a **single HTML file** with inline CSS/JS — zero build step, zero framework overhead
- JSON extraction from LLM responses is **robust** — handles markdown fences, leading/trailing text, and partial output

---

## 3. Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js v18+ | Server-side JavaScript |
| **Web Framework** | Express.js 4.x | HTTP server, API routes, static file serving |
| **LLM Client** | OpenAI SDK (`openai` npm) | Unified client for both APIMart and Ollama |
| **Excel Generation** | SheetJS (`xlsx` npm) | Server-side `.xlsx` file creation |
| **Environment Config** | dotenv | Loads `.env` variables |
| **Frontend** | Vanilla HTML/CSS/JS | Single-file UI, no build step |
| **LLM (Online)** | APIMart API | Cloud-hosted models (Gemini, GPT, Claude) |
| **LLM (Offline)** | Ollama | Local open-source models (LLaMA, Mistral) |

---

## 4. Project Structure

```
do178c-test-generator/
│
├── server.js              # Express backend — API routes, LLM integration, Excel export
├── package.json           # Node.js dependencies and scripts
├── .env                   # Environment configuration (API keys, model, port)
├── .gitignore             # Ignores node_modules/ and .env
├── README.md              # This documentation
│
├── public/                # Static frontend files served by Express
│   └── index.html         # Complete UI — input, results table, Excel export
│
└── node_modules/          # Installed dependencies (auto-generated by npm install)
```

### File Details

**`server.js` (292 lines)** — The entire backend:
- Lines 1–9: Imports and Express setup
- Lines 11–18: LLM client configuration (OpenAI SDK pointing to Ollama or APIMart)
- Lines 22–106: `buildPrompt()` — the MC/DC prompt engineering function
- Lines 108–177: `POST /api/generate` — receives HLR text, calls LLM, parses JSON response
- Lines 179–272: `POST /api/export` — converts JSON results to `.xlsx` Excel buffer
- Lines 274–286: `GET /api/health` — checks if Ollama is reachable (offline mode)
- Lines 288–292: Server startup

**`public/index.html` (530 lines)** — The entire frontend:
- Lines 1–299: CSS styling (dark theme, table formatting, status indicators)
- Lines 300–335: HTML structure (header, textarea, buttons, results container)
- Lines 337–525: JavaScript (generate, render, export, health check functions)

**`.env`** — Configuration file (not committed to git):
```
# For Offline Mode (Ollama):
OLLAMA_BASE=http://localhost:11434/v1
MODEL=llama3.1:8b
PORT=3000

# For Online Mode (APIMart) — replace the above with:
# APIMART_KEY=sk-your-api-key-here
# APIMART_BASE=https://api.apimart.ai/v1
# MODEL=gemini-2.5-flash
# PORT=3000
```

---

## 5. Prerequisites

| Prerequisite | Required For | Version |
|---|---|---|
| **Node.js** | Both modes | v18.0+ (for native `fetch` support) |
| **npm** | Both modes | v9+ (bundled with Node.js) |
| **Ollama** | Offline mode only | Latest from ollama.com |
| **APIMart API Key** | Online mode only | From apimart.ai |
| **8GB+ RAM** | Offline mode (8B model) | More for larger models |
| **GPU (optional)** | Offline mode | NVIDIA/AMD for faster inference |

---

## 6. Setup — Online Mode (APIMart API)

This mode uses APIMart's cloud API, which provides access to 100+ models (Gemini, GPT, Claude, etc.) through a single OpenAI-compatible endpoint.

### Step 1: Install Node.js

Download from https://nodejs.org (LTS version recommended).

```bash
node --version    # Should show v18.x or higher
npm --version     # Should show v9.x or higher
```

### Step 2: Get an APIMart API Key

Sign up at https://apimart.ai and obtain an API key (format: `sk-...`).

### Step 3: Install Dependencies

```bash
cd do178c-test-generator
npm install
```

### Step 4: Configure `.env` for Online Mode

Create or edit the `.env` file in the project root:

```env
APIMART_KEY=sk-your-api-key-here
APIMART_BASE=https://api.apimart.ai/v1
MODEL=gemini-2.5-flash
PORT=3000
```

### Step 5: Modify `server.js` for Online Mode

Change the client configuration block (lines 11–18) from:

```javascript
const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434/v1";
const MODEL = process.env.MODEL || "llama3.1:8b";

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: OLLAMA_BASE,
  timeout: 5 * 60 * 1000,
});
```

To:

```javascript
const APIMART_BASE = process.env.APIMART_BASE || "https://api.apimart.ai/v1";
const MODEL = process.env.MODEL || "gemini-2.5-flash";

const client = new OpenAI({
  apiKey: process.env.APIMART_KEY,
  baseURL: APIMART_BASE,
});
```

### Step 6: Run

```bash
npm start
```

Open **http://localhost:3000** in your browser.

### Recommended Models (Online Mode)

| Model | Speed | Quality | Best For |
|---|---|---|---|
| `gemini-2.5-flash` | Fast | Very Good | Default recommendation |
| `gpt-4o` | Fast | Excellent | Best accuracy |
| `gpt-4.1-mini` | Very Fast | Good | Quick iterations |
| `claude-sonnet-4-20250514` | Medium | Excellent | Complex requirements |
| `gemini-2.5-pro` | Medium | Excellent | Complex mixed-logic HLRs |

---

## 7. Setup — Offline Mode (Ollama)

This mode runs everything locally — no internet required, no API costs, full data privacy.

### Step 1: Install Node.js

Download from https://nodejs.org (LTS version recommended).

```bash
node --version    # Should show v18.x or higher
npm --version     # Should show v9.x or higher
```

### Step 2: Install Ollama

**Windows:**
Download the installer from https://ollama.com/download/windows and run it.

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 3: Pull a Model

```bash
ollama pull llama3.1:8b
```

This downloads the LLaMA 3.1 8B parameter model (~4.7 GB).

**Alternative models** (choose based on your hardware):

| Model | Download Size | RAM Required | Quality | Speed | Command |
|---|---|---|---|---|---|
| `llama3.2:3b` | ~2 GB | 4 GB+ | Good | Fast | `ollama pull llama3.2:3b` |
| `llama3.1:8b` | ~4.7 GB | 8 GB+ | Very Good | Medium | `ollama pull llama3.1:8b` |
| `mistral:7b` | ~4 GB | 8 GB+ | Very Good | Medium | `ollama pull mistral:7b` |
| `qwen2.5:7b` | ~4.4 GB | 8 GB+ | Very Good | Medium | `ollama pull qwen2.5:7b` |
| `llama3.1:70b` | ~40 GB | 48 GB+ | Excellent | Slow | `ollama pull llama3.1:70b` |

### Step 4: Start Ollama

Ollama typically starts automatically after installation. If not:

```bash
ollama serve
```

Verify it's running:

```bash
ollama list
```

You should see your downloaded model listed.

### Step 5: Install Project Dependencies

```bash
cd do178c-test-generator
npm install
```

### Step 6: Configure `.env` for Offline Mode

The `.env` file should contain:

```env
OLLAMA_BASE=http://localhost:11434/v1
MODEL=llama3.1:8b
PORT=3000
```

Change `MODEL` to match whichever model you pulled in Step 3.

### Step 7: Run the Application

```bash
npm start
```

Open **http://localhost:3000** in your browser.

The status bar will show: `Ollama connected. Model: llama3.1:8b | Available: llama3.1:8b`

If it shows an error, make sure Ollama is running (`ollama serve`).

---

## 8. Configuration Reference

All configuration is done via the `.env` file in the project root.

### Offline Mode (Ollama)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE` | `http://localhost:11434/v1` | Ollama's OpenAI-compatible API URL |
| `MODEL` | `llama3.1:8b` | Model name (must match `ollama list` output) |
| `PORT` | `3000` | Web server port |

### Online Mode (APIMart)

| Variable | Default | Description |
|---|---|---|
| `APIMART_KEY` | *(none)* | Your APIMart API key (`sk-...`) |
| `APIMART_BASE` | `https://api.apimart.ai/v1` | APIMart API base URL |
| `MODEL` | `gemini-2.5-flash` | Model to use (see supported models list) |
| `PORT` | `3000` | Web server port |

---

## 9. Usage Guide

### Step 1: Open the Application

Navigate to **http://localhost:3000** in your browser.

### Step 2: Paste HLR Requirements

In the text area, paste one or more High-Level Requirements. Each HLR should have:
- An **HLR ID** (e.g., `HLR-001`)
- The **requirement text** describing the boolean logic

Example:
```
HLR-001
The software shall set the Fuel_Enable output when Engine_Start_Command is active,
Engine_Stop_Command is not active, Fire_Detected is not active, Oil_Pressure_Low
is not active, Overspeed_Detected is not active, and Maintenance_Mode is not active.

HLR-002
The software shall set Emergency_Alert when Fire_Detected is active or
Engine_Failure is active or Overspeed_Detected is active.
```

### Step 3: Generate Test Cases

Click **Generate Test Cases**. The tool will:
1. Send the HLR text to the LLM with the MC/DC prompt
2. Parse the JSON response
3. Render a table for each HLR showing:
   - **Logical Overview** — conditions, output, and boolean formula
   - **Test Case Table** — TC_ID, Test Objective, all input values, expected output
   - **Flipped conditions highlighted** in yellow

### Step 4: Export to Excel

Click **Export to Excel** to download a `.xlsx` file with one sheet per HLR, formatted to match DO-178C documentation standards.

---

## 10. Input Format (HLR)

The tool accepts natural-language HLRs. Each HLR should follow this pattern:

```
HLR-<number>
<requirement text>
```

### Supported Requirement Patterns

**Pure AND logic:**
```
HLR-001
The software shall set Fuel_Enable when Engine_Start_Command is active and
Engine_Stop_Command is not active and Fire_Detected is not active.
```

**Pure OR logic:**
```
HLR-010
The software shall set Emergency_Alert when Fire_Detected is active or
Engine_Failure is active or Overspeed_Detected is active.
```

**Mixed logic:**
```
HLR-020
The software shall set System_Shutdown when (Fire_Detected is active and
Engine_Running is set) or Emergency_Override is active.
```

**Negated conditions:**
```
HLR-030
The software shall clear Fuel_Enable when Engine_Stop_Command is active and
Engine_Start_Command is not active.
```

### Supported Terminology

The tool recognizes and preserves these state terms:
- `active` / `not active`
- `set` / `not set`
- `cleared`
- `inactive`
- `enabled` / `disabled`

---

## 11. Output Format (Test Cases)

For each HLR, the tool generates:

### Logical Overview

```
C1: Engine_Start_Command is active
C2: Engine_Stop_Command is not active
C3: Fire_Detected is not active
OUT: Fuel_Enable is Set
OUT = C1 AND C2 AND C3
```

### Test Case Table

| TC_ID | Test Objective | Engine_Start_Command | Engine_Stop_Command | Fire_Detected | Fuel_Enable |
|---|---|---|---|---|---|
| TC_1.1 | All conditions met — output set | active | not active | not active | **Set** |
| TC_1.2 | Engine_Start_Command flipped | **not active** | not active | not active | **Not Set** |
| TC_1.3 | Engine_Stop_Command flipped | active | **active** | not active | **Not Set** |
| TC_1.4 | Fire_Detected flipped | active | not active | **active** | **Not Set** |

### JSON Structure (Internal)

```json
[
  {
    "hlr_id": "HLR-001",
    "hlr_text": "The software shall ...",
    "logical_overview": {
      "conditions": [
        {"id": "C1", "signal": "Engine_Start_Command", "true_state": "active"},
        {"id": "C2", "signal": "Engine_Stop_Command", "true_state": "not active"},
        {"id": "C3", "signal": "Fire_Detected", "true_state": "not active"}
      ],
      "output": {"signal": "Fuel_Enable", "true_state": "Set"},
      "formula": "OUT = C1 AND C2 AND C3"
    },
    "test_cases": [
      {
        "tc_id": "TC_1.1",
        "test_objective": "All conditions met — Fuel_Enable is Set",
        "inputs": {
          "Engine_Start_Command": "active",
          "Engine_Stop_Command": "not active",
          "Fire_Detected": "not active"
        },
        "outputs": {
          "Fuel_Enable": "Set"
        }
      }
    ]
  }
]
```

---

## 12. MC/DC Methodology

**Modified Condition/Decision Coverage (MC/DC)** is required by DO-178C for Level A software. It requires that each condition in a decision is shown to independently affect the outcome.

### For AND Logic: `OUT = C1 AND C2 AND ... AND Cn`

- **1 TRUE case**: all conditions in their required state → output is produced
- **N FALSE cases**: for each condition Ci, flip ONLY Ci while keeping all others TRUE → output is NOT produced
- **Total test cases**: N + 1

### For OR Logic: `OUT = C1 OR C2 OR ... OR Cn`

- **1 FALSE case**: all conditions in their non-required state → output is NOT produced
- **N TRUE cases**: for each condition Ci, set ONLY Ci to its required state → output IS produced
- **Total test cases**: N + 1

### For Mixed Logic: `OUT = (C1 AND C2) OR C3`

- Each condition must have an **independence pair** — two test cases that differ only in that condition's value and produce different outputs
- The tool minimizes total test cases while ensuring MC/DC for every condition

---

## 13. API Endpoints Reference

### `POST /api/generate`

Generates MC/DC test cases from HLR text.

**Request:**
```json
{
  "hlrText": "HLR-001\nThe software shall set Fuel_Enable when..."
}
```

**Response (success):**
```json
{
  "results": [
    {
      "hlr_id": "HLR-001",
      "hlr_text": "...",
      "logical_overview": { ... },
      "test_cases": [ ... ]
    }
  ]
}
```

**Response (error):**
```json
{
  "error": "Error message",
  "raw": "(optional) raw LLM response if JSON parse failed"
}
```

### `POST /api/export`

Exports test case results to an Excel file.

**Request:**
```json
{
  "results": [ ... ]  // Same structure as /api/generate response
}
```

**Response:** Binary `.xlsx` file download.

### `GET /api/health` (Offline mode only)

Checks if Ollama is running and lists available models.

**Response (connected):**
```json
{
  "status": "ok",
  "ollama": true,
  "models": ["llama3.1:8b", "mistral:7b"],
  "activeModel": "llama3.1:8b"
}
```

**Response (disconnected):**
```json
{
  "status": "error",
  "ollama": false,
  "message": "Ollama is not running. Start it with: ollama serve"
}
```

---

## 14. Prompt Engineering

The prompt is the core of the tool's accuracy. It is defined in `buildPrompt()` in `server.js`.

### Prompt Structure (4 steps)

1. **STEP 1 — PARSE THE REQUIREMENT**: Extract HLR ID, conditions, output, and **determine the exact logical connectives** (AND, OR, mixed). Explicit instruction to NOT default to AND everywhere.

2. **STEP 2 — DERIVE THE BOOLEAN FORMULA**: Write the formula using actual operators. Examples provided for pure AND, pure OR, mixed, and NOT expressions.

3. **STEP 3 — GENERATE MC/DC TEST CASES**: Separate rules for:
   - Pure AND → 1 true + N false cases
   - Pure OR → 1 false + N true cases
   - Mixed → independence pairs for each condition

4. **STEP 4 — FORMAT**: TC_ID format, test objectives, exact signal names and terminology from the requirement.

### Why This Prompt Design

- **No hardcoded examples** with specific signal names — prevents the LLM from copying examples instead of parsing the actual input
- **Explicit logic parsing instructions** — prevents AND-only bias
- **Structured JSON schema** with generic placeholders — guides the output format without biasing content
- **Low temperature (0.1)** — maximizes deterministic, correct output

---

## 15. Excel Export Format

The exported `.xlsx` file mirrors the structure of standard DO-178C test case documentation:

**Each HLR gets its own worksheet** named by the HLR ID (e.g., `HLR-001`).

**Sheet layout:**
```
Row 1:    [blank] | HLR-001 + requirement text
Row 2:    [blank]
Row 3:    Logical Overview (conditions, formula)
Row 4-5:  [blank]
Row 6:    [blank] | [blank] | Inputs... | Outputs
Row 7:    TC_ID | Test Objective | Signal1 | Signal2 | ... | Output
Row 8+:   TC_1.1 | description | value | value | ... | Set/Not Set
```

**Column widths** are auto-sized based on signal name length (minimum 18 characters).

---

## 16. Supported LLM Models

### Online Mode (APIMart) — 100+ models available

| Model | Type | Strengths |
|---|---|---|
| `gemini-2.5-flash` | Google | Fast, good JSON output |
| `gemini-2.5-pro` | Google | Best for complex logic |
| `gpt-4o` | OpenAI | Excellent accuracy |
| `gpt-4.1-mini` | OpenAI | Fast, cost-effective |
| `gpt-4.1-nano` | OpenAI | Ultra-fast |
| `claude-sonnet-4-20250514` | Anthropic | Excellent reasoning |
| `grok-3` | xAI | Good general performance |

### Offline Mode (Ollama) — Open-source models

| Model | Parameters | Download | RAM | JSON Quality |
|---|---|---|---|---|
| `llama3.2:3b` | 3B | ~2 GB | 4 GB+ | Fair |
| `llama3.1:8b` | 8B | ~4.7 GB | 8 GB+ | Good |
| `mistral:7b` | 7B | ~4 GB | 8 GB+ | Good |
| `qwen2.5:7b` | 7B | ~4.4 GB | 8 GB+ | Good |
| `llama3.1:70b` | 70B | ~40 GB | 48 GB+ | Excellent |
| `deepseek-r1:8b` | 8B | ~4.9 GB | 8 GB+ | Good |

**Recommendation**: For reliable JSON output, use at least a 7B/8B parameter model. 3B models may produce malformed JSON occasionally.

---

## 17. Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---|---|---|
| "Ollama is not running" | Ollama service not started | Run `ollama serve` in a terminal |
| "Model not found" | Model not downloaded | Run `ollama pull llama3.1:8b` |
| "Connection refused" on port 3000 | Server not running | Run `npm start` |
| "Cannot reach server" in browser | Wrong URL or port | Check `PORT` in `.env`, open `http://localhost:<PORT>` |
| "Failed to parse LLM response as JSON" | LLM returned malformed output | Try again (local models can be inconsistent). Use a larger model for better reliability. |
| Slow generation (>60s) | Normal for local models | 8B models take 30–120s. Use `llama3.2:3b` for speed, or add a GPU. |
| "429 Too Many Requests" (Online) | API rate limit | Wait 30s and retry, or use a different model |
| "ECONNREFUSED 127.0.0.1:11434" | Ollama not running on expected port | Verify with `ollama list`, check `OLLAMA_BASE` in `.env` |
| Incorrect AND/OR logic | Ambiguous requirement phrasing | Rephrase the requirement to make connectives explicit |
| Missing conditions in output | LLM missed parsing a condition | Break complex requirements into simpler sub-requirements |
| `node: command not found` | Node.js not installed | Install from https://nodejs.org |
| `npm install` fails | Network issue or Node.js too old | Use Node.js v18+, check internet connection |

### Debug Tips

1. **Check server console** — the terminal running `npm start` shows all logs including LLM call status and errors
2. **Check raw LLM output** — if JSON parsing fails, the raw response is returned in the error and logged to console
3. **Test Ollama directly** — `ollama run llama3.1:8b "Say hello"` verifies the model works
4. **Test API health** — open `http://localhost:3000/api/health` in your browser

---

## 18. Switching Between Online and Offline Modes

The only changes needed are in **`.env`** and **lines 11–18 of `server.js`**.

### To switch to Online (APIMart):

**.env:**
```env
APIMART_KEY=sk-your-key-here
APIMART_BASE=https://api.apimart.ai/v1
MODEL=gemini-2.5-flash
PORT=3000
```

**server.js (lines 11–18):**
```javascript
const APIMART_BASE = process.env.APIMART_BASE || "https://api.apimart.ai/v1";
const MODEL = process.env.MODEL || "gemini-2.5-flash";

const client = new OpenAI({
  apiKey: process.env.APIMART_KEY,
  baseURL: APIMART_BASE,
});
```

### To switch to Offline (Ollama):

**.env:**
```env
OLLAMA_BASE=http://localhost:11434/v1
MODEL=llama3.1:8b
PORT=3000
```

**server.js (lines 11–18):**
```javascript
const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434/v1";
const MODEL = process.env.MODEL || "llama3.1:8b";

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: OLLAMA_BASE,
  timeout: 5 * 60 * 1000, // 5 minutes — local models are slow
});
```

Then restart the server: `npm start`

---

## 19. Limitations & Known Issues

1. **Local model JSON reliability** — Smaller models (3B) may occasionally produce malformed JSON. Retry or use a larger model.
2. **Complex nested logic** — Very deeply nested boolean expressions (e.g., `((A AND B) OR (C AND D)) AND (E OR F)`) may not be parsed perfectly by smaller models.
3. **No requirement validation** — The tool does not verify whether the HLR is well-formed or complete. Garbage in, garbage out.
4. **Single-turn generation** — Each generation is independent; the tool does not maintain conversation context between requests.
5. **No persistent storage** — Generated results are held in browser memory only. Export to Excel before closing the page.
6. **Excel formatting** — The export produces functional `.xlsx` files but without advanced formatting (merged cells, colors, borders).
7. **Concurrent requests** — The server handles one LLM request at a time. Multiple simultaneous users will queue.

---

## 20. References

1. RTCA, "DO-178C, Software Considerations in Airborne Systems and Equipment Certification," 2011.
2. Youcheng Sun, "Functional Requirements-Based Automated Testing for Avionics," 2017, https://arxiv.org/pdf/1707.01466
3. Rajat Khanda, "The Future of Software Testing: AI-Powered Test Case Generation and Validation," https://arxiv.org/pdf/2409.05808
4. Ollama Documentation: https://ollama.com
5. APIMart Documentation: https://apimart.ai
6. OpenAI SDK: https://github.com/openai/openai-node
7. SheetJS (xlsx): https://docs.sheetjs.com
"# test-case-generator-ollama" 
#   t e s t - c a s e - g e n e r a t o r - o l l a m a  
 #   t e s t - c a s e - g e n e r a t o r - o l l a m a  
 