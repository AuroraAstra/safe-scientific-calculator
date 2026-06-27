"use strict";

const LIMITS = {
  maxExpressionLength: 500,
  maxTokens: 220,
  maxAbsValue: 1e100,
  maxPowerExponent: 1000,
  maxFactorial: 5000,
};

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS = {
  sqrt: (value) => {
    if (value < 0) throw new Error("sqrt() 不接受负数");
    return Math.sqrt(value);
  },
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: (value) => {
    if (value <= 0) throw new Error("log() 参数必须大于 0");
    return Math.log(value);
  },
  log10: (value) => {
    if (value <= 0) throw new Error("log10() 参数必须大于 0");
    return Math.log10(value);
  },
  exp: Math.exp,
  abs: Math.abs,
  round: Math.round,
  fact: safeFactorial,
};

const expressionInput = document.querySelector("#expression");
const resultOutput = document.querySelector("#result");
const statusText = document.querySelector("#status");
const historyList = document.querySelector("#historyList");
const historyPanel = document.querySelector("#historyPanel");
const historyToggle = document.querySelector("#historyToggle");
const clearHistoryButton = document.querySelector("#clearHistory");
let ansValue = 0;
let history = [];

class Parser {
  constructor(tokens, ans) {
    this.tokens = tokens;
    this.position = 0;
    this.ans = ans;
  }

  parse() {
    const value = this.parseExpression();
    if (!this.isAtEnd()) {
      throw new Error(`无法识别的内容: ${this.peek().value}`);
    }
    return checkedNumber(value);
  }

  parseExpression() {
    let value = this.parseTerm();
    while (this.match("+") || this.match("-")) {
      const operator = this.previous().value;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
      value = checkedNumber(value);
    }
    return value;
  }

  parseTerm() {
    let value = this.parsePower();
    while (this.match("*") || this.match("/") || this.match("%")) {
      const operator = this.previous().value;
      const right = this.parsePower();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("不能除以 0");
      }
      if (operator === "*") value *= right;
      if (operator === "/") value /= right;
      if (operator === "%") value %= right;
      value = checkedNumber(value);
    }
    return value;
  }

  parsePower() {
    const base = this.parseUnary();
    if (this.match("^")) {
      const exponent = this.parsePower();
      if (!Number.isFinite(exponent) || Math.abs(exponent) > LIMITS.maxPowerExponent) {
        throw new Error(`指数过大，最大允许 ${LIMITS.maxPowerExponent}`);
      }
      return checkedNumber(Math.pow(base, exponent));
    }
    return base;
  }

  parseUnary() {
    if (this.match("+")) return checkedNumber(+this.parseUnary());
    if (this.match("-")) return checkedNumber(-this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.matchType("number")) return this.previous().value;

    if (this.matchType("identifier")) {
      const name = this.previous().value;
      if (name === "ans") return this.ans;
      if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name];
      if (!Object.hasOwn(FUNCTIONS, name)) throw new Error(`未知的函数或常量: ${name}`);
      this.consume("(", `${name} 后面需要括号`);
      const args = [];
      if (!this.check(")")) {
        args.push(this.parseExpression());
        while (this.match(",")) args.push(this.parseExpression());
      }
      this.consume(")", `${name} 缺少右括号`);
      if (args.length !== 1) throw new Error(`${name}() 只接受 1 个参数`);
      return checkedNumber(FUNCTIONS[name](args[0]));
    }

    if (this.match("(")) {
      const value = this.parseExpression();
      this.consume(")", "缺少右括号");
      return checkedNumber(value);
    }

    const token = this.peek();
    throw new Error(token ? `无法识别的内容: ${token.value}` : "表达式不完整");
  }

  match(value) {
    if (this.check(value)) {
      this.position += 1;
      return true;
    }
    return false;
  }

  matchType(type) {
    if (!this.isAtEnd() && this.peek().type === type) {
      this.position += 1;
      return true;
    }
    return false;
  }

  consume(value, message) {
    if (this.match(value)) return;
    throw new Error(message);
  }

  check(value) {
    return !this.isAtEnd() && this.peek().value === value;
  }

  peek() {
    return this.tokens[this.position];
  }

  previous() {
    return this.tokens[this.position - 1];
  }

  isAtEnd() {
    return this.position >= this.tokens.length;
  }
}

function evaluateExpression(expression, ans = 0) {
  const normalized = normalizeExpression(expression);
  const tokens = insertImplicitMultiplication(tokenize(normalized));
  if (tokens.length > LIMITS.maxTokens) {
    throw new Error(`表达式结构过大，最大允许 ${LIMITS.maxTokens} 个 token`);
  }
  return new Parser(tokens, ans).parse();
}

