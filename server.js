require("dotenv").config();
const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434/v1";
const MODEL = process.env.MODEL || "llama3.1:8b";

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: OLLAMA_BASE,
  timeout: 5 * 60 * 1000, // 5 minutes — local models are slow
});

console.log(`Using model: ${MODEL} via ${OLLAMA_BASE}`);

function buildPrompt(hlrText) {
  return `You are an expert avionics verification engineer specializing in DO-178C MC/DC test case generation.

TASK: Given High-Level Requirement(s) (HLR), generate test cases achieving MC/DC (Modified Condition/Decision Coverage).

STEP 1 — PARSE THE REQUIREMENT CAREFULLY:
- Extract the HLR ID, all input conditions (boolean signals), the output signal, and its expected state.
- **Determine the EXACT logical connectives** used in the requirement. Read the natural language carefully:
  - "and" between conditions → AND operator
  - "or" / "either...or" / "any of" / "at least one of" → OR operator
  - "when...regardless of" / "irrespective of" → that condition is a don't-care
  - Nested/grouped conditions with parentheses or clauses → preserve grouping
  - Mixed logic like "(A and B) or C" is common — parse it correctly
- **DO NOT assume AND everywhere.** The formula MUST match the requirement's actual logic.

STEP 2 — DERIVE THE BOOLEAN FORMULA:
Write the formula using the actual operators from the requirement.
Examples of valid formulas:
  - OUT = C1 AND C2 AND C3
  - OUT = C1 OR C2 OR C3
  - OUT = (C1 AND C2) OR C3
  - OUT = C1 AND (C2 OR C3) AND C4
  - OUT = NOT(C1) AND C2

STEP 3 — GENERATE MC/DC TEST CASES:
MC/DC requires that for each condition, there exists a pair of test cases where:
  - Only that condition changes value
  - The decision output changes as a result
This proves each condition independently affects the output.

Rules for MC/DC by operator:
- **For pure AND (OUT = C1 AND C2 AND ... AND Cn):**
  - One TRUE case: all conditions in their required state → output is produced
  - N FALSE cases: for each Ci, flip ONLY Ci → output is NOT produced
  - Total: N+1 test cases

- **For pure OR (OUT = C1 OR C2 OR ... OR Cn):**
  - One FALSE case: all conditions in their non-required state → output is NOT produced
  - N TRUE cases: for each Ci, flip ONLY Ci to its required state → output IS produced
  - Total: N+1 test cases

- **For mixed logic (e.g., OUT = (C1 AND C2) OR C3):**
  - Analyze the boolean expression and generate MC/DC pairs for each condition
  - Each condition must have an independence pair showing it alone can change the output
  - Minimize total test cases while ensuring every condition has its MC/DC pair

STEP 4 — FORMAT EACH TEST CASE:
- TC_ID: format TC_<hlr_number>.<test_number> (e.g., TC_1.1, TC_1.2)
- Test Objective: describe what this test case demonstrates
- Input values: use the EXACT terminology from the requirement ("active"/"not active", "set"/"not set", "cleared", etc.)
- Output value: "Set" or "Not Set" (or match requirement language like "cleared", "maintained", etc.)

CRITICAL RULES:
- Use EXACT signal names from the requirement
- Match terminology exactly as written in the requirement
- The formula MUST reflect the actual logical structure — do NOT default to AND
- For each condition, the "true state" is whatever the requirement specifies for that condition

Return a JSON array. Each element:
{
  "hlr_id": "HLR-XXX",
  "hlr_text": "<full requirement text>",
  "logical_overview": {
    "conditions": [
      {"id": "C1", "signal": "<signal_name>", "true_state": "<required state from requirement>"}
    ],
    "output": {"signal": "<output_signal>", "true_state": "<expected state>"},
    "formula": "<exact boolean formula using AND/OR/NOT with proper grouping>"
  },
  "test_cases": [
    {
      "tc_id": "TC_X.Y",
      "test_objective": "<description>",
      "inputs": {"<signal>": "<value>"},
      "outputs": {"<signal>": "<value>"}
    }
  ]
}

Generate test cases for the following HLR(s):

${hlrText}

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`;
}

