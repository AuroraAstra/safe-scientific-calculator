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

const expressionDisplay = document.querySelector("#expression");
const resultOutput = document.querySelector("#result");
const statusText = document.querySelector("#status");
const historyList = document.querySelector("#historyList");
const historyPanel = document.querySelector("#historyPanel");
const historyToggle = document.querySelector("#historyToggle");
const clearHistoryButton = document.querySelector("#clearHistory");
const keypad = document.querySelector(".keypad");
let ansValue = 0;
let expressionValue = "";
let history = [];
let activePointerId = null;

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

function renderExpression() {
  expressionDisplay.textContent = expressionValue;
}

function insertText(text) {
  expressionValue = `${expressionValue}${text}`;
  renderExpression();
}

function deleteSmart() {
  if (!expressionValue) return;

  const functionMatch = expressionValue.match(/([a-zA-Z][a-zA-Z0-9]*)\($/);
  if (functionMatch && Object.hasOwn(FUNCTIONS, functionMatch[1].toLowerCase())) {
    expressionValue = expressionValue.slice(0, -functionMatch[0].length);
    renderExpression();
    return;
  }

  expressionValue = expressionValue.slice(0, -1);
  renderExpression();
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function vibrateLightly() {
  globalThis.navigator?.vibrate?.(8);
}

function evaluateCurrentExpression() {
  try {
    const value = evaluateExpression(expressionValue, ansValue);
    ansValue = value;
    resultOutput.textContent = formatResult(value);
    setStatus("已计算");
    history.unshift({ expression: expressionValue, result: formatResult(value) });
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
      expressionValue = entry.expression;
      renderExpression();
      resultOutput.textContent = entry.result;
    });
    historyList.append(item);
  });
}

function handleKey(button) {
  vibrateLightly();
  if (button.dataset.insert) insertText(button.dataset.insert);
  if (button.dataset.action === "clear") {
    expressionValue = "";
    renderExpression();
    resultOutput.textContent = "0";
    setStatus("已清空");
  }
  if (button.dataset.action === "delete") {
    deleteSmart();
  }
  if (button.dataset.action === "evaluate") evaluateCurrentExpression();
}

keypad.addEventListener("pointerdown", (event) => {
  if (activePointerId !== null) {
    event.preventDefault();
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;
  activePointerId = event.pointerId;
  event.preventDefault();
  button.setPointerCapture?.(event.pointerId);
  handleKey(button);
});

keypad.addEventListener("pointerup", (event) => {
  if (event.pointerId === activePointerId) activePointerId = null;
});

keypad.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointerId) activePointerId = null;
});

keypad.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("gesturestart", (event) => event.preventDefault());
document.addEventListener("dblclick", (event) => event.preventDefault());
document.addEventListener("contextmenu", (event) => event.preventDefault());

historyToggle.addEventListener("click", () => {
  historyPanel.classList.toggle("open");
});

clearHistoryButton.addEventListener("click", () => {
  history = [];
  renderHistory();
});

window.safeCalculator = { evaluateExpression };
renderExpression();
renderHistory();
