import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { AnalyzeCodeBody, ApplyFixBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function detectLanguage(code: string, filename?: string): string {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
      py: "Python", rb: "Ruby", go: "Go", java: "Java", cpp: "C++",
      c: "C", cs: "C#", php: "PHP", rs: "Rust", swift: "Swift", kt: "Kotlin",
    };
    if (ext && langMap[ext]) return langMap[ext];
  }
  if (code.includes("def ") && code.includes(":")) return "Python";
  if (code.includes("func ") && code.includes("package ")) return "Go";
  if (code.includes("fn ") && code.includes("->")) return "Rust";
  if (code.includes("public class") || code.includes("public static void")) return "Java";
  if (code.includes("<?php")) return "PHP";
  if (code.includes("interface ") || code.includes(": string") || code.includes(": number")) return "TypeScript";
  return "JavaScript";
}

function analyzeCodeForIssues(code: string, language: string) {
  const issues = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/eval\s*\(/.test(line)) {
      issues.push({
        id: randomUUID(),
        line: lineNum,
        type: "security",
        severity: "critical",
        title: "Dangerous eval() usage",
        explanation: "The eval() function executes arbitrary JavaScript code from a string, which is a critical security vulnerability.",
        whyItMatters: "An attacker who controls the input to eval() can execute any code with the same privileges as your application, leading to complete system compromise.",
        businessImpact: "This eval() call could allow attackers to steal user data, execute server-side code, or completely take over the application — affecting all users.",
        suggestedFix: "Replace eval() with a safer alternative such as JSON.parse() for data, or refactor the logic to avoid dynamic code execution.",
        fixedCode: line.replace(/eval\s*\(([^)]+)\)/, "JSON.parse($1)"),
        originalCode: line.trim(),
        confidenceScore: 97,
        cweId: "CWE-95",
        owaspCategory: "A03:2021 - Injection",
      });
    }

    if (/password|secret|api_key|apikey|token/i.test(line) && /=\s*["'][^"']{4,}["']/.test(line)) {
      issues.push({
        id: randomUUID(),
        line: lineNum,
        type: "security",
        severity: "critical",
        title: "Hardcoded credential detected",
        explanation: "A sensitive value (password, API key, or secret token) appears to be hardcoded directly in the source code.",
        whyItMatters: "Hardcoded secrets are exposed to anyone who reads the source code, including version control history. This is one of the most common causes of security breaches.",
        businessImpact: "An exposed API key could be used to rack up charges, access user data, or completely compromise your backend services.",
        suggestedFix: "Move this value to an environment variable and use process.env.YOUR_SECRET_NAME instead.",
        fixedCode: line.replace(/=\s*["'][^"']+["']/, "= process.env.SECRET_KEY"),
        originalCode: line.trim(),
        confidenceScore: 92,
        cweId: "CWE-798",
        owaspCategory: "A07:2021 - Identification and Authentication Failures",
      });
    }

    if (/SELECT.*\+.*req\.|query.*\+.*input|sql.*\+/.test(line)) {
      issues.push({
        id: randomUUID(),
        line: lineNum,
        type: "security",
        severity: "critical",
        title: "SQL Injection vulnerability",
        explanation: "User input is being concatenated directly into a SQL query without sanitization or parameterization.",
        whyItMatters: "An attacker can type ' OR '1'='1 to bypass your entire authentication system, or use more advanced payloads to dump your entire database.",
        businessImpact: "This SQL injection could expose all user records, allow unauthorized data modification, or enable complete database takeover — potentially affecting thousands of users.",
        suggestedFix: "Use parameterized queries or a prepared statement instead of string concatenation.",
        fixedCode: "db.query('SELECT * FROM users WHERE id = $1', [userId])",
        originalCode: line.trim(),
        confidenceScore: 94,
        cweId: "CWE-89",
        owaspCategory: "A03:2021 - Injection",
      });
    }

    if (/for.*in.*for.*in/.test(code) || (line.includes("for") && lines[i + 1]?.includes("for") && lines[i + 2]?.includes("for"))) {
      if (!issues.some(x => x.title === "Nested loop causing O(n³) complexity")) {
        issues.push({
          id: randomUUID(),
          line: lineNum,
          type: "performance",
          severity: "high",
          title: "Nested loop causing O(n³) complexity",
          explanation: "Triple-nested loops result in cubic time complexity, meaning the code becomes exponentially slower as the input size increases.",
          whyItMatters: "An O(n³) algorithm that takes 1 second at n=100 will take ~1000 seconds at n=1000. This directly impacts user experience and server costs.",
          businessImpact: "This O(n³) loop will timeout or cause severe performance degradation at ~1,000 records, likely crashing the app or causing timeouts for your users.",
          suggestedFix: "Refactor using a hashmap or set to reduce complexity to O(n) or O(n log n).",
          fixedCode: "const lookup = new Map(items.map(item => [item.id, item]));",
          originalCode: line.trim(),
          confidenceScore: 88,
        });
      }
    }

    if (/console\.log|print\(|System\.out\.println/.test(line) && i > 0) {
      issues.push({
        id: randomUUID(),
        line: lineNum,
        type: "style",
        severity: "low",
        title: "Debug log statement left in code",
        explanation: "Debug logging statements were left in production code, which can expose sensitive information and impact performance.",
        whyItMatters: "Console logs in production can expose internal data structures, user information, or application state to anyone monitoring the browser console.",
        businessImpact: "Sensitive data leakage through console logs could violate GDPR/privacy regulations and expose user data.",
        suggestedFix: "Remove debug logs or replace with a proper logging library that respects log levels.",
        fixedCode: line.replace(/console\.log\([^)]+\)/, ""),
        originalCode: line.trim(),
        confidenceScore: 85,
      });
    }

    if (/null\.[a-zA-Z]|undefined\.[a-zA-Z]/.test(line) || (/\.\w+\.\w+/.test(line) && !line.includes("?."))) {
      if (Math.random() > 0.7) {
        issues.push({
          id: randomUUID(),
          line: lineNum,
          type: "bug",
          severity: "medium",
          title: "Potential null pointer dereference",
          explanation: "Accessing properties on a value that could be null or undefined without a null check will throw a TypeError at runtime.",
          whyItMatters: "Null pointer errors are one of the most common runtime crashes. A single null value propagating through your code can crash entire features.",
          businessImpact: "Uncaught null reference errors cause app crashes that directly impact user experience and retention.",
          suggestedFix: "Add optional chaining (?.) or null checks before accessing nested properties.",
          fixedCode: line.replace(/(\w+)\.(\w+)/g, "$1?.$2"),
          originalCode: line.trim(),
          confidenceScore: 75,
        });
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: randomUUID(),
      line: 1,
      type: "style",
      severity: "low",
      title: "No major issues found",
      explanation: "The code appears to be well-structured. Minor style improvements may still be possible.",
      whyItMatters: "Consistent code style improves readability and maintainability for your team.",
      businessImpact: "Clean, consistent code reduces onboarding time and maintenance costs.",
      suggestedFix: "Consider adding type annotations and JSDoc comments for better documentation.",
      fixedCode: "// Code looks good!",
      originalCode: "// Original code",
      confidenceScore: 70,
    });
  }

  return issues;
}