// POST /api/generate - Generate test cases from HLR text
app.post("/api/generate", async (req, res) => {
  try {
    const { hlrText } = req.body;
    if (!hlrText || !hlrText.trim()) {
      return res.status(400).json({ error: "HLR text is required" });
    }

    const prompt = buildPrompt(hlrText.trim());
    console.log(`Calling ${MODEL} via Ollama...`);

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 16384,
      stream: false,
    });

    const responseText = (completion.choices[0].message.content || "").trim();
    console.log(`Success. Response length: ${responseText.length} chars`);

    // Extract JSON from response — local models often add extra text
    let jsonStr = responseText;
    // Strip markdown code fences
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }
    // If still not starting with [ or {, try to find the JSON array/object
    if (!jsonStr.startsWith("[") && !jsonStr.startsWith("{")) {
      const arrStart = jsonStr.indexOf("[");
      const objStart = jsonStr.indexOf("{");
      const start = arrStart >= 0 && objStart >= 0
        ? Math.min(arrStart, objStart)
        : Math.max(arrStart, objStart);
      if (start >= 0) {
        jsonStr = jsonStr.substring(start);
      }
    }
    // Trim trailing text after last ] or }
    const lastBracket = jsonStr.lastIndexOf("]");
    const lastBrace = jsonStr.lastIndexOf("}");
    const end = Math.max(lastBracket, lastBrace);
    if (end >= 0) {
      jsonStr = jsonStr.substring(0, end + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("JSON parse error. Raw response:\n", responseText);
      return res.status(500).json({
        error: "Failed to parse LLM response as JSON",
        raw: responseText,
      });
    }

    // Ensure it's an array
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    res.json({ results: parsed });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// POST /api/export - Export test cases to Excel buffer
app.post("/api/export", (req, res) => {
  try {
    const { results } = req.body;
    if (!results || !results.length) {
      return res.status(400).json({ error: "No results to export" });
    }

    const wb = XLSX.utils.book_new();

    for (const hlr of results) {
      const sheetData = [];

      // Row 1: HLR ID and text
      sheetData.push([
        "",
        `${hlr.hlr_id}\n${hlr.hlr_text}`,
      ]);
      sheetData.push([]); // blank row

      // Logical overview
      const lo = hlr.logical_overview;
      let loText = `Logical Overview of Requirements | ${hlr.hlr_id}\n`;
      for (const c of lo.conditions) {
        loText += `${c.id}: ${c.signal} is ${c.true_state}\n`;
      }
      loText += `OUT: ${lo.output.signal} is ${lo.output.true_state}\n`;
      loText += lo.formula;
      sheetData.push([loText]);
      sheetData.push([]); // blank row
      sheetData.push([]); // blank row

      // Header separator
      const inputSignals = lo.conditions.map((c) => c.signal);
      const outputSignals = [lo.output.signal];

      // Inputs/Outputs label row
      const labelRow = ["", ""];
      labelRow.push("Inputs");
      for (let i = 1; i < inputSignals.length; i++) labelRow.push("");
      labelRow.push("Outputs");
      sheetData.push(labelRow);

      // Column headers
      const headerRow = ["TC_ID", "Test Objective"];
      headerRow.push(...inputSignals);
      headerRow.push(...outputSignals);
      sheetData.push(headerRow);

      // Test case rows
      for (const tc of hlr.test_cases) {
        const row = [tc.tc_id, tc.test_objective];
        for (const sig of inputSignals) {
          row.push(tc.inputs[sig] || "");
        }
        for (const sig of outputSignals) {
          row.push(tc.outputs[sig] || "");
        }
        sheetData.push(row);
      }

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Set column widths
      const colWidths = [{ wch: 10 }, { wch: 55 }];
      for (const sig of inputSignals) {
        colWidths.push({ wch: Math.max(sig.length + 2, 18) });
      }
      for (const sig of outputSignals) {
        colWidths.push({ wch: Math.max(sig.length + 2, 14) });
      }
      ws["!cols"] = colWidths;

      // Sheet name limited to 31 chars
      const sheetName = hlr.hlr_id.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=DO178C_Test_Cases.xlsx"
    );
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: err.message || "Export failed" });
  }
});

// Health check — verify Ollama is reachable
app.get("/api/health", async (req, res) => {
  try {
    const resp = await fetch(
      (process.env.OLLAMA_BASE || "http://localhost:11434").replace("/v1", "") + "/api/tags"
    );
    const data = await resp.json();
    const models = (data.models || []).map((m) => m.name);
    res.json({ status: "ok", ollama: true, models, activeModel: MODEL });
  } catch (err) {
    res.status(503).json({ status: "error", ollama: false, message: "Ollama is not running. Start it with: ollama serve" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DO-178C Test Generator running at http://localhost:${PORT}`);
});
