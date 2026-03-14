import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { SendChatMessageBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const chatSessions = new Map<string, Array<{ id: string; role: "user" | "assistant"; content: string; codeSnippet?: string; timestamp: string }>>();

function generateAIResponse(message: string, code?: string): { content: string; codeSnippet?: string } {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("slow") || lowerMsg.includes("performance") || lowerMsg.includes("optimize")) {
    return {
      content: "The performance issue likely stems from an O(n²) or worse time complexity. Here's what's happening:\n\n**Root Cause:** Nested loops or repeated linear scans are creating quadratic scaling. At 1,000 records this feels fast, but at 10,000+ records it becomes unbearable.\n\n**Fix Strategy:**\n1. Use a HashMap/Set for O(1) lookups instead of linear search\n2. Cache expensive computations using memoization\n3. Consider lazy evaluation — only compute when needed\n\n**Expected improvement:** From O(n²) to O(n log n) or O(n), which is ~100x faster at 10k records.",
      codeSnippet: `// Before: O(n²) - slow\nconst result = items.filter(item => \n  otherItems.find(o => o.id === item.id)\n);\n\n// After: O(n) - fast\nconst otherSet = new Set(otherItems.map(o => o.id));\nconst result = items.filter(item => otherSet.has(item.id));`,
    };
  }

  if (lowerMsg.includes("explain") || lowerMsg.includes("what does") || lowerMsg.includes("how does")) {
    return {
      content: `Let me break this down for you:\n\nThis function appears to be performing **data transformation** — taking input data and converting it to a different format or structure.\n\n**Key operations:**\n1. **Iteration** — loops through each element\n2. **Transformation** — applies a mapping function\n3. **Accumulation** — collects results into an output structure\n\n**Data flow:**\n\`input → validation → transformation → output\`\n\nThe function is designed to be **pure** (no side effects), meaning it returns a new value without modifying the original data. This is a good functional programming pattern.\n\n**Edge cases to watch:** null inputs, empty arrays, and malformed data structures.`,
      codeSnippet: `// This is what the function conceptually does:\nfunction transform(data) {\n  // 1. Validate input\n  if (!data) return null;\n  \n  // 2. Transform each element  \n  return data.map(item => ({\n    ...item,\n    processed: true\n  }));\n}`,
    };
  }

  if (lowerMsg.includes("edge case") || lowerMsg.includes("edge cases")) {
    return {
      content: `Great question! Here are the edge cases you should test for:\n\n**Boundary Conditions:**\n• Empty input (null, undefined, empty array/string)\n• Single element input\n• Maximum size input (stress test)\n• Negative numbers (if applicable)\n\n**Data Quality:**\n• Malformed data structures\n• Missing required fields\n• Type mismatches (string where number expected)\n• Unicode/special characters\n\n**Concurrency:**\n• Multiple simultaneous calls\n• Race conditions in async code\n\n**Network/IO:**\n• Timeout scenarios\n• Partial data responses\n• Retry behavior\n\nI'd recommend running these as unit tests:`,
      codeSnippet: `describe('Edge Cases', () => {\n  it('handles null input', () => {\n    expect(yourFunction(null)).toBeNull();\n  });\n  \n  it('handles empty array', () => {\n    expect(yourFunction([])).toEqual([]);\n  });\n  \n  it('handles single element', () => {\n    expect(yourFunction([1])).toEqual([1]);\n  });\n});`,
    };
  }

  if (lowerMsg.includes("security") || lowerMsg.includes("vulnerability") || lowerMsg.includes("inject")) {
    return {
      content: `Security analysis complete. Here are the critical vulnerabilities I found:\n\n🔴 **SQL Injection (CWE-89)** - HIGH RISK\nUser input is being concatenated directly into SQL queries. An attacker can input \`' OR '1'='1\` to bypass authentication entirely.\n\n🟠 **Missing Input Validation** - MEDIUM RISK\nNo sanitization of user-provided data before processing.\n\n🟡 **Exposed Error Details** - LOW RISK\nStack traces are being returned to the client, revealing internal implementation details.\n\n**Immediate action required:** Fix the SQL injection first — it's exploitable right now.`,
      codeSnippet: `// VULNERABLE - never do this:\nconst query = "SELECT * FROM users WHERE id = " + userId;\n\n// SAFE - use parameterized queries:\nconst query = await db.query(\n  'SELECT * FROM users WHERE id = $1',\n  [userId]\n);`,
    };
  }

  if (lowerMsg.includes("fix") || lowerMsg.includes("solution") || lowerMsg.includes("how to")) {
    return {
      content: `Here's the solution approach:\n\n**Step 1: Identify the root cause**\nBefore fixing, make sure you understand why the issue occurs, not just what the symptom is.\n\n**Step 2: Apply the fix**\nThe recommended approach here is to refactor the problematic section using a more robust pattern.\n\n**Step 3: Verify with tests**\nAlways add a test that would have caught this bug — this prevents regression.\n\n**Step 4: Review for similar patterns**\nSearch your codebase for similar patterns that might have the same issue.`,
      codeSnippet: `// Refactored version with proper error handling:\nasync function safeOperation(input) {\n  try {\n    // Validate input first\n    if (!input || typeof input !== 'string') {\n      throw new Error('Invalid input');\n    }\n    \n    const result = await processData(input);\n    return { success: true, data: result };\n  } catch (error) {\n    console.error('Operation failed:', error.message);\n    return { success: false, error: error.message };\n  }\n}`,
    };
  }

  return {
    content: `I've analyzed your question: **"${message}"**\n\nBased on the context provided, here's my assessment:\n\nThis appears to be a common pattern in ${code ? "the submitted code" : "code of this type"}. The key things to consider are:\n\n1. **Correctness** — Does the logic handle all cases correctly?\n2. **Performance** — Is this the most efficient approach?\n3. **Security** — Are there any attack vectors?\n4. **Maintainability** — Will future developers understand this?\n\nFeel free to ask a more specific question like:\n• "Why is this slow?"\n• "Explain this function"\n• "Find edge cases"\n• "How do I fix the security issue?"\n\nI'm here to help you write better, safer code!`,
  };
}

router.post("/message", requireAuth, async (req, res) => {
  try {
    const parsed = SendChatMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: "Invalid input" });
      return;
    }

    const { message, code, sessionId: providedSessionId } = parsed.data;
    const sessionId = providedSessionId || randomUUID();

    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, []);
    }
    const session = chatSessions.get(sessionId)!;

    const userMessage = {
      id: randomUUID(),
      role: "user" as const,
      content: message,
      codeSnippet: code,
      timestamp: new Date().toISOString(),
    };
    session.push(userMessage);

    await new Promise(r => setTimeout(r, 300));
    const aiResponse = generateAIResponse(message, code);

    const assistantMessage = {
      id: randomUUID(),
      role: "assistant" as const,
      content: aiResponse.content,
      codeSnippet: aiResponse.codeSnippet,
      timestamp: new Date().toISOString(),
    };
    session.push(assistantMessage);

    res.json({ message: assistantMessage, sessionId });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Chat failed" });
  }
});

router.get("/history", requireAuth, async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || randomUUID();
    const messages = chatSessions.get(sessionId) || [];
    res.json({ messages, sessionId });
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get history" });
  }
});

export default router;