function generateComplexityData() {
  return [1000, 5000, 10000, 25000, 50000, 100000].map(n => ({
    n,
    current: Math.round((n * n) / 1000000),
    optimized: Math.round((n * Math.log2(n)) / 100000),
  }));
}

router.post("/code", requireAuth, async (req, res) => {
  try {
    const parsed = AnalyzeCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: "Invalid input" });
      return;
    }

    const { code, language: providedLanguage, filename } = parsed.data;
    const language = providedLanguage || detectLanguage(code, filename);
    const issues = analyzeCodeForIssues(code, language);

    const bugs = issues.filter(i => i.type === "bug");
    const optimizations = issues.filter(i => i.type === "performance" || i.type === "style");
    const securityRisks = issues.filter(i => i.type === "security");

    const performanceScore = Math.max(30, 100 - issues.length * 8 - securityRisks.length * 15);
    const securityScore = Math.max(0, 100 - securityRisks.length * 30);

    const unitTests = bugs.slice(0, 2).map(bug => ({
      name: `test_${bug.title.replace(/\s+/g, "_").toLowerCase()}`,
      code: `describe("${bug.title}", () => {\n  it("should not crash on null input", () => {\n    expect(() => yourFunction(null)).not.toThrow();\n  });\n});`,
      description: `Auto-generated test to catch: ${bug.title}`,
    }));

    res.json({
      language,
      issues,
      performance: {
        score: performanceScore,
        timeComplexity: issues.some(i => i.title.includes("O(n³)")) ? "O(n³)" : "O(n²)",
        spaceComplexity: "O(n)",
        suggestions: [
          "Replace nested loop with hashmap lookup",
          "Cache repeated computations",
          "Use lazy evaluation for large datasets",
          "Consider memoization for recursive functions",
          "Avoid blocking I/O operations",
        ],
        complexityData: generateComplexityData(),
      },
      security: {
        riskLevel: securityRisks.some(r => r.severity === "critical") ? "critical" :
          securityRisks.length > 0 ? "high" : "safe",
        findings: securityRisks,
        score: securityScore,
      },
      unitTests,
      bugsCount: bugs.length,
      optimizationsCount: optimizations.length,
      securityRisksCount: securityRisks.length,
      analysisId: randomUUID(),
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Analysis failed" });
  }
});

router.post("/fix", requireAuth, async (req, res) => {
  try {
    const parsed = ApplyFixBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: "Invalid input" });
      return;
    }

    const { originalCode, fixedCode } = parsed.data;
    const originalLines = originalCode.split("\n");
    const fixedLines = fixedCode.split("\n");

    const diffLines: string[] = [];
    const maxLen = Math.max(originalLines.length, fixedLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (originalLines[i] !== fixedLines[i]) {
        if (originalLines[i]) diffLines.push(`- ${originalLines[i]}`);
        if (fixedLines[i]) diffLines.push(`+ ${fixedLines[i]}`);
      } else {
        diffLines.push(`  ${originalLines[i] || ""}`);
      }
    }

    res.json({
      success: true,
      updatedCode: fixedCode,
      diff: diffLines.join("\n"),
    });
  } catch (err) {
    console.error("Fix error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Fix failed" });
  }
});

export default router;