function normalizeExpression(expression) {
  const normalized = expression
    .trim()
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replace(/\bPI\b/g, "pi");

  if (!normalized) throw new Error("请输入表达式");
  if (normalized.length > LIMITS.maxExpressionLength) {
    throw new Error(`表达式过长，最大允许 ${LIMITS.maxExpressionLength} 个字符`);
  }
  return normalized;
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const numberMatch = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = expression.slice(index).match(/^[a-zA-Z_]\w*/);
    if (identifierMatch) {
      tokens.push({ type: "identifier", value: identifierMatch[0].toLowerCase() });
      index += identifierMatch[0].length;
      continue;
    }

    if ("+-*/%^(),".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    throw new Error(`不支持的字符: ${char}`);
  }

  return tokens;
}

function insertImplicitMultiplication(tokens) {
  const result = [];
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    if (previous && needsMultiplication(previous, token)) {
      result.push({ type: "operator", value: "*" });
    }
    result.push(token);
  });
  return result;
}

function needsMultiplication(left, right) {
  const leftCanEnd = left.type === "number" || left.value === ")" || left.value === "ans" || Object.hasOwn(CONSTANTS, left.value);
  const rightCanStart = right.type === "number" || right.value === "(" || right.value === "ans" || Object.hasOwn(CONSTANTS, right.value);
  return leftCanEnd && rightCanStart;
}

function safeFactorial(value) {
  if (!Number.isInteger(value)) throw new Error("fact() 只接受非负整数");
  if (value < 0) throw new Error("fact() 不接受负数");
  if (value > LIMITS.maxFactorial) {
    throw new Error(`fact() 参数过大，最大允许 ${LIMITS.maxFactorial}`);
  }
  let result = 1;
  for (let number = 2; number <= value; number += 1) {
    result = checkedNumber(result * number);
  }
  return result;
}

function checkedNumber(value) {
  if (!Number.isFinite(value)) throw new Error("计算结果超出范围");
  if (Math.abs(value) > LIMITS.maxAbsValue) throw new Error("计算结果过大");
  return value;
}

function formatResult(value) {
  if (Number.isInteger(value)) return String(value);
  const absValue = Math.abs(value);
  if (absValue !== 0 && (absValue >= 1e12 || absValue < 1e-8)) {
    return value.toExponential(12).replace(/\.?0+e/, "e");
  }
  return Number(value.toPrecision(14)).toString();
}

function insertText(text) {
  const start = expressionInput.selectionStart ?? expressionInput.value.length;
  const end = expressionInput.selectionEnd ?? expressionInput.value.length;
  expressionInput.value = `${expressionInput.value.slice(0, start)}${text}${expressionInput.value.slice(end)}`;
  const cursor = start + text.length;
  expressionInput.setSelectionRange(cursor, cursor);
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function evaluateCurrentExpression() {
  try {
    const expression = expressionInput.value;
    const value = evaluateExpression(expression, ansValue);
    ansValue = value;
    resultOutput.textContent = formatResult(value);
    setStatus("已计算");
    history.unshift({ expression, result: formatResult(value) });
    history = history.slice(0, 30);
    renderHistory();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderHistory() {
  historyList.replaceChildren();
  if (history.length === 0) {
    const item = document.createElement("li");
    item.textContent = "暂无历史记录";
    item.className = "history-expression";
    historyList.append(item);
    return;
  }
  history.forEach((entry) => {
    const item = document.createElement("li");
    const expression = document.createElement("div");
    const result = document.createElement("div");
    expression.className = "history-expression";
    result.className = "history-result";
    expression.textContent = entry.expression;
    result.textContent = entry.result;
    item.append(expression, result);
    item.addEventListener("click", () => {
      expressionInput.value = entry.expression;
      resultOutput.textContent = entry.result;
    });
    historyList.append(item);
  });
}

document.querySelector(".keypad").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.insert) insertText(button.dataset.insert);
  if (button.dataset.action === "clear") {
    expressionInput.value = "";
    resultOutput.textContent = "0";
    setStatus("已清空");
  }
  if (button.dataset.action === "delete") {
    const start = expressionInput.selectionStart ?? expressionInput.value.length;
    const end = expressionInput.selectionEnd ?? expressionInput.value.length;
    if (start !== end) {
      expressionInput.value = `${expressionInput.value.slice(0, start)}${expressionInput.value.slice(end)}`;
      expressionInput.setSelectionRange(start, start);
    } else if (start > 0) {
      expressionInput.value = `${expressionInput.value.slice(0, start - 1)}${expressionInput.value.slice(start)}`;
      expressionInput.setSelectionRange(start - 1, start - 1);
    }
  }
  if (button.dataset.action === "evaluate") evaluateCurrentExpression();
});

expressionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") evaluateCurrentExpression();
});

historyToggle.addEventListener("click", () => {
  historyPanel.classList.toggle("open");
});

clearHistoryButton.addEventListener("click", () => {
  history = [];
  renderHistory();
});

window.safeCalculator = { evaluateExpression };
renderHistory();
