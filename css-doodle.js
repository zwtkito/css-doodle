/*! css-doodle@0.38.0 */
(function () {
  'use strict';

  /**
   * This is totally rewrite for the old parser module
   * I'll improve and replace them little by little.
   */

  const symbols$1 = [
    ':', ';', ',', '(', ')', '[', ']',
    '{', '}', 'π', '±', '+', '-', '*',
    '/', '%', '"', "'", '`', '@', '=',
    '^',
  ];

  const is$1 = {
    escape: c => c == '\\',
    space:  c => /[\r\n\t\s]/.test(c),
    digit:  c => /^[0-9]$/.test(c),
    sign:   c => /^[+-]$/.test(c),
    dot:    c => c == '.',
    quote:  c => /^["'`]$/.test(c),
    symbol: c => symbols$1.includes(c),
    hexNum: c => /^[0-9a-f]$/i.test(c),
    hex:           (a, b, c) => a == '0' && is$1.letter(b, 'x') && is$1.hexNum(c),
    expWithSign:   (a, b, c) => is$1.letter(a, 'e') && is$1.sign(b) && is$1.digit(c),
    exp:           (a, b) => is$1.letter(a, 'e') && is$1.digit(b),
    dots:          (a, b) => is$1.dot(a) && is$1.dot(b),
    letter:        (a, b) => String(a).toLowerCase() == String(b).toLowerCase(),
    comment:       (a, b) => a == '/' && b == '*',
    inlineComment: (a, b) => a == '/' && b === '/',
    selfClosedTag: (a, b) => a == '/' && b == '>',
    closedTag:     (a, b) => a == '<' && b == '/',
  };

  class Token {
    constructor({ type, value, pos, status }) {
      this.type = type;
      this.value = value;
      this.pos = pos;
      if (status) {
        this.status = status;
      }
    }
    isSymbol(...values) {
      let isSymbol = this.type == 'Symbol';
      if (!values.length) return isSymbol;
      return values.some(c => c === this.value);
    }
    isSpace() {
      return this.type == 'Space';
    }
    isNumber() {
      return this.type == 'Number';
    }
    isWord() {
      return this.type == 'Word';
    }
  }

  function iterator$1(input) {
    let pointer = -1;
    let max = input.length;
    let col = -1, row = 0;
    return {
      curr(n = 0) {
        return input[pointer + n];
      },
      next(n = 1) {
        let next = input[pointer += n];
        if (next === '\n') row++, col = 0;
        else col += n;
        return next;
      },
      end() {
        return pointer >= max;
      },
      get() {
        return {
          prev:  input[pointer - 1],
          curr:  input[pointer + 0],
          next:  input[pointer + 1],
          next2: input[pointer + 2],
          next3: input[pointer + 3],
          pos:   [col, row],
        }
      }
    }
  }

  function skipComments(iter) {
    while (iter.next()) {
      let { curr, prev } = iter.get();
      if (is$1.comment(curr, prev)) break;
    }
  }

  function skipInlineComments(iter) {
    while (iter.next()) {
      if (iter.curr() === '\n') break;
    }
  }

  function ignoreSpacingSymbol(value) {
     return [':', ';', ',', '{', '}', '(', ')', '[', ']'].includes(value);
  }

  function readWord(iter) {
    let temp = '';
    while (!iter.end()) {
      let { curr, next } = iter.get();
      temp += curr;
      let isBreak = is$1.symbol(next) || is$1.space(next) || is$1.digit(next);
      if (temp.length && isBreak) {
        if (!is$1.closedTag(curr, next)) break;
      }
      iter.next();
    }
    return temp.trim();
  }

  function readSpaces(iter) {
    let temp = '';
    while (!iter.end()) {
      let { curr, next } = iter.get();
      temp += curr;
      if (!is$1.space(next)) break;
      iter.next();
    }
    return temp;
  }

  function readNumber(iter) {
    let temp = '';
    let hasDot = false;
    while (!iter.end()) {
      let { curr, next, next2, next3 } = iter.get();
      temp += curr;
      if (hasDot && is$1.dot(next)) break;
      if (is$1.dot(curr)) hasDot = true;
      if (is$1.dots(next, next2)) break;
      if (is$1.expWithSign(next, next2, next3)) {
        temp += iter.next() + iter.next();
      }
      else if (is$1.exp(next, next2)) {
        temp += iter.next();
      }
      else if (!is$1.digit(next) && !is$1.dot(next)) {
        break;
      }
      iter.next();
    }
    return temp;
  }

  function readHexNumber(iter) {
    let temp = '0x';
    iter.next(2);
    while (!iter.end()) {
      let { curr, next } = iter.get();
      temp += curr;
      if (!is$1.hexNum(next)) break;
      iter.next();
    }
    return temp;
  }

  function last$1(array) {
    return array[array.length - 1];
  }

  function scan(source, options = {}) {
    let iter = iterator$1(String(source).trim());
    let tokens = [];
    let quoteStack = [];

    while (iter.next()) {
      let { prev, curr, next, next2, pos } = iter.get();
      if (is$1.comment(curr, next)) {
        skipComments(iter);
      }
      else if (options.ignoreInlineComment && is$1.inlineComment(curr, next)) {
        skipInlineComments(iter);
      }
      else if (is$1.hex(curr, next, next2)) {
        let num = readHexNumber(iter);
        tokens.push(new Token({
          type: 'Number', value: num, pos
        }));
      }
      else if (is$1.digit(curr) || (
          is$1.digit(next) && is$1.dot(curr) && !is$1.dots(prev, curr))) {
        let num = readNumber(iter);
        tokens.push(new Token({
          type: 'Number', value: num, pos
        }));
      }
      else if (is$1.symbol(curr) && !is$1.selfClosedTag(curr, next)) {
        let lastToken = last$1(tokens);
        // negative
        let isNextDigit = is$1.digit(next) || (is$1.dot(next) && is$1.digit(next2));
        if (curr === '-' && isNextDigit && (!lastToken || !lastToken.isNumber())) {
          let num = readNumber(iter);
          tokens.push(new Token({
            type: 'Number', value: num, pos
          }));
          continue;
        }

        let token = {
          type: 'Symbol', value: curr, pos
        };
        // Escaped symbols
        if (quoteStack.length && is$1.escape(lastToken.value)) {
          tokens.pop();
          let word = readWord(iter);
          if (word.length) {
            tokens.push(new Token({
              type: 'Word', value: word, pos
            }));
          }
        }
        else {
          if (is$1.quote(curr)) {
            let lastQuote = last$1(quoteStack);
            if (lastQuote == curr) {
              quoteStack.pop();
              token.status = 'close';
            } else {
              quoteStack.push(curr);
              token.status = 'open';
            }
          }

          tokens.push(new Token(token));
        }
      }
      else if (is$1.space(curr)) {
        let spaces = readSpaces(iter);
        let lastToken = last$1(tokens);
        let { next } = iter.get();
        // Reduce unnecessary spaces
        if (!quoteStack.length && lastToken) {
          let prev = lastToken.value;
          let ignoreLeft = (ignoreSpacingSymbol(prev) && prev !== ')');
          let ignoreRight = (ignoreSpacingSymbol(next) && next !== '(');
          if (ignoreLeft || ignoreRight)  {
            continue;
          } else {
            spaces = options.preserveLineBreak ? curr : ' ';
          }
        }
        if (tokens.length && (next && next.trim())) {
          tokens.push(new Token({
            type: 'Space', value: spaces, pos
          }));
        }
      }
      else {
        let word = readWord(iter);
        if (word.length) {
          tokens.push(new Token({
            type: 'Word', value: word, pos
          }));
        }
      }
    }

    // Remove last space token
    let lastToken = last$1(tokens);
    if (lastToken && lastToken.isSpace()) {
      tokens.length = tokens.length - 1;
    }
    return tokens;
  }

  function parse$a(input) {
    let iter = iterator$1(scan(input));
    return walk$2(iter);
  }

  function walk$2(iter) {
    let rules = [];
    while (iter.next()) {
      let { curr, next } = iter.get();
      if (curr.value === 'var') {
        if (next && next.isSymbol('(')) {
          iter.next();
          let rule = parseVar(iter);
          if (isValid(rule.name)) {
            rules.push(rule);
          }
        }
      } else if (rules.length && !curr.isSymbol(',')) {
        break;
      }
    }
    return rules;
  }

  function parseVar(iter) {
    let ret = {};
    let tokens = [];
    while (iter.next()) {
      let { curr, next } = iter.get();
      if (curr.isSymbol(')', ';') && !ret.name) {
        ret.name = joinTokens$2(tokens);
        break;
      }
      else if (curr.isSymbol(',')) {
        if (ret.name === undefined) {
          ret.name = joinTokens$2(tokens);
          tokens = [];
        }
        if (ret.name) {
          ret.fallback = walk$2(iter);
        }
      } else {
        tokens.push(curr);
      }
    }
    return ret;
  }

  function joinTokens$2(tokens) {
    return tokens.map(n => n.value).join('');
  }

  function isValid(name) {
    if (name === undefined) return false;
    if (name.length <= 2) return false;
    if (name.substr(2).startsWith('-')) return false;
    if (!name.startsWith('--')) return false;
    return true;
  }

  function clamp(num, min, max) {
    num = Number(num) || 0;
    return Math.max(min, Math.min(max, num));
  }

  function add_alias(obj, names) {
    for (let [alias, name] of Object.entries(names)) {
      obj[alias] = obj[name];
    }
    return obj;
  }

  function is_letter(c) {
    return /^[a-zA-Z]$/.test(c);
  }

  function is_nil(s) {
    return s === undefined || s === null;
  }

  function is_invalid_number(v) {
    return is_nil(v) || Number.isNaN(v);
  }

  function is_empty(value) {
    return is_nil(value) || value === '';
  }

  function lazy(fn) {
    let wrap = (upstream) => {
      return (...args) => fn(...[upstream, ...args]);
    };
    wrap.lazy = true;
    return wrap;
  }

  function sequence(count, fn) {
    let [x, y = 1] = String(count).split(/[x-]/);
    let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
    if (is_invalid_number(cx)) cx = 1;
    if (is_invalid_number(cy)) cy = 1;
    x = clamp(cx, 0, 65536);
    y = clamp(cy, 0, 65536);
    let max = x * y;
    let ret = [];
    let index = 1;
    if (/x/.test(count)) {
      for (let i = 1; i <= y; ++i) {
        for (let j = 1; j <= x; ++j) {
          ret.push(fn(index, j, i, max, x, y, index));
          index++;
        }
      }
    } else if (/-/.test(count)) {
      max = Math.abs(x - y) + 1;
      if (x <= y) {
        for (let i = x; i <= y; ++i) {
          ret.push(fn(i, i, 1, max, max, 1, index++));
        }
      } else {
        for (let i = x; i >= y; --i) {
          ret.push(fn(i, i, 1, max, max, 1, index++));
        }
      }
    } else {
      for (let i = 1; i <= x; ++i) {
        ret.push(fn(i, i, 1, x, x, 1, index++));
      }
    }
    return ret;
  }

  function cell_id(x, y, z) {
    return 'c-' + x + '-' + y + '-' + z;
  }

  function get_value(input) {
    let v = input;
    while (v && !is_nil(v.value)) v = v.value;
    return is_nil(v) ? '' : v;
  }

  function get_png_name(name) {
    let prefix = is_nil(name)
      ? Date.now()
      : String(name).replace(/\/.png$/g, '');
    return prefix + '.png';
  }

  function cache_image(src, fn, delay = 0) {
    let img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = function() {
      setTimeout(fn, delay);
    };
  }

  function is_safari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  }

  function un_entity(code) {
    let textarea = document.createElement('textarea');
    textarea.innerHTML = code;
    return textarea.value;
  }

  function entity(code) {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /* cyrb53 */
  function hash(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
  }

  function next_id() {
    let id = 0;
    return (prefix = '') => `${prefix}-${++id}`;
  }

  function lerp(t, a, b) {
    return a + t * (b - a);
  }

  function unique_id(prefix = '') {
    return prefix + Math.random().toString(32).substr(2);
  }

  function make_array(arr) {
    if (is_nil(arr)) return [];
    return Array.isArray(arr) ? arr : [arr];
  }

  function join(arr, spliter = '\n') {
    return (arr || []).join(spliter);
  }

  function last(arr, n = 1) {
    if (is_nil(arr)) return '';
    return arr[arr.length - n];
  }

  function first(arr) {
    return arr[0];
  }

  function remove_empty_values(arr) {
    return arr.filter(v => (
      !is_nil(v) && String(v).trim().length
    ));
  }

  function parse$9(input, option = {symbol: ',', noSpace: false, verbose: false }) {
    let group = [];
    let tokens = [];
    let parenStack = [];
    let quoteStack = [];
    let lastGroupName = '';

    if (is_empty(input)) {
      return group;
    }

    let iter = iterator$1(scan(input));

    function isSeperator(token) {
      let symbol = option.symbol || [','];
      if (!Array.isArray(symbol)) {
        symbol = [symbol];
      }
      if (option.noSpace) {
        return token.isSymbol(...symbol);
      }
      return token.isSymbol(...symbol) || token.isSpace();
    }

    function addGroup(tokens) {
      let value = joinTokens$1(tokens);
      if (option.verbose) {
        if (lastGroupName.length || value.length) {
          group.push({ group: lastGroupName, value });
        }
      } else {
        group.push(value);
      }
    }

    while (iter.next()) {
      let { prev, curr, next }  = iter.get();
      if (curr.isSymbol('(')) {
        parenStack.push(curr.value);
      }
      if (curr.isSymbol(')')) {
        parenStack.pop();
      }
      if (curr.status === 'open') {
        quoteStack.push(curr.value);
      }
      if (curr.status === 'close') {
        quoteStack.pop();
      }
      let emptyStack = (!parenStack.length && !quoteStack.length);
      if (emptyStack) {
        let isNextSpace = option.noSpace && curr.isSpace() && isSeperator(next);
        let isPrevSpace = option.noSpace && curr.isSpace() && isSeperator(prev);
        if (isNextSpace || isPrevSpace) continue;
      }
      if (emptyStack && isSeperator(curr)) {
        addGroup(tokens);
        lastGroupName = curr.value;
        tokens = [];
      } else {
        tokens.push(curr);
      }
    }

    if (tokens.length) {
      addGroup(tokens);
    }

    return group;
  }

  function joinTokens$1(tokens) {
    return tokens.map(n => n.value).join('');
  }

  function readStatement$1(iter, token) {
    let fragment = [];
    let inlineBlock;
    let stackQuote = [];
    let stackParen = [];
    let isInline = false;
    while (iter.next()) {
      let { curr, next } = iter.get();
      if (curr.isSymbol('(') && !stackQuote.length) {
        stackParen.push(curr);
      } else if (curr.isSymbol(')') && !stackQuote.length) {
        stackParen.pop();
      }
      if (curr.isSymbol("'", '"')) {
        if (curr.status === 'open') {
          stackQuote.push(curr);
        } else {
          stackQuote.pop();
        }
      }
      let isStatementBreak = !stackQuote.length
        && !stackParen.length
        && (!next || curr.isSymbol(';') || next.isSymbol('}'));

      if (curr.isSymbol("'", '"')) {
        if ((next && next.isSymbol('}')) && !stackQuote.length) {
          isStatementBreak = true;
        }
      }
      if (!stackParen.length && !stackQuote.length && curr.isSymbol('{')) {
        let selectors = getSelectors(fragment);
        if (!selectors.length) {
          continue;
        }
        let tokenName = selectors.pop();
        let skip = isSkip(...selectors, tokenName);
        inlineBlock = resolveId(walk$1(iter, splitTimes(tokenName, {
          type: 'block',
          name: tokenName,
          value: [],
        })), skip);

        while (tokenName = selectors.pop()) {
          inlineBlock = resolveId(splitTimes(tokenName, {
            type: 'block',
            name: tokenName,
            value: [inlineBlock]
          }), skip);
        }
        isInline = true;
        break;
      }
      fragment.push(curr);
      if (isStatementBreak) {
        break;
      }
    }
    if (fragment.length && !inlineBlock) {
      token._valueTokens = fragment;
      token.value = joinToken$2(fragment);
    } else if (inlineBlock) {
      token.value = inlineBlock;
    }
    if (isInline) {
      token.value.inline = true;
    }
    if (token.origin) {
      token.origin.value = token.value;
    }
    return token;
  }

  function readStyle(iter) {
    let stack = [];
    let style = [];
    while (iter.next()) {
      let { curr } = iter.get();
      if (curr.isSymbol('{')) {
        stack.push(curr.value);
      } else if (curr.isSymbol('}')) {
        if (stack.length) {
          stack.pop();
        } else {
          break;
        }
      }
      style.push(curr.value);
    }
    return style.join('');
  }

  function walk$1(iter, parentToken) {
    let rules = [];
    let fragment = [];
    let tokenType = parentToken && parentToken.type || '';
    let stack = [];

    while (iter.next()) {
      let { prev, curr, next } = iter.get();
      if (curr.isSymbol('(')) {
        stack.push(curr.value);
      }
      if (curr.isSymbol(')')) {
        stack.pop();
      }
      let isBlockBreak = !next || curr.isSymbol('}');
      if (isBlock(tokenType) && isBlockBreak) {
        if (!next && rules.length && !curr.isSymbol('}')) {
          let last = rules[rules.length - 1].value;
          if (typeof last === 'string') {
            rules[rules.length - 1].value += (';' + curr.value);
          }
        }
        parentToken.value = rules;
        break;
      }
      else if (curr.isSymbol('{')) {
        let selectors = getSelectors(fragment);
        if (!selectors.length) {
          continue;
        }
        if (isSkip(parentToken.name)) {
          selectors = [joinToken$2(fragment)];
        }
        let tokenName = selectors.pop();
        let skip = isSkip(...selectors, parentToken.name, tokenName);

        if (tokenName === 'style') {
          rules.push({
            type: 'block',
            name: tokenName,
            value: readStyle(iter)
          });
        } else {
          let block = resolveId(walk$1(iter, splitTimes(tokenName, {
            type: 'block',
            name: tokenName,
            value: []
          })), skip);

          while (tokenName = selectors.pop()) {
            block = resolveId(splitTimes(tokenName, {
              type: 'block',
              name: tokenName,
              value: [block]
            }), skip);
          }
          rules.push(block);
        }
        fragment = [];
      }
      else if (
        curr.isSymbol(':')
        && !stack.length
        && !isSpecialProperty(prev, next)
        && fragment.length
      ) {
        let props = getGroups(fragment, token => token.isSymbol(','));
        let intial = {
          type: 'statement',
          name: 'unkown',
          value: ''
        };
        if (props.length > 1) {
          intial.origin = {
            name: props
          };
        }
        let statement = readStatement$1(iter, intial);
        let groupdValue = parse$9(statement.value);
        let expand = (props.length > 1 && groupdValue.length === props.length);

        props.forEach((prop, i) => {
          let item = Object.assign({}, statement, { name: prop });
          if (/^\-\-/.test(prop)) {
            item.variable = true;
          }
          if (expand) {
            item.value = groupdValue[i];
          }
          if (/viewBox/i.test(prop)) {
            item.detail = parseViewBox(item.value, item._valueTokens);
          }
          delete item._valueTokens;
          rules.push(item);
        });
        if (isBlock(tokenType)) {
          parentToken.value = rules;
        }
        fragment = [];
      }
      else if (curr.isSymbol(';')) {
        if (rules.length && fragment.length) {
          rules[rules.length - 1].value += (';' + joinToken$2(fragment));
          fragment = [];
        }
      }
      else {
        fragment.push(curr);
      }
    }

    if (rules.length && isBlock(tokenType)) {
      parentToken.value = rules;
    }
    return tokenType ? parentToken : rules;
  }

  function isSpecialProperty(prev, next) {
    const names = [
      'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
      'xlink:show',    'xlink:title',   'xlink:type',
      'xml:base',      'xml:lang',      'xml:space',
    ];
    let prevValue = prev && prev.value;
    let nextValue = next && next.value;
    return names.includes(prevValue + ':' + nextValue);
  }

  function joinToken$2(tokens) {
    return tokens
      .filter((token, i) => {
        if (token.isSymbol(';', '}') && i === tokens.length - 1) return false;
        return true;
      })
      .map(n => n.value).join('');
  }

  function resolveId(block, skip) {
    let name = block.name || '';
    let [tokenName, ...ids] = name.split(/#/);
    let id = ids[ids.length - 1];
    if (tokenName && id && !skip) {
      block.name = tokenName;
      block.value.push({
        type: 'statement',
        name: 'id',
        value: id,
      });
    }
    return block;
  }

  function getGroups(tokens, fn) {
    let group = [];
    let temp = [];
    tokens.forEach(token => {
      if (fn(token)) {
        group.push(joinToken$2(temp));
        temp = [];
      } else {
        temp.push(token);
      }
    });
    if (temp.length) {
      group.push(joinToken$2(temp));
    }
    return group;
  }

  function getSelectors(tokens) {
    let result = [];
    let it = iterator$1(tokens);
    let hasSymbol;
    while (it.next()) {
      let { prev, curr, next } = it.get();
      let isTimeSymbol = (
        prev && next &&
        curr.value === 'x' &&
        prev.isNumber()  &&
        next.isNumber()
      );
      if (curr.isWord() && !hasSymbol && !isTimeSymbol) {
        result.push(curr.value.trim());
      } else {
        result[result.length - 1] =
          (result[result.length - 1] + curr.value).trim();
      }
      if (curr.isSymbol()) {
        hasSymbol = true;
      } else if (!curr.isSpace()) {
        hasSymbol = false;
      }
    }
    return result;
  }

  function parseViewBox(value, tokens) {
    const viewBox = { value: [] };
    let temp;
    if (!Array.isArray(tokens)) {
      return viewBox;
    }
    for (let token of tokens) {
      if (token.isSpace() || token.isSymbol(',', ';')) {
        continue;
      }
      if (viewBox.value.length < 4 && token.isNumber()) {
        viewBox.value.push(Number(token.value));
      }
      else if (token.isNumber() && temp) {
        viewBox[temp] = Number(token.value);
        temp = null;
      }
      else if (token.isWord()) {
        temp = token.value;
      }
    }
    return viewBox;
  }

  function splitTimes(name, object) {
    let target = Object.assign({}, object);
    if (/\*\s*[0-9]/.test(name)) {
      let [tokenName, times] = name.split('*');
      if (times) {
        target.times = times.trim();
        target.pureName = tokenName.trim();
      }
    }
    return target;
  }

  function isSkip(...names) {
    return names.some(n => n === 'style');
  }

  function isBlock(type) {
    return type === 'block';
  }

  function skipHeadSVG(block) {
    let headSVG, headVariables = [];
    for (let item of block.value) {
      if (item.name === 'svg') {
        headSVG = item;
      }
      if (item.variable) {
        headVariables.push(item);
      }
    }
    if (headSVG && Array.isArray(headSVG.value)) {
      for (let variable of headVariables) {
        if (!headSVG.value.find(n => n.name == variable.name)) {
          headSVG.value.unshift(variable);
        }
      }
      return headSVG;
    }
    return block;
  }

  function parse$8(source, root) {
    let iter = iterator$1(scan(source));
    let tokens = walk$1(iter, root || {
      type: 'block',
      name: 'svg',
      value: []
    });
    return skipHeadSVG(tokens);
  }

  function generate$1(token, last) {
    let result = '';
    if (token.type === 'block') {
      let isInline = Array.isArray(token.value) && token.value[0] && token.value[0].inline;
      if (token.times) {
        result += ('@M' + token.times + '(' + token.pureName + '{');
      } else {
        result += token.name + '{';
      }
      if (token.name === 'style') {
        result += token.value;
      }
      else if (Array.isArray(token.value) && token.value.length) {
        let lastGroup = '';
        for (let t of token.value) {
          result += generate$1(t, lastGroup);        if (t.origin) {
            lastGroup = t.origin.name.join(',');
          }
        }
      }
      if (token.times) {
        result += '})';
      } else if (!isInline) {
        result += '}';
      }
    } else if (token.type === 'statement') {
      let skip = (token.origin && last === token.origin.name.join(','));
      let name = token.origin ? token.origin.name.join(',') : token.name;
      let value = token.origin ? token.origin.value : token.value;
      if (!skip) {
        result += (value && value.type)
          ? (name + ':' + generate$1(value))
          : (name + ':' + value + ';');
      }
    }
    return result;
  }

  function generate_svg_extended(token) {
    return generate$1(token).trim();
  }

  // I need to rewrite this


  const Tokens = {
    func(name = '') {
      return {
        type: 'func',
        name,
        arguments: []
      };
    },
    argument() {
      return {
        type: 'argument',
        value: []
      };
    },
    text(value = '') {
      return {
        type: 'text',
        value
      };
    },
    pseudo(selector = '') {
      return {
        type: 'pseudo',
        selector,
        styles: []
      };
    },
    cond(name = '') {
      return {
        type: 'cond',
        name,
        styles: [],
        arguments: []
      };
    },
    rule(property = '') {
      return {
        type: 'rule',
        property,
        value: []
      };
    },
    keyframes(name = '') {
      return {
        type: 'keyframes',
        name,
        steps: []
      }
    },

    step(name = '') {
      return {
        type: 'step',
        name,
        styles: []
      }
    }
  };

  const is = {
    white_space(c) {
      return /[\s\n\t]/.test(c);
    },
    line_break(c) {
      return /\n/.test(c);
    },
    number(n) {
      return !isNaN(n);
    },
    pair(n) {
      return ['"', '(', ')', "'"].includes(n);
    },
    pair_of(c, n) {
      return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
    }
  };

  // This should not be in the parser
  // but I'll leave it here until the rewriting
  const symbols = {
    'π': Math.PI,
    '∏': Math.PI
  };

  function composible(name) {
    return /^@(canvas|shaders|doodle)/.test(name);
  }

  function iterator(input = '') {
    let index = 0, col = 1, line = 1;
    return {
      curr(n = 0) {
        return input[index + n];
      },
      end() {
        return input.length <= index;
      },
      info() {
        return { index, col, line };
      },
      index(n) {
        return (n === undefined ? index : index = n);
      },
      range(start, end) {
        return input.substring(start, end);
      },
      next() {
        let next = input[index++];
        if (next == '\n') line++, col = 0;
        else col++;
        return next;
      }
    };
  }

  function throw_error(msg, { col, line }) {
    console.warn(
      `(at line ${ line }, column ${ col }) ${ msg }`
    );
  }

  function get_text_value(input) {
    if (input.trim().length) {
      return is.number(+input) ? +input : input.trim()
    } else {
      return input;
    }
  }

  function read_until(fn) {
    return function(it, reset) {
      let index = it.index();
      let word = '';
      while (!it.end()) {
        let c = it.next();
        if (fn(c)) break;
        else word += c;
      }
      if (reset) {
        it.index(index);
      }
      return word;
    }
  }

  function read_word(it, reset) {
    let check = c => /[^\w@]/.test(c);
    return read_until(check)(it, reset);
  }

  function read_keyframe_name(it) {
    return read_until(c => /[\s\{]/.test(c))(it);
  }

  function read_line(it, reset) {
    let check = c => is.line_break(c) || c == '{';
    return read_until(check)(it, reset);
  }

  function read_step(it, extra) {
    let c, step = Tokens.step();
    while (!it.end()) {
      if ((c = it.curr()) == '}') break;
      if (is.white_space(c)) {
        it.next();
        continue;
      }
      else if (!step.name.length) {
        step.name = read_value(it, c => c === '{');
      }
      else {
        step.styles.push(read_rule(it, extra));
        if (it.curr() == '}') break;
      }
      it.next();
    }
    return step;
  }

  function read_steps(it, extra) {
    const steps = [];
    let c;
    while (!it.end()) {
      if ((c = it.curr()) == '}') break;
      else if (is.white_space(c)) {
        it.next();
        continue;
      }
      else {
        steps.push(read_step(it, extra));
      }
      it.next();
    }
    return steps;
  }

  function read_keyframes(it, extra) {
    let keyframes = Tokens.keyframes(), c;
    while (!it.end()) {
      if ((c = it.curr()) == '}') break;
      else if (!keyframes.name.length) {
        read_word(it);
        keyframes.name = read_keyframe_name(it);
        if (!keyframes.name.length) {
          throw_error('missing keyframes name', it.info());
          break;
        }
        continue;
      }
      else if (c == '{' || it.curr(-1) == '{') {
        it.next();
        keyframes.steps = read_steps(it, extra);
        break;
      }
      it.next();
    }
    return keyframes;
  }

  function read_comments(it, flag = {}) {
    it.next();
    while (!it.end()) {
      let c = it.curr();
      if (flag.inline) {
        if (c == '\n') break;
      }
      else {
        if ((c = it.curr()) == '*' && it.curr(1) == '/') break;
      }
      it.next();
    }
    if (!flag.inline) {
      it.next(); it.next();
    }
  }

  function skip_tag(it) {
    it.next();
    while(!it.end()) {
      let c = it.curr();
      if (c == '>') break;
      it.next();
    }
  }

  function read_property(it) {
    let prop = '', c;
    while (!it.end()) {
      if ((c = it.curr()) == ':') break;
      else if (!is.white_space(c)) prop += c;
      it.next();
    }
    return prop;
  }

  function read_arguments(it, composition, doodle, variables = {}) {
    let args = [], group = [], stack = [], arg = '', c;
    let raw = '';
    while (!it.end()) {
      c = it.curr();
      let prev = it.curr(-1);
      let start = it.index();
      if ((/[\('"`]/.test(c) && prev !== '\\')) {
        if (stack.length) {
          /*
          if ((c !== '(') && last(stack) === '(') {
            stack.pop();
          }
          */
          if (c !== '(' && c === last(stack)) {
            stack.pop();
          } else {
            stack.push(c);
          }
        } else {
          stack.push(c);
        }
        arg += c;
      }
      else if (!doodle && ((c == '@' || c === '$') || (prev === '.' && composition))) {
        if (!group.length) {
          arg = arg.trimLeft();
        }
        if (arg.length) {
          group.push(Tokens.text(arg));
          arg = '';
        }
        group.push(read_func(it, variables));
      }
      else if (doodle && /[)]/.test(c) || (!doodle && /[,)]/.test(c))) {
        if (stack.length) {
          if (c == ')' && last(stack) === '(') {
            stack.pop();
          }
          arg += c;
        }
        else {
          if (arg.length) {
            if (!group.length) {
              group.push(Tokens.text(get_text_value(arg)));
            } else if (/\S/.test(arg)) {
              group.push(Tokens.text(arg));
            }
            if (arg.startsWith('±') && !doodle) {
              let raw = arg.substr(1);
              let cloned = structuredClone(group);
              last(cloned).value = '-' + raw;
              args.push(normalize_argument(cloned));
              last(group).value = raw;
            }
          }

          args.push(normalize_argument(group));

          [group, arg] = [[], ''];

          if (c == ')') break;
        }
      }
      else {
        if (symbols[c] && !/[0-9]/.test(it.curr(-1))) {
          c = symbols[c];
        }
        arg += c;
      }
      if (composition && ((it.curr(1) == ')' || it.curr(1) == ';') || !/[0-9a-zA-Z_\-.]/.test(it.curr())) && !stack.length) {
        if (group.length) {
          args.push(normalize_argument(group));
        }
        break;
      }
      else {
        raw += it.range(start, it.index() + 1);
        it.next();
      }
    }
    return [skip_last_empty_args(args), raw];
  }

  function skip_last_empty_args(args) {
    let arg = last(args[0]);
    if (arg && arg.type === 'text' && !String(arg.value).trim().length) {
      args[0] = args[0].slice(0, -1);
    }
    return args;
  }

  function normalize_argument(group) {
    let result = group.map(arg => {
      if (arg.type == 'text' && typeof arg.value == 'string') {
        let value = String(arg.value);
        if (value.includes('`')) {
          arg.value = value = value.replace(/`/g, '"');
        }
        arg.value = value;
      }
      return arg;
    });

    let ft = first(result) || {};
    let ed = last(result) || {};
    if (ft.type == 'text' && ed.type == 'text') {
      let cf = first(ft.value);
      let ce  = last(ed.value);
      if (typeof ft.value == 'string' && typeof ed.value == 'string') {
        if (is.pair_of(cf, ce)) {
          ft.value = ft.value.slice(1);
          ed.value = ed.value.slice(0, ed.value.length - 1);
          result.cluster = true;
        }
      }
    }

    return result;
  }

  function seperate_func_name(name) {
    let fname = '', extra = '';
    if ((/\D$/.test(name) && !/\d+[x-]\d+/.test(name)) || Math[name.substr(1)]) {
      return { fname: name, extra }
    }
    for (let i = name.length - 1; i >= 0; i--) {
      let c = name[i];
      let prev = name[i - 1];
      let next = name[i + 1];
      if (/[\d.]/.test(c) || ((c == 'x' || c == '-') && /\d/.test(prev) && /\d/.test(next))) {
        extra = c + extra;
      } else {
        fname = name.substring(0, i + 1);
        break;
      }
    }
    return { fname, extra };
  }

  function has_times_syntax(token) {
    let str = JSON.stringify(token);
    return str.includes('pureName') && str.includes('times');
  }

  function is_svg(name) {
    return /^@svg$/i.test(name);
  }

  function read_func(it, variables = {}) {
    let func = Tokens.func();
    let name = it.curr(), c;
    let has_argument = false;
    let is_calc = name === '$';  if (name === '@') {
      it.next();
    } else {
      name = '@';
    }
    while (!it.end()) {
      c = it.curr();
      let next = it.curr(1);
      let composition = (c == '.' && (/[a-zA-Z@$]/.test(next)));
      if (c == '(' || composition) {
        has_argument = true;
        it.next();
        let [args, raw_args] = read_arguments(it, composition, composible(name), variables);
        if (is_svg(name)) {
          let parsed_svg = parse$8(raw_args);
          let line = 0;
          for (let item of parsed_svg.value) {
            if (item.variable) {
              variables[item.name] = (parse$7(`${'\n'.repeat(line++)} ${item.name}: ${item.value}`))[0].value;
            }
          }
          if (/\d\s*{/.test(raw_args) && has_times_syntax(parsed_svg)) {
            let svg = generate_svg_extended(parsed_svg);
            // compatible with old iterator
            svg += ')';
            let extended = read_arguments(iterator(svg), composition, composible(name), variables);
            args = extended[0];
          }
        }
        func.arguments = args;
        func.variables = variables;
        break;
      } else if (/[0-9a-zA-Z_\-.%]/.test(c)) {
        name += c;
      }
      if (!has_argument && next !== '(' && !/[0-9a-zA-Z_\-.%]/.test(next)) {
        break;
      }
      it.next();
    }
    let { fname, extra } = seperate_func_name(name);
    func.name = is_calc ? '@$' + name.substr(1) : fname;
    if (extra.length) {
      func.arguments.unshift([{
        type: 'text',
        value: extra
      }]);
    }

    if (is_calc && func.name.length > 2) {
      if (!func.arguments.length) {
        let name = func.name.substring(0, 2);
        let value = func.name.substring(2);
        func.name = name;
        func.arguments.push(
          [{ type: 'text', value: value }]
        );
      }
      if (/\d$/.test(func.name)) {
        let name = func.name.substring(0, 2);
        let value = func.name.substring(2);
        func.name = name;
        func.arguments[0][0].value = value;
      }
    }

    func.position = it.info().index;
    return func;
  }

  function read_value(it, check_break = () => {}) {
    let text = Tokens.text(), idx = 0, skip = true, c;
    const value = [];
    value[idx] = [];
    let stack = [], quote_stack = [];

    while (!it.end()) {
      c = it.curr();

      if (skip && is.white_space(c)) {
        it.next();
        continue;
      } else {
        skip = false;
      }

      if (c == '\n' && !is.white_space(it.curr(-1))) {
        text.value += ' ';
      }
      else if (c == ',' && !stack.length) {
        if (text.value.length) {
          value[idx].push(text);
          text = Tokens.text();
        }
        value[++idx] = [];
        skip = true;
      }
      else if ((/[;}<]/.test(c) || check_break(c)) && !quote_stack.length) {
        if (text.value.length) {
          value[idx].push(text);
          text = Tokens.text();
        }
        break;
      }
      else if ((c === '@' || c === '$') && /[\w-\(%]/.test(it.curr(1))) {
        if (text.value.length) {
          value[idx].push(text);
          text = Tokens.text();
        }
        value[idx].push(read_func(it));
      }
      else if (c === '"' || c === "'") {
        let quote = last(quote_stack);
        if (c === quote) {
          quote_stack.pop();
        } else if (!quote_stack.length) {
          quote_stack.push(c);
        }
        text.value += c;
      }
      else if (!is.white_space(c) || !is.white_space(it.curr(-1))) {
        if (c == '(') stack.push(c);
        if (c == ')') stack.pop();

        if (symbols[c] && !/[0-9]/.test(it.curr(-1))) {
          c = symbols[c];
        }
        text.value += c;
      }

      let cc = it.curr();
      if ((cc === ';' || cc == '}' || check_break(cc)) && !quote_stack.length) {
        break;
      }
      it.next();
    }
    if (text.value.length) {
      value[idx].push(text);
    }
    return value;
  }

  function read_selector(it) {
    let selector = '', c;
    while (!it.end()) {
      if ((c = it.curr()) == '{') break;
      else {
        selector += c;
      }
      it.next();
    }
    selector = selector.trim();
    return selector;
  }

  function read_cond_selector(it) {
    let selector = { name: '', arguments: [] }, c;
    while (!it.end()) {
      if ((c = it.curr()) == '(') {
        it.next();
        selector.arguments = read_arguments(it)[0];
      }
      else if (/[){]/.test(c)) break;
      else selector.name += c;
      it.next();
    }
    let [name, ...addition] = selector.name.trim().split(/\s+/);
    selector.name = name;
    selector.addition = addition;
    return selector;
  }

  function read_pseudo(it, extra) {
    let pseudo = Tokens.pseudo(), c;
    while (!it.end()) {
      c = it.curr();
      if (c == '/' && it.curr(1) == '*') {
        read_comments(it);
      }
      else if (c == '}') {
        break;
      }
      else if (is.white_space(c)) {
        it.next();
        continue;
      }
      else if (!pseudo.selector) {
        pseudo.selector = read_selector(it);
      }
      else {
        let rule = read_rule(it, extra);
        if (rule.property == '@use') {
          pseudo.styles = pseudo.styles.concat(
            rule.value
          );
        } else if (rule.property) {
          pseudo.styles.push(rule);
        }
        if (it.curr() == '}') break;
      }
      it.next();
    }
    return pseudo;
  }

  function read_rule(it, extra) {
    let rule = Tokens.rule(), c;
    let start = it.index();
    while (!it.end()) {
      c = it.curr();
      if (c == '/' && it.curr(1) == '*') {
        read_comments(it);
      }
      else if (c == ';') {
        break;
      }
      else if (!rule.property.length) {
        rule.property = read_property(it);
        if (rule.property == '@use') {
          rule.value = read_var(it, extra);
          break;
        }
      }
      else {
        rule.value = read_value(it);
        break;
      }
      it.next();
    }
    let end = it.index();
    rule.raw = () => it.range(start, end).trim();
    return rule;
  }

  function read_cond(it, extra) {
    let cond = Tokens.cond(), c;
    while (!it.end()) {
      c = it.curr();
      if (c == '/' && it.curr(1) == '*') {
        read_comments(it);
      }
      else if (c == '}') {
        break;
      }
      else if (!cond.name.length) {
        Object.assign(cond, read_cond_selector(it));
      }
      else if (c == ':') {
        let pseudo = read_pseudo(it);
        if (pseudo.selector) cond.styles.push(pseudo);
      }
      else if (c == '@' && !read_line(it, true).includes(':')) {
        cond.styles.push(read_cond(it));
      }
      else if (!is.white_space(c)) {
        let rule = read_rule(it, extra);
        if (rule.property) cond.styles.push(rule);
        if (it.curr() == '}') break;
      }
      it.next();
    }
    return cond;
  }

  function read_variable(extra, name) {
    let rule = '';
    if (extra && extra.get_variable) {
      rule = extra.get_variable(name);
    }
    return rule;
  }

  function evaluate_value(values, extra) {
    values.forEach && values.forEach(v => {
      if (v.type == 'text' && v.value) {
        let vars = parse$a(v.value);
        v.value = vars.reduce((ret, p) => {
          let rule = '', other = '', parsed;
          rule = read_variable(extra, p.name);
          if (!rule && p.fallback) {
            p.fallback.every(n => {
              other = read_variable(extra, n.name);
              if (other) {
                rule = other;
                return false;
              }
            });
          }
          try {
            parsed = parse$7(rule, extra);
          } catch (e) { }
          if (parsed) {
            ret.push.apply(ret, parsed);
          }
          return ret;
        }, []);
      }
      if (v.type == 'func' && v.arguments) {
        v.arguments.forEach(arg => {
          evaluate_value(arg, extra);
        });
      }
    });
  }

  function read_var(it, extra) {
    it.next();
    let groups = read_value(it) || [];
    return groups.reduce((ret, group) => {
      evaluate_value(group, extra);
      let [token] = group;
      if (token.value && token.value.length) {
        ret.push(...token.value);
      }
      return ret;
    }, []);
  }

  function parse$7(input, extra) {
    const it = iterator(input);
    const Tokens = [];
    while (!it.end()) {
      let c = it.curr();
      if (is.white_space(c)) {
        it.next();
        continue;
      }
      else if (c == '/' && it.curr(1) == '*') {
        read_comments(it);
      }
      else if (c == ':') {
        let pseudo = read_pseudo(it, extra);
        if (pseudo.selector) Tokens.push(pseudo);
      }
      else if (c == '@' && read_word(it, true) === '@keyframes') {
        let keyframes = read_keyframes(it, extra);
        Tokens.push(keyframes);
      }
      else if (c == '@' && !read_line(it, true).includes(':')) {
        let cond = read_cond(it, extra);
        if (cond.name.length) Tokens.push(cond);
      }
      else if (c == '<') {
        skip_tag(it);
      }
      else if (!is.white_space(c)) {
        let rule = read_rule(it, extra);
        if (rule.property) Tokens.push(rule);
      }
      it.next();
    }
    return Tokens;
  }

  function parse_grid(size, GRID = 64) {
    const [min, max, total] = [1, GRID, GRID * GRID];

    let [x, y, z] = (size + '')
      .replace(/\s+/g, '')
      .replace(/[,，xX]+/g, 'x')
      .split('x')
      .map(n => parseInt(n));

    const max_xy = (x == 1 || y == 1) ? total : max;
    const max_z = (x == 1 && y == 1) ? total : min;

    const ret = {
      x: clamp(x || min, 1, max_xy),
      y: clamp(y || x || min, 1, max_xy),
      z: clamp(z || min, 1, max_z)
    };

    return Object.assign({}, ret, {
      count: ret.x * ret.y * ret.z,
      ratio: ret.x / ret.y
    });
  }

  function parse$6(input) {
    let scanOptions = {
      preserveLineBreak: true,
      ignoreInlineComment: true,
    };
    let iter = iterator$1(removeParens(scan(input, scanOptions)));
    let stack = [];
    let tokens = [];
    let identifier;
    let line;
    let result = {
      textures: [],
    };
    while (iter.next()) {
      let { curr, next } = iter.get();
      if (curr.isSymbol('{')) {
        if (!stack.length) {
          let name = joinToken$1(tokens);
          if (isIdentifier(name)) {
            identifier = name;
            tokens = [];
          } else {
            tokens.push(curr);
          }
        } else {
          tokens.push(curr);
        }
        stack.push('{');
      }
      else if (curr.isSymbol('}')) {
        stack.pop();
        if (!stack.length && identifier) {
          let value = joinToken$1(tokens);
          if (identifier && value.length) {
            if (identifier.startsWith('texture')) {
              result.textures.push({
                name: identifier,
                value
              });
            } else {
              result[identifier] = value;
            }
            tokens = [];
          }
          identifier = null;
        } else {
          tokens.push(curr);
        }
      }
      else {
        if (!is_empty(line) && line != curr.pos[1]) {
          tokens.push(lineBreak());
          line = null;
        }
        if (!identifier || !identifier.startsWith('texture')) {
          if (curr.isWord() && curr.value.startsWith('#')) {
            tokens.push(lineBreak());
            line = next.pos[1];
          }
        }
        tokens.push(curr);
      }
    }

    if (is_empty(result.fragment)) {
      result.fragment = joinToken$1(tokens);
      result.textures = result.textures || [];
    }
    return result;
  }

  function isIdentifier(name) {
    return /^texture\w*$|^(fragment|vertex)$/.test(name);
  }

  function lineBreak() {
    return new Token({ type: 'LineBreak', value: '\n' });
  }

  function removeParens(tokens) {
    let head = tokens[0];
    let last = tokens[tokens.length - 1];
    while (head && head.isSymbol('(') && last && last.isSymbol(')')) {
      tokens = tokens.slice(1, tokens.length - 1);
      head = tokens[0];
      last = tokens[tokens.length - 1];
    }
    return tokens;
  }

  function joinToken$1(tokens) {
    return removeParens(tokens).map(n => n.value).join('');
  }

  const NS = `xmlns="http://www.w3.org/2000/svg"`;
  const NSXHtml = `xmlns="http://www.w3.org/1999/xhtml"`;
  const NSXLink = `xmlns:xlink="http://www.w3.org/1999/xlink"`;

  function create_svg_url(svg, id) {
    let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
    return `url("data:image/svg+xml;utf8,${ encoded }")`;
  }

  function normalize_svg(input) {
    if (!input.includes('<svg')) {
      input = `<svg ${NS} ${NSXLink}>${input}</svg>`;
    }
    if (!input.includes('xmlns')) {
      input = input.replace(/<svg([\s>])/, `<svg ${NS} ${NSXLink}$1`);
    }
    return input;
  }

  function parse$5(input) {
    let iter = iterator$1(scan(input));
    let ret = {};
    let matched = false;
    while (iter.next()) {
      let { prev, curr, next} = iter.get();
      let isUnit = matched
        && (curr.isWord() || curr.isSymbol())
        && prev && prev.isNumber()
        && !next;
      if (curr.isNumber()) {
        ret.value = Number(curr.value);
        matched = true;
      }
      else if (isUnit) {
        ret.unit = curr.value;
      } else {
        break;
      }
    }
    return ret;
  }

  function by_unit(fn) {
    return (...args) => {
      let units = [], values = [];
      for (let arg of args) {
        let { unit, value } = parse$5(arg);
        if (unit !== undefined) {
          units.push(unit);
        }
        if (value !== undefined) {
          values.push(value);
        }
      }
      let result = fn(...values);
      let unit = units.find(n => n !== undefined);
      if (unit === undefined) {
        return result;
      }
      if (Array.isArray(result)) {
        return result.map(n => n + unit);
      }
      return result + unit;
    }
  }

  function by_charcode(fn) {
    return (...args) => {
      let codes = args.map(n => String(n).charCodeAt(0));
      let result = fn(...codes);
      return Array.isArray(result)
        ? result.map(n => String.fromCharCode(n))
        : String.fromCharCode(result);
    }
  }

  class CacheValue {
    constructor() {
      this.cache = {};
    }
    clear() {
      this.cache = {};
    }
    set(input, value) {
      if (is_nil(input)) {
        return '';
      }
      let key = this.getKey(input);
      return this.cache[key] = value;
    }
    get(input) {
      let key = this.getKey(input);
      return this.cache[key];
    }
    getKey(input) {
      return (typeof input === 'string')
        ? hash(input)
        : hash(JSON.stringify(input));
    }
  }

  var Cache = new CacheValue();

  function memo(prefix, fn) {
    return (...args) => {
      let key = prefix + args.join('-');    return Cache.get(key) || Cache.set(key, fn(...args));
    }
  }

  function Type(type, value) {
    return { type, value };
  }

  function range(start, stop, step) {
    let count = 0, old = start;
    let initial = n => (n > 0 && n < 1) ? .1 : 1;
    let length = arguments.length;
    if (length == 1) [start, stop] = [initial(start), start];
    if (length < 3) step = initial(start);
    let range = [];
    while ((step >= 0 && start <= stop)
      || (step < 0 && start > stop)) {
      range.push(start);
      start += step;
      if (count++ >= 65535) break;
    }
    if (!range.length) range.push(old);
    return range;
  }

  function get_tokens$1(input) {
    let expr = String(input);
    let tokens = [], stack = [];
    if (!expr.startsWith('[') || !expr.endsWith(']')) {
      return tokens;
    }

    for (let i = 1; i < expr.length - 1; ++i) {
      let c = expr[i];
      if (c == '-' && expr[i - 1] == '-') {
        continue;
      }
      if (c == '-') {
        stack.push(c);
        continue;
      }
      if (last(stack) == '-') {
        stack.pop();
        let from = stack.pop();
        tokens.push(from
          ? Type('range', [ from, c ])
          : Type('char', c)
        );
        continue;
      }
      if (stack.length) {
        tokens.push(Type('char', stack.pop()));
      }
      stack.push(c);
    }
    if (stack.length) {
      tokens.push(Type('char', stack.pop()));
    }
    return tokens;
  }

  const build_range = memo('build_range', (input) => {
    let tokens = get_tokens$1(input);
    return tokens.flatMap(({ type, value }) => {
      if (type == 'char') return value;
      let [ from, to ] = value;
      let reverse = false;
      if (from > to) {
        [from, to] = [ to, from ];
        reverse = true;
      }
      let result = by_charcode(range)(from, to);
      if (reverse) result.reverse();
      return result;
    });
  });

  function expand$1(fn) {
    return (...args) => fn(...(args.flatMap(n =>
      String(n).startsWith('[') ? build_range(n) : n
    )));
  }

  class Node {
    constructor(data) {
      this.prev = this.next = null;
      this.data = data;
    }
  }

  class Stack {
    constructor(limit = 20) {
      this._limit = limit;
      this._size = 0;
    }
    push(data) {
      if (this._size >= this._limit) {
        this.root = this.root.next;
        this.root.prev = null;
      }
      let node = new Node(data);
      if (!this.root) {
        this.root = this.tail = node;
      } else {
        node.prev = this.tail;
        this.tail.next = node;
        this.tail = node;
      }
      this._size++;
    }
    last(n = 1) {
      let node = this.tail;
      while (--n) {
        if (!node.prev) break;
        node = node.prev;
      }
      return node.data;
    }
  }

  /**
   * Improved noise by Ken Perlin
   * Translated from: https://mrl.nyu.edu/~perlin/noise/
   */


  const map = [
    151,160,137,91,90,15,
    131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
    190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
    88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,
    77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
    102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,
    135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,
    5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
    223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
    129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,
    251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,
    49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
  ];

  class Perlin {
    constructor() {
      this.p = [].concat(map, map);
    }

    // Convert LO 4 bits of hash code into 12 gradient directions.
    grad(hash, x, y, z) {
      let h = hash & 15,
          u = h < 8 ? x : y,
          v = h < 4 ? y : h == 12 || h == 14 ? x : z;
      return ((h&1) == 0 ? u : -u) + ((h&2) == 0 ? v : -v);
    }

    noise(x, y, z) {
      let { p, grad } = this;
      // Find unit cube that contains point.
      let [X, Y, Z] = [x, y, z].map(n => Math.floor(n) & 255);
      // Find relative x, y, z of point in cube.
      [x, y, z] = [x, y, z].map(n => n - Math.floor(n));
      // Compute fade curves for each of x, y, z.
      let [u, v, w] = [x, y, z].map(n => n * n * n * (n * (n * 6 - 15) + 10));
      // hash coordinates of the 8 cube corners.
      let A = p[X  ]+Y, AA = p[A]+Z, AB = p[A+1]+Z,
          B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
      // And add blended results from 8 corners of cube.
      return lerp(w, lerp(v, lerp(u, grad(p[AA  ], x  , y  , z   ),
                                     grad(p[BA  ], x-1, y  , z   )),
                             lerp(u, grad(p[AB  ], x  , y-1, z   ),
                                     grad(p[BB  ], x-1, y-1, z   ))),
                     lerp(v, lerp(u, grad(p[AA+1], x  , y  , z-1 ),
                                     grad(p[BA+1], x-1, y  , z-1 )),
                             lerp(u, grad(p[AB+1], x  , y-1, z-1 ),
                                     grad(p[BB+1], x-1, y-1, z-1 ))));
    }
  }

  function get_named_arguments(args, names) {
    let result = {};
    let order = true;
    for (let i = 0; i < args.length; ++i) {
      let arg = args[i];
      let arg_name = names[i];
      if (/=/.test(arg)) {
        let [name, value] = parse$9(arg, { symbol: '=', noSpace: true });
        if (value !== undefined) {
          if (names.includes(name)) {
            result[name] = value;
          }
          // ignore the rest unnamed arguments
          order = false;
        } else {
          result[arg_name] = arg;
        }
      } else if (order) {
        result[arg_name] = arg;
      }
    }
    return result;
  }

  /**
   * Based on the Shunting-yard algorithm.
   */


  const cache = new Map();

  const default_context = {
    'π': Math.PI,
    gcd: (a, b) => {
      while (b) [a, b] = [b, a % b];
      return a;
    }
  };

  const operator = {
    '^': 7,
    '*': 6, '/': 6, '÷': 6, '%': 6,
    '&': 5, '|': 5,
    '+': 4, '-': 4,
    '<': 3, '<<': 3,
    '>': 3, '>>': 3,
    '=': 3, '==': 3,
    '≤': 3, '<=': 3,
    '≥': 3, '>=': 3,
    '≠': 3, '!=': 3,
    '∧': 2, '&&': 2,
    '∨': 2, '||': 2,
    '(': 1 , ')': 1,
  };

  function calc(expr, context, repeat = []) {
    let stack = [];
    while (expr.length) {
      let { name, value, type } = expr.shift();
      if (type === 'variable') {
        let result = context[value];
        if (is_invalid_number(result)) {
          result = Math[value];
        }
        if (is_invalid_number(result)) {
          result = expand(value, context, repeat);
        }
        if (is_invalid_number(result)) {
          if (/^\-\D/.test(value)) {
            result = expand('-1' + value.substr(1), context, repeat);
          }
        }
        if (result === undefined) {
          result = 0;
        }
        if (typeof result !== 'number') {
          repeat.push(result);
          if (is_cycle(repeat)) {
            result = 0;
            repeat = [];
          } else {
            result = calc(infix_to_postfix(result), context, repeat);
          }
        }
        stack.push(result);
      }
      else if (type === 'function') {
        let negative = false;
        if (/^\-/.test(name)) {
          negative = true;
          name = name.substr(1);
        }
        let output = value.map(v => calc(v, context, repeat));
        let fns = name.split('.');
        let fname;
        while (fname = fns.pop()) {
          if (!fname) continue;
          let fn = context[fname] || Math[fname];
          output = (typeof fn === 'function')
            ? (Array.isArray(output) ? fn(...output) : fn(output))
            : 0;
        }
        if (negative) {
          output = -1 * output;
        }
        stack.push(output);
      } else {
        if (/\d+/.test(value)) stack.push(value);
        else {
          let right = stack.pop();
          let left = stack.pop();
          stack.push(compute$1(
            value, Number(left), Number(right)
          ));
        }
      }
    }
    return Number(stack[0]) || 0;
  }

  function get_tokens(input) {
    if (cache.has(input)) {
      return cache.get(input);
    }
    let expr = String(input);
    let tokens = [], num = '';

    for (let i = 0; i < expr.length; ++i) {
      let c = expr[i];
      if (operator[c]) {
        let last_token = last(tokens);
        if (c == '=' && last_token && /^[!<>=]$/.test(last_token.value)) {
          last_token.value += c;
        }
        else if (/^[|&<>]$/.test(c) && last_token && last_token.value == c) {
          last_token.value += c;
        }
        else if (c == '-' && expr[i - 1] == 'e') {
          num += c;
        }
        else if (!tokens.length && !num.length && /[+-]/.test(c)) {
          num += c;
        } else {
          let { type, value } = last_token || {};
          if (type == 'operator'
              && !num.length
              && /[^()]/.test(c)
              && /[^()]/.test(value)) {
            num += c;
          } else {
            if (num.length) {
              tokens.push({ type: 'number', value: num });
              num = '';
            }
            tokens.push({ type: 'operator', value: c });
          }
        }
      }
      else if (/\S/.test(c)) {
        if (c == ',') {
          tokens.push({ type: 'number', value: num });
          num = '';
          tokens.push({ type: 'comma', value: c });
        } else if (c == '!') {
          tokens.push({ type: 'number', value: num });
          tokens.push({ type: 'operator', value: c });
          num = '';
        } else {
          num += c;
        }
      }
    }

    if (num.length) {
      tokens.push({ type: 'number', value: num });
    }
    cache.set(input, tokens);
    return tokens;
  }

  function infix_to_postfix(input) {
    let tokens = get_tokens(input);
    const op_stack = [], expr = [];

    for (let i = 0; i < tokens.length; ++i) {
      let { type, value } = tokens[i];
      let next = tokens[i + 1] || {};
      if (type == 'number') {
        if (next.value == '(' && /[^\d.\-]/.test(value)) {
          let func_body = '';
          let stack = [];
          let values = [];

          i += 1;
          while (tokens[i++] !== undefined) {
            let token = tokens[i];
            if (token === undefined) break;
            let c = token.value;
            if (c == ')') {
              if (!stack.length) break;
              stack.pop();
              func_body += c;
            }
            else {
              if (c == '(') stack.push(c);
              if (c == ',' && !stack.length) {
                let arg = infix_to_postfix(func_body);
                if (arg.length) values.push(arg);
                func_body = '';
              } else {
                func_body += c;
              }
            }
          }

          if (func_body.length) {
            values.push(infix_to_postfix(func_body));
          }

          expr.push({
            type: 'function',
            name: value,
            value: values
          });
        }
        else if (/[^\d.\-]/.test(value)) {
          expr.push({ type: 'variable', value });
        }
        else {
          expr.push({ type: 'number', value });
        }
      }

      else if (type == 'operator') {
        if (value == '(') {
          op_stack.push(value);
        }

        else if (value == ')') {
          while (op_stack.length && last(op_stack) != '(') {
            expr.push({ type: 'operator', value: op_stack.pop() });
          }
          op_stack.pop();
        }

        else {
          while (op_stack.length && operator[last(op_stack)] >= operator[value]) {
            let op = op_stack.pop();
            if (!/[()]/.test(op)) expr.push({ type: 'operator', value: op });
          }
          op_stack.push(value);
        }
      }
    }

    while (op_stack.length) {
      expr.push({ type: 'operator', value: op_stack.pop() });
    }

    return expr;
  }

  function compute$1(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '%': return a % b;
      case '|': return a | b;
      case '&': return a & b;
      case '<': return a < b;
      case '>': return a > b;
      case '^': return Math.pow(a, b);
      case '÷': case '/': return a / b;
      case '=': case '==': return a == b;
      case '≤': case '<=': return a <= b;
      case '≥': case '>=': return a >= b;
      case '≠': case '!=': return a != b;
      case '∧': case '&&': return a && b;
      case '∨': case '||': return a || b;
      case '<<': return a << b;
      case '>>': return a >> b;
    }
  }

  function expand(value, context, repeat) {
    let [_, num, variable] = value.match(/([\d.\-]+)(.*)/) || [];
    let v = context[variable];
    if (v === undefined) {
      return v;
    }
    if (typeof v === 'number') {
      return Number(num) * v;
    } else {
      repeat.push(v);
      if (is_cycle(repeat)) {
        repeat = [];
        return 0;
      } else {
        return num * calc(infix_to_postfix(v), context, repeat);
      }
    }
  }

  function is_cycle(array) {
    if (array.length > 50) return true;
    let tail = last(array);
    for (let i = 2; i <= 4; ++i) {
      let item = array[array.length - i];
      if (item === undefined) return false;
      if (tail !== item) return false;
    }
    return true;
  }

  function calc$1(input, context) {
    const expr = infix_to_postfix(input);
    return calc(expr, Object.assign({}, default_context, context));
  }

  const utime = {
    'name': 'cssd-utime',
    'animation-name': 'cssd-utime-animation',
    'animation-duration': 31536000000, /* one year in ms */
    'animation-iteration-count': 'infinite',
    'animation-delay': '0s',
    'animation-direction': 'normal',
    'animation-fill-mode': 'none',
    'animation-play-state': 'running',
    'animation-timing-function': 'linear',
  };

  utime['animation'] = `
  ${utime['animation-duration']}ms
  ${utime['animation-timing-function']}
  ${utime['animation-delay']}
  ${utime['animation-iteration-count']}
  ${utime['animation-name']}
`;

  const umousex = {
    name: 'cssd-umousex',
  };

  const umousey = {
    name: 'cssd-umousey',
  };

  const uwidth = {
    name: 'cssd-uwidth',
  };

  const uheight = {
    name: 'cssd-uheight',
  };

  const commands = 'MmLlHhVvCcSsQqTtAaZz';
  const relatives = 'mlhvcsqtaz';

  function parse$4(input) {
    let iter = iterator$1(scan(input));
    let temp = {};
    let result = {
      commands: [],
      valid: true
    };
    while (iter.next()) {
      let { curr } = iter.get();
      if (curr.isSpace() || curr.isSymbol(',')) {
        continue;
      }
      if (curr.isWord()) {
        if (temp.name) {
          result.commands.push(temp);
          temp = {};
        }
        temp.name = curr.value;
        temp.value = [];
        if (!commands.includes(curr.value)) {
          temp.type = 'unknown';
          result.valid = false;
        } else if (relatives.includes(curr.value)) {
          temp.type = 'relative';
        } else {
          temp.type = 'absolute';
        }
      } else if (temp.value) {
        let value = curr.value;
        if (curr.isNumber()) {
          value = Number(curr.value);
        }
        temp.value.push(value);
      } else if (!temp.name) {
        result.valid = false;
      }
    }
    if (temp.name) {
      result.commands.push(temp);
    }
    return result;
  }

  const nextId = next_id();

  class Tag {
    constructor(name, value = '') {
      if (!name) {
        throw new Error("Tag name is required");
      }
      this.id = Symbol();
      this.name = name;
      this.body = [];
      this.attrs = {};
      if (this.isTextNode()) {
        this.body = value;
      }
    }
    isTextNode() {
      return this.name === 'text-node';
    }
    find(target) {
      let id = target.attrs.id;
      let name = target.name;
      if (Array.isArray(this.body) && id !== undefined) {
        return this.body.find(tag => tag.attrs.id === id && tag.name === name);
      }
    }
    findSpareDefs() {
      return this.body.find(n => n.name === 'defs' && !n.attrs.id);
    }
    append(tags) {
      if (!Array.isArray(tags)) {
        tags = [tags];
      }
      for (let tag of tags) {
        if (!this.isTextNode()) {
          this.body.push(tag);
        }
      }
    }
    merge(tag) {
      for (let [name, value] of Object.entries(tag.attrs)) {
        this.attrs[name] = value;
      }
      if (Array.isArray(tag.body)) {
        this.body.push(...tag.body);
      }
    }
    attr(name, value) {
      if (!this.isTextNode()) {
        if (value === undefined) {
          return this.attrs[name];
        }
        return this.attrs[name] = value;
      }
    }
    toString() {
      if (this.isTextNode()) {
        return removeQuotes(this.body);
      }
      let attrs = [''];
      let body = [];
      for (let [name, value] of Object.entries(this.attrs)) {
        value = removeQuotes(value);
        attrs.push(`${name}="${value}"`);
      }
      for (let tag of this.body) {
        body.push(tag.toString());
      }
      let content = body.join('');
      if (content.length || /svg/i.test(this.name)) {
        return `<${this.name}${attrs.join(' ')}>${body.join('')}</${this.name}>`;
      }
      return `<${this.name}${attrs.join(' ')}/>`;
    }
  }

  function composeStyleRule(name, value) {
    return `${name}:${value};`
  }

  function removeQuotes(text) {
    text = String(text);
    let double = text.startsWith('"') && text.endsWith('"');
    let single = text.startsWith("'") && text.endsWith("'");
    if (double || single) {
      return text.substring(1, text.length - 1);
    }
    return text;
  }

  function transformViewBox(token) {
    let viewBox = token.detail.value;
    let p = token.detail.padding || token.detail.p || token.detail.expand;
    if (!viewBox.length) {
      return '';
    }
    let [x, y, w, h] = viewBox;
    if (p) {
      [x, y, w, h] = [x-p, y-p, w+p*2, h+p*2];
    }
    return `${x} ${y} ${w} ${h}`;
  }

  function isGraphicElement(name) {
    return name === 'path'
      || name === 'line'
      || name === 'circle'
      || name === 'ellipse'
      || name === 'rect'
      || name === 'polygon'
      || name === 'polyline';
  }

  function generate(token, element, parent, root) {
    let inlineId;
    if (!element) {
      element = new Tag('root');
    }
    if (token.type === 'block') {
      // style tag
      if (token.name === 'style') {
        let el = new Tag('style');
        el.append(token.value);
        element.append(el);
      }
      // normal svg elements
      else {
        let el = new Tag(token.name);
        if (!root) {
          root = el;
          root.attr('xmlns', NS.split('=')[1]);
        }
        if (token.name === 'defs') {
          let defsElement = root.findSpareDefs();
          // replace with existing defs
          if (defsElement) {
            el = defsElement;
          }
        }
        for (let block of token.value) {
          token.parent = parent;
          let id = generate(block, el, token, root);
          if (id) { inlineId = id; }
        }
        let isInlineAndNotDefs = token && token.inline && token.name !== 'defs';
        let isParentInlineDefs = parent && parent.inline && parent.name === 'defs';
        let isSingleDefChild = isParentInlineDefs && parent.value.length == 1;

        if (isInlineAndNotDefs || isParentInlineDefs) {
          // generate id for inline block if no id is found
          let found = token.value.find(n => n.type === 'statement' && n.name === 'id');
          if (found) {
            inlineId = found.value;
          } else if (isSingleDefChild || isInlineAndNotDefs) {
            inlineId = nextId(token.name);
            el.attr('id', inlineId);
          }
        }
        let existedTag = element.find(el);
        if (existedTag) {
          existedTag.merge(el);
        } else {
          if (token.name === 'defs') {
            // append only when there's no defs and spare defs
            let defsElement = root.findSpareDefs();
            if (defsElement && !el.attrs.id) {
              if (el.id !== defsElement.id) {
                defsElement.append(el.body);
              }
            } else {
              root.append(el);
            }
          } else {
            element.append(el);
          }
        }
      }
    }
    if (token.type === 'statement' && !token.variable) {
      if (token.name === 'content') {
        let text = new Tag('text-node', token.value);
        element.append(text);
      }
      // inline style
      else if (token.name.startsWith('style ')) {
        let name = (token.name.split('style ')[1] || '').trim();
        if (name.length) {
          let style = element.attr('style') || '';
          element.attr('style', style + composeStyleRule(name, token.value));
        }
      }
      else {
        let value = token.value;
        // handle inline block value
        if (value && value.type === 'block') {
          let id = generate(token.value, root, token, root);
          if (is_nil(id)) {
            value = '';
          } else {
            value = `url(#${id})`;
            if (token.name === 'xlink:href' || token.name === 'href') {
              value = `#${id}`;
            }
          }
        }
        if (/viewBox/i.test(token.name)) {
          value = transformViewBox(token);
          if (value) {
            element.attr(token.name, value);
          }
        }
        else if ((token.name === 'draw' || token.name === 'animate') && isGraphicElement(parent && parent.name)) {
          let [dur, repeatCount] = String(value).split(/\s+/);
          if (dur === 'indefinite' || dur === 'infinite' || /\d$/.test(dur)) {
            [dur, repeatCount] = [repeatCount, dur];
          }
          if (repeatCount === 'infinite') {
            repeatCount = 'indefinite';
          }
          element.attr('stroke-dasharray', 10);
          element.attr('pathLength', 10);
          let animate = new Tag('animate');
          animate.attr('attributeName', 'stroke-dashoffset');
          animate.attr('from', 10);
          animate.attr('to', 0);
          animate.attr('dur', dur);
          if (repeatCount) {
            animate.attr('repeatCount', repeatCount);
          }
          element.append(animate);
        }
        else {
          element.attr(token.name, value);
        }
        if (token.name.includes('xlink:')) {
          root.attr('xmlns:xlink', NSXLink.split('=')[1]);
        }
      }
    }
    if (!parent) {
      return root.toString();
    }
    return inlineId;
  }

  function generate_svg(token) {
    return generate(token);
  }

  const keywords = ['auto', 'reverse'];
  const units = ['deg', 'rad', 'grad', 'turn'];

  function parse$3(input) {
    let iter = iterator$1(scan(input));
    let matched = false;
    let unit = '';
    let ret = {
      direction: '',
      angle: '',
    };
    while (iter.next()) {
      let { prev, curr, next } = iter.get();
      if (curr.isWord() && keywords.includes(curr.value)) {
        ret.direction = curr.value;
        matched = true;
      }
      else if (curr.isNumber()) {
        ret.angle = Number(curr.value);
        matched = true;
      }
      else if (curr.isWord() && prev && prev.isNumber() && units.includes(curr.value)) {
        unit = curr.value;
      }
      else if (curr.isSpace() && ret.direction !== '' && ret.angle !== '') {
        break;
      }
    }
    if (!matched) {
      ret.direction = 'auto';
    }
    return normalizeAngle(ret, unit);
  }

  function normalizeAngle(input, unit) {
    let { angle } = input;
    if (angle === '') {
      angle = 0;
    }
    if (unit === 'rad') {
      angle /= (Math.PI / 180);
    }
    if (unit === 'grad') {
      angle *= .9;
    }
    if (unit === 'turn') {
      angle *= 360;
    }
    return Object.assign({}, input, { angle });
  }

  function parse$2(input) {
    let iter = iterator$1(scan(input));
    let commands = {};
    let tokens = [];
    let name;
    let negative = false;
    while (iter.next()) {
      let { prev, curr, next } = iter.get();
      if (curr.isSymbol(':') && !name) {
        name = joinTokens(tokens);
        tokens = [];
      } else if (curr.isSymbol(';') && name) {
        commands[name] = transformNegative(name, joinTokens(tokens), negative);
        tokens = [];
        name = null;
        negative = false;
      } else if (!curr.isSymbol(';')) {
        let prevMinus = prev && prev.isSymbol('-');
        let nextMinus = next && next.isSymbol('-');
        let currMinus = curr.isSymbol('-');
        if (!name && !tokens.length && currMinus && !prevMinus && !nextMinus) {
          if (next && next.isSymbol(':')) {
            tokens.push(curr);
          } else {
            negative = true;
          }
        } else {
          tokens.push(curr);
        }
      }
    }
    if (tokens.length && name) {
      commands[name] = transformNegative(name, joinTokens(tokens), negative);
    }
    return commands;
  }

  function transformNegative(name, value, negative) {
    let excludes = ['fill-rule', 'fill'];
    if (excludes.includes(name)) {
      return value;
    }
    return negative ? `-1 * (${value})` : value;
  }

  function joinTokens(tokens) {
    return tokens.map(n => n.value).join('');
  }

  const { cos, sin, abs, atan2, PI } = Math;

  const preset_shapes = {
    circle: `
    split: 180;
    scale: .99
  `,

    triangle: `
    rotate: 30;
    scale: 1.1;
    move: 0 .2
  `,

    pentagon: `
    split: 5;
    rotate: 54
  `,

    hexagon: `
    split: 6;
    rotate: 30;
    scale: .98
  `,

    octagon: `
    split: 8;
    rotat: 22.5;
    scale: .99
  `,

    star: `
    split: 10;
    r: cos(5t);
    rotate: -18;
    scale: .99
  `,

    infinity: `
    split: 180;
    scale: .99;
    x: cos(t)*.99 / (sin(t)^2 + 1);
    y: x * sin(t)
  `,

    heart: `
    split: 180;
    rotate: 180;
    a: cos(t)*13/18 - cos(2t)*5/18;
    b: cos(3t)/18 + cos(4t)/18;
    x: (.75 * sin(t)^3) * 1.2;
    y: (a - b + .2) * -1.1
  `,

    bean: `
    split: 180;
    r: sin(t)^3 + cos(t)^3;
    move: -.35 .35;
  `,

    bicorn: `
    split: 180;
    x: cos(t);
    y: sin(t)^2 / (2 + sin(t)) - .5
  `,

    drop: `
    split: 180;
    rotate: 90;
    scale: .95;
    x: sin(t);
    y: (1 + sin(t)) * cos(t) / 1.6
  `,

    fish: `
    split: 240;
    x: cos(t) - sin(t)^2 / sqrt(2) - .04;
    y: sin(2t)/2
  `,

    whale: `
    split: 240;
    rotate: 180;
    R: 3.4 * (sin(t)^2 - .5) * cos(t);
    x: cos(t) * R + .75;
    y: sin(t) * R * 1.2
  `,

    windmill: `
    split: 18;
    R: seq(.618, 1, 0);
    T: seq(t-.55, t, t);
    x: R * cos(T);
    y: R * sin(T)
  `,

    vase: `
    split: 240;
    scale: .3;
    x: sin(4t) + sin(t) * 1.4;
    y: cos(t) + cos(t) * 4.8 + .3
  `,

    clover(k = 3) {
      k = clamp(k, 3, 5);
      if (k == 4) k = 2;
      return `
      split: 240;
      r: cos(${k}t);
      scale: .98
    `;
    },

    hypocycloid(k = 3) {
      k = clamp(k, 3, 5);
      let scale = [.34, .25, .19][k - 3];
      return `
      split: 240;
      scale: ${scale};
      k: ${k};
      x: (k-1)*cos(t) + cos((k-1)*t);
      y: (k-1)*sin(t) - sin((k-1)*t)
    `;
    },

    bud(k = 3) {
      k = clamp(k, 3, 10);
      return `
      split: 240;
      scale: .8;
      r: 1 + .2 * cos(${k}t)
    `;
    },
  };

  class Point {
    constructor(x, y, angle) {
      this.x = x;
      this.y = y;
      this.extra = angle;
    }
    valueOf() {
      return this.x + ' ' + this.y;
    }
    toString() {
      return this.valueOf();
    }
  }

  function create_polygon_points(option, fn) {
    if (!fn) {
      fn = t => [ cos(t), sin(t) ];
    }
    let split = option.split || 180;
    let turn = option.turn || 1;
    let frame = option.frame;
    let fill = option['fill'] || option['fill-rule'];
    let direction = parse$3(option['direction'] || option['dir'] || '');
    let unit = option.unit;

    let rad = (PI * 2) * turn / split;
    let points = [];
    let first_point, first_point2;

    let factor = (option.scale === undefined) ? 1 : option.scale;
    let add = ([x1, y1, dx = 0, dy = 0]) => {
      if (x1 == 'evenodd' || x1 == 'nonzero') {
        return points.push(new Point(x1, '', ''));
      }
      let [x, y] = scale(x1, -y1, factor);
      let [dx1, dy2] = scale(dx, -dy, factor);
      let angle = calc_angle(x, y, dx1, dy2, direction);
      if (unit !== undefined && unit !== '%') {
        if (unit !== 'none') {
          x += unit;
          y += unit;
        }
      } else {
        x = (x + 1) * 50 + '%';
        y = (y + 1) * 50 + '%';
      }
      points.push(new Point(x, y, angle));
    };

    if (fill == 'nonzero' || fill == 'evenodd') {
      add([fill, '', '']);
    }

    for (let i = 0; i < split; ++i) {
      let t = rad * i;
      let point = fn(t, i);
      if (!i) first_point = point;
      add(point);
    }

    if (frame !== undefined) {
      add(first_point);
      let w = frame / 100;
      if (turn > 1) w *= 2;
      if (w == 0) w = .002;
      for (let i = 0; i < split; ++i) {
        let t = -rad * i;
        let [x, y, dx = 0, dy = 0] = fn(t, i);
        let theta = atan2(y + dy, x - dx);
        let point = [
          x - w * cos(theta),
          y - w * sin(theta)
        ];
        if (!i) first_point2 = point;
        add(point);
      }
      add(first_point2);
      add(first_point);
    }

    return points;
  }

  function calc_angle(x, y, dx, dy, option) {
    let base = atan2(y + dy, x - dx) * 180 / PI;
    if (option.direction === 'reverse') {
      base -= 180;
    }
    if (!option.direction) {
      base = 90;
    }
    if (option.angle) {
      base += option.angle;
    }
    return base;
  }

  function rotate(x, y, deg) {
    let rad = -PI / 180 * deg;
    return [
      x * cos(rad) - y * sin(rad),
      y * cos(rad) + x * sin(rad)
    ];
  }

  function translate(x, y, offset) {
    let [dx, dy = dx] = parse$9(offset).map(Number);
    return [
      x + (dx || 0),
      y - (dy || 0),
      dx,
      dy
    ];
  }

  function scale(x, y, factor) {
    let [fx, fy = fx] = parse$9(factor).map(Number);
    return [
      x * fx,
      y * fy
    ];
  }

  function create_shape_points(props, {min, max}) {
    let split = clamp(parseInt(props.vertices || props.points || props.split) || 0, min, max);
    let px = is_empty(props.x) ? 'cos(t)' : props.x;
    let py = is_empty(props.y) ? 'sin(t)' : props.y;
    let pr = is_empty(props.r) ? ''       : props.r;
    let pt = is_empty(props.t) ? ''       : props.t;

    let { unit, value } = parse$5(pr);
    if (unit && !props[unit] && unit !== 't') {
      if (is_empty(props.unit)) {
        props.unit = unit;
      }
      pr = props.r = value;
    }

    if (props.degree) {
      props.rotate = props.degree;
    }

    if (props.origin) {
      props.move = props.origin;
    }

    props.split = split;

    return create_polygon_points(props, (t, i) => {
      let context = Object.assign({}, props, {
        't': pt || t,
        'θ': pt || t,
        'i': (i + 1),
        seq(...list) {
          if (!list.length) return '';
          return list[i % list.length];
        },
        range(a, b = 0) {
          a = Number(a) || 0;
          b = Number(b) || 0;
          if (a > b) [a, b] = [b, a];
          let step = abs(b - a) / (split - 1);
          return a + step * i;
        }
      });
      let x = calc$1(px, context);
      let y = calc$1(py, context);
      let dx = 0;
      let dy = 0;
      if (pr) {
        let r = calc$1(pr, context);
        if (r == 0) {
          r = .00001;
        }
        if (pt) {
          t = calc$1(pt, context);
        }
        x = r * cos(t);
        y = r * sin(t);
      }
      if (props.rotate) {
        [x, y] = rotate(x, y, Number(props.rotate) || 0);
      }
      if (props.move) {
        [x, y, dx, dy] = translate(x, y, props.move);
      }
      return [x, y, dx, dy];
    });
  }

  function generate_shape(input, min=3, max=3600, modifier) {
    let commands = '';
    let [name, ...args] = parse$9(input);
    let preset = false;
    switch (typeof preset_shapes[name]) {
      case 'function':
        commands = preset_shapes[name](...args);
        preset = true;
        break;
      case 'string':
        commands = preset_shapes[name];
        preset = true;
        break;
      default: {
        commands = input;
      }
    }
    let rules = parse$2(commands);
    if (typeof modifier === 'function') {
      rules = modifier(rules);
    }
    let points = create_shape_points(rules, {min, max});
    return {
      rules, points, preset
    }
  }

  function make_sequence(c) {
    return lazy((_, n, ...actions) => {
      if (!actions || !n) return '';
      let count = get_value(n());
      let evaluated = count;
      if (/\D/.test(count) && !/\d+[x-]\d+/.test(count)) {
        evaluated = calc$1(count);
        if (evaluated === 0) {
          evaluated = count;
        }
      }
      let signature = Math.random();
      return sequence(
        evaluated,
        (...args) => {
          return actions.map(action => {
            return get_value(action(...args, signature))
          }).join(',');
        }
      ).join(c);
    });
  }

  function push_stack(context, name, value) {
    if (!context[name]) context[name] = new Stack(1024);
    context[name].push(value);
    return value;
  }

  function flip_value(num) {
    return -1 * num;
  }

  function map2d(value, min, max, amp = 1) {
    let dimension = 2;
    let v = Math.sqrt(dimension / 4) * amp;
    let [ma, mb] = [-v, v];
    return lerp((value - ma) / (mb - ma), min * amp, max * amp);
  }

  function compute(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '%': return a % b;
      default: return 0;
    }
  }

  function calc_with(base) {
    return v => {
      if (is_empty(v) || is_empty(base)) {
        return base;
      }
      if (/^[+*-\/%][\-.\d\s]/.test(v)) {
        let op = v[0];
        let { unit = '', value } = parse$5(v.substr(1).trim() || 0);
        if (/^var/.test(base)) {
          return `calc((${base} ${op} ${value}) * 1${unit})`;
        }
        return compute(op, base, value) + unit;
      }
      else if (/[+*-\/%]$/.test(v)) {
        let op = v.substr(-1);
        let { unit = '', value } = parse$5(v.substr(0, v.length - 1).trim() || 0);
        if (/^var/.test(base)) {
          return `calc((${value} ${op} ${base}) * 1${unit})`;
        }
        return compute(op, value, base) + unit;
      } else {
        let { unit = '', value } = parse$5(v || 0);
        return (base + value) + unit;
      }
    }
  }

  const Expose = add_alias({

    i({ count }) {
      return calc_with(count);
    },

    y({ y }) {
      return calc_with(y);
    },

    x({ x }) {
      return calc_with(x);
    },

    z({ z }) {
      return calc_with(z);
    },

    I({ grid }) {
      return calc_with(grid.count);
    },

    Y({ grid }) {
      return calc_with(grid.y);
    },

    X({ grid }) {
      return calc_with(grid.x);
    },

    Z({ grid }) {
      return calc_with(grid.z);
    },

    id({ x, y, z }) {
      return _ => cell_id(x, y, z);
    },

    dx({ x, grid }) {
      return n => {
        n = Number(n) || 0;
        return x - .5 - n - grid.x / 2;
      }
    },

    dy({ y, grid }) {
      return n => {
        n = Number(n) || 0;
        return y - .5 - n - grid.y / 2;
      }
    },

    n({ extra }) {
      let lastExtra = last(extra);
      return lastExtra ? calc_with(lastExtra[0]) : '@n';
    },

    nx({ extra }) {
      let lastExtra = last(extra);
      return lastExtra ? calc_with(lastExtra[1]) : '@nx';
    },

    ny({ extra }) {
      let lastExtra = last(extra);
      return lastExtra ? calc_with(lastExtra[2]) : '@ny';
    },

    N({ extra }) {
      let lastExtra = last(extra);
      return lastExtra ? calc_with(lastExtra[3]) : '@N';
    },

    m: make_sequence(','),

    M: make_sequence(' '),

    µ: make_sequence(''),

    p({ context, pick }) {
      return expand$1((...args) => {
        if (!args.length) {
          args = context.last_pick_args || [];
        }
        let picked = pick(args);
        context.last_pick_args = args;
        return push_stack(context, 'last_pick', picked);
      });
    },

    P({ context, pick, position }) {
      let counter = 'P-counter' + position;
      return expand$1((...args) => {
        let normal = true;
        if (!args.length) {
          args = context.last_pick_args || [];
          normal = false;
        }
        let stack = context.last_pick;
        let last = stack ? stack.last(1) : '';
        if (normal) {
          if (!context[counter]) {
            context[counter] = {};
          }
          last = context[counter].last_pick;
        }
        if (args.length > 1) {
          let i = args.findIndex(n => n === last);
          if (i !== -1) {
            args.splice(i, 1);
          }
        }
        let picked = pick(args);
        context.last_pick_args = args;
        if (normal) {
          context[counter].last_pick = picked;
        }
        return push_stack(context, 'last_pick', picked);
      });
    },

    pl({ context, extra, position }) {
      let lastExtra = last(extra);
      let sig = lastExtra ? last(lastExtra) : '';
      let counter = 'pl-counter' + position + sig;
      return expand$1((...args) => {
        if (!context[counter]) context[counter] = 0;
        context[counter] += 1;
        let max = args.length;
        let idx = lastExtra && lastExtra[6];
        if (is_nil(idx)) idx = context[counter];
        let pos = (idx - 1) % max;
        let value = args[pos];
        return push_stack(context, 'last_pick', value);
      });
    },

    pr({ context, extra, position }) {
      let lastExtra = last(extra);
      let sig = lastExtra ? last(lastExtra) : '';
      let counter = 'pr-counter' + position + sig;
      return expand$1((...args) => {
        if (!context[counter]) context[counter] = 0;
        context[counter] += 1;
        let max = args.length;
        let idx = lastExtra && lastExtra[6];
        if (is_nil(idx)) idx = context[counter];
        let pos = (idx - 1) % max;
        let value = args[max - pos - 1];
        return push_stack(context, 'last_pick', value);
      });
    },

    pd({ context, extra, position, shuffle }) {
      let lastExtra = last(extra);
      let sig = lastExtra ? last(lastExtra) : '';
      let counter = 'pd-counter' + position  + sig;
      let values = 'pd-values' + position + sig;    return expand$1((...args) => {
        if (!context[counter]) context[counter] = 0;
        context[counter] += 1;
        if (!context[values]) {
          context[values] = shuffle(args || []);
        }
        let max = args.length;
        let idx = lastExtra && lastExtra[6];
        if (is_nil(idx)) idx = context[counter];
        let pos = (idx - 1) % max;
        let value = context[values][pos];
        return push_stack(context, 'last_pick', value);
      });
    },

    lp({ context }) {
      return (n = 1) => {
        let stack = context.last_pick;
        return stack ? stack.last(n) : '';
      };
    },

    r({ context, rand }) {
      return (...args) => {
        let transform = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let value = transform(rand)(...args);
        return push_stack(context, 'last_rand', value);
      };
    },

    rn({ x, y, context, position, grid, extra, random }) {
      let counter = 'noise-2d' + position;
      let counterX = counter + 'offset-x';
      let counterY = counter + 'offset-y';
      let [ni, nx, ny, nm, NX, NY] = last(extra) || [];
      let isSeqContext = (ni && nm);
      return (...args) => {
        let {from = 0, to = from, frequency = 1, scale = 1, octave = 1} = get_named_arguments(args, [
          'from', 'to', 'frequency', 'scale', 'octave'
        ]);

        frequency = clamp(frequency, 0, Infinity);
        scale = clamp(scale, 0, Infinity);
        octave = clamp(octave, 1, 100);

        if (args.length == 1) [from, to] = [0, from];
        if (!context[counter]) context[counter] = new Perlin();
        if (!context[counterX]) context[counterX] = random();
        if (!context[counterY]) context[counterY] = random();

        let transform = (is_letter(from) && is_letter(to)) ? by_charcode : by_unit;
        let noise2d = context[counter];
        let offsetX = context[counterX];
        let offsetY = context[counterY];
        let _x = (isSeqContext ? ((nx - 1) / NX) : ((x - 1) / grid.x)) + offsetX;
        let _y = (isSeqContext ? ((ny - 1) / NY) : ((y - 1) / grid.y)) + offsetY;

        // 1-dimentional
        if (NX <= 1 || grid.x <= 1) _x = 0;
        if (NY <= 1 || grid.y <= 1) _y = 0;

        // 1x1
        if (_x == 0 && _y == 0) {
          _x = offsetX;
          _y = offsetY;
        }

        let t = noise2d.noise(_x * frequency, _y * frequency, 0) * scale;

        for (let i = 1; i < octave; ++i) {
          let i2 = i * 2;
          t += noise2d.noise(_x * frequency * i2, _y * frequency * i2, 0) * (scale / i2);
        }
        let fn = transform((from, to) => map2d(t, from, to, scale));
        return push_stack(context, 'last_rand', fn(from, to));
      };
    },

    lr({ context }) {
      return (n = 1) => {
        let stack = context.last_rand;
        return stack ? stack.last(n) : '';
      };
    },

    stripe() {
      return (...input) => {
        let colors = input.map(get_value);
        let max = colors.length;
        let default_count = 0;
        let custom_sizes = [];
        let prev;
        if (!max) {
          return '';
        }
        colors.forEach(step => {
          let [_, size] = parse$9(step);
          if (size !== undefined) custom_sizes.push(size);
          else default_count += 1;
        });
        let default_size = custom_sizes.length
          ? `(100% - ${custom_sizes.join(' - ')}) / ${default_count}`
          : `100% / ${max}`;
        return colors.map((step, i) => {
          if (custom_sizes.length) {
            let [color, size] = parse$9(step);
            let prefix = prev ? (prev + ' + ') : '';
            prev = prefix + (size !== undefined ? size : default_size);
            return `${color} 0 calc(${ prev })`
          }
          return `${step} 0 ${100 / max * (i + 1)}%`
        })
        .join(',');
      }
    },

    calc() {
      return (value, context) => {
        return calc$1(get_value(value), context);
      }
    },

    hex() {
      return value => parseInt(get_value(value)).toString(16);
    },

    svg: lazy((_, ...args) => {
      let value = args.map(input => get_value(input())).join(',');
      if (!value.startsWith('<')) {
        let parsed = parse$8(value);
        value = generate_svg(parsed);
      }
      let svg = normalize_svg(value);
      return create_svg_url(svg);
    }),

    'svg-filter': lazy((upstream, ...args) => {
      let values = args.map(input => get_value(input()));
      let value = values.join(',');
      let id = unique_id('filter-');
      // shorthand
      if (values.every(n => /^[\-\d.]/.test(n) || (/^(\w+)/.test(n) && !/[{}<>]/.test(n)))) {
        let { frequency, scale, octave, seed = upstream.seed, blur, erode, dilate } = get_named_arguments(values, [
          'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
        ]);
        value = `
        x: -20%;
        y: -20%;
        width: 140%;
        height: 140%;
      `;
        if (!is_nil(dilate)) {
          value += `
          feMorphology {
            operator: dilate;
            radius: ${dilate};
          }
        `;
        }
        if (!is_nil(erode)) {
          value += `
          feMorphology {
            operator: erode;
            radius: ${erode};
          }
        `;
        }
        if (!is_nil(blur)) {
          value += `
          feGaussianBlur {
            stdDeviation: ${blur};
          }
        `;
        }
        if (!is_nil(frequency)) {
          let [bx, by = bx] = parse$9(frequency);
          octave = octave ? `numOctaves: ${octave};` : '';
          value += `
          feTurbulence {
            type: fractalNoise;
            baseFrequency: ${bx} ${by};
            seed: ${seed};
            ${octave}
          }
        `;
          if (scale) {
            value += `
            feDisplacementMap {
              in: SourceGraphic;
              scale: ${scale};
            }
          `;
          }
        }
      }
      // new svg syntax
      if (!value.startsWith('<')) {
        let parsed = parse$8(value, {
          type: 'block',
          name: 'filter'
        });
        value = generate_svg(parsed);
      }
      let svg = normalize_svg(value).replace(
        /<filter([\s>])/,
        `<filter id="${ id }"$1`
      );
      return create_svg_url(svg, id);
    }),

    'svg-pattern': lazy((_, ...args) => {
      let value = args.map(input => get_value(input())).join(',');
      let parsed = parse$8(`
      viewBox: 0 0 1 1;
      preserveAspectRatio: xMidYMid slice;
      rect {
        width, height: 100%;
        fill: defs pattern { ${ value } }
      }
    `);
      let svg = generate_svg(parsed);
      return create_svg_url(svg);
    }),

    'svg-polygon': lazy((_, ...args) => {
      let commands = args.map(input => get_value(input())).join(',');
      let { rules, points } = generate_shape(commands, 3, 65536, rules => {
        delete rules.frame;
        rules['unit'] = 'none';
        rules['stroke-width'] ??= .01;
        rules['stroke'] ??= 'currentColor';
        rules['fill'] ??= 'none';
        return rules;
      });
      let style = `points: ${points};`;
      let props = '';
      for (let name of Object.keys(rules)) {
        if (/^(stroke|fill|clip|marker|mask|animate|draw)/.test(name)) {
          props += `${name}: ${rules[name]};`;
        }
      }    let parsed = parse$8(`
      viewBox: -1 -1 2 2 p ${Number(rules['stroke-width'])/2};
      polygon {
        ${props} ${style}
      }
    `);
      return create_svg_url(generate_svg(parsed));
    }),

    var() {
      return value => `var(${get_value(value)})`;
    },

    ut() {
      return calc_with(`var(--${utime.name})`);
    },

    uw() {
      return calc_with(`var(--${uwidth.name})`);
    },

    uh() {
      return calc_with(`var(--${uheight.name})`);
    },

    ux() {
      return calc_with(`var(--${umousex.name})`);
    },

    uy() {
      return calc_with(`var(--${umousey.name})`);
    },

    plot({ count, context, extra, position, grid }) {
      let key = 'offset-points' + position;
      let lastExtra = last(extra);
      return (...args) => {
        let commands = args.join(',');
        let [idx = count, _, __, max = grid.count] = lastExtra || [];
        if (!context[key]) {
          let { points } = generate_shape(commands, 1, 65536, rules => {
            delete rules['fill'];
            delete rules['fill-rule'];
            delete rules['frame'];
            rules.points = max;
            return rules;
          });
          context[key] = points;

        }
        return context[key][idx - 1];
      };
    },

    Plot({ count, context, extra, position, grid }) {
      let key = 'Offset-points' + position;
      let lastExtra = last(extra);
      return (...args) => {
        let commands = args.join(',');
        let [idx = count, _, __, max = grid.count] = lastExtra || [];
        if (!context[key]) {
          let { points } = generate_shape(commands, 1, 65536, rules => {
            delete rules['fill'];
            delete rules['fill-rule'];
            delete rules['frame'];
            rules.points = max;
            rules.unit = rules.unit || 'none';
            return rules;
          });
          context[key] = points;
        }
        return context[key][idx - 1];
      };
    },

    shape() {
      return memo('shape-function', (...args) => {
        let commands = args.join(',');
        let { points } = generate_shape(commands);
        return `polygon(${points.join(',')})`;
      });
    },

    doodle() {
      return value => value;
    },

    shaders() {
      return value => value;
    },

    pattern() {
      return value => value;
    },

    invert() {
      return commands => {
        let parsed = parse$4(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'v': return 'h' + value.join(' ');
            case 'V': return 'H' + value.join(' ');
            case 'h': return 'v' + value.join(' ');
            case 'H': return 'V' + value.join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flipH() {
      return commands => {
        let parsed = parse$4(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'h':
            case 'H': return name + value.map(flip_value).join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flipV() {
      return commands => {
        let parsed = parse$4(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'v':
            case 'V': return name + value.map(flip_value).join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flip(...args) {
      let flipH = Expose.flipH(...args);
      let flipV = Expose.flipV(...args);
      return commands => {
        return flipV(flipH(commands));
      }
    },

    reverse() {
      return (...args) => {
        let commands = args.map(get_value);
        let parsed = parse$4(commands.join(','));
        if (parsed.valid) {
          let result = [];
          for (let i = parsed.commands.length - 1; i >= 0; --i) {
            let { name, value } = parsed.commands[i];
            result.push(name + value.join(' '));
          }
          return result.join(' ');
        }
        return commands.reverse();
      }
    },

    cycle() {
      return (...args) => {
        args = args.map(n => '<' + n + '>');
        let list = [];
        let separator;
        if (args.length == 1) {
          separator = ' ';        list = parse$9(args[0], { symbol: separator });
        } else {
          separator = ',';
          list = parse$9(args.map(get_value).join(separator), { symbol: separator});
        }
        list = list.map(n => n.replace(/^\<|>$/g,''));
        let size = list.length - 1;
        let result = [list.join(separator)];
        // Just ignore the performance
        for (let i = 0; i < size; ++i) {
          let item = list.shift();
          list.push(item);
          result.push(list.join(separator));
        }
        return result;
      }
    },

    mirror() {
      return (...args) => {
        for (let i = args.length - 1; i >= 0; --i) {
          args.push(args[i]);
        }
        return args;
      }
    },

    Mirror() {
      return (...args) => {
        for (let i = args.length - 2; i >= 0; --i) {
          args.push(args[i]);
        }
        return args;
      }
    },

    code() {
      return (...args) => {
        return args.map(code => String.fromCharCode(code));
      }
    },

    once: lazy(({context, extra, position}, ...args) => {
      let counter = 'once-counter' + position;
      if (is_nil(context[counter])) {
        return context[counter] = args.map(input => get_value(input())).join(',');
      }
      return context[counter];
    }),

    raw({ rules }) {
      return (raw = '') => {
        try {
          let cut = raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")'));
          if (raw.startsWith('${doodle') && raw.endsWith('}')) {
            let key = raw.substring(2, raw.length - 1);
            let doodles = rules.doodles;
            if (doodles && doodles[key]) {
              return `<css-doodle>${doodles[key].doodle}</css-doodle>`
            }
          }
          if (raw.startsWith('url("data:image/svg+xml;utf8')) {
            return decodeURIComponent(cut);
          }
          /* future forms */
          if (raw.startsWith('url("data:image/svg+xml;base64')) {
            return atob(cut);
          }
          if (raw.startsWith('url("data:image/png;base64')) {
            return `<img src="${raw}" alt="" />`;
          }
        } catch (e) {
          /* ignore */
        }
        return raw;
      }
    }

  }, {

    'index': 'i',
    'col': 'x',
    'row': 'y',
    'depth': 'z',
    'rand': 'r',
    'pick': 'p',
    'pn':   'pl',
    'pnr':  'pr',

    // error prone
    'stripes': 'stripe',
    'strip':   'stripe',
    'patern':  'pattern',
    'flipv': 'flipV',
    'fliph': 'flipH',

    // legacy names, keep them before 1.0
    't': 'ut',
    'filter': 'svg-filter',
    'last-rand': 'lr',
    'last-pick': 'lp',
    'multiple': 'm',
    'multi': 'm',
    'rep': 'µ',
    'repeat': 'µ',
    'ms': 'M',
    's':  'I',
    'size': 'I',
    'sx': 'X',
    'size-x': 'X',
    'size-col': 'X',
    'max-col': 'X',
    'sy': 'Y',
    'size-y': 'Y',
    'size-row': 'Y',
    'max-row': 'Y',
    'sz': 'Z',
    'size-z': 'Z',
    'size-depth': 'Z',
    'Svg': 'svg',
    'pick-by-turn': 'pl',
    'pick-n': 'pl',
    'pick-d': 'pd',
    'offset': 'plot',
    'Offset': 'Plot',
    'point': 'plot',
    'Point': 'Plot',
    'unicode': 'code'
  });

  const presets = {
    a0: [ 841, 1189 ],
    a1: [ 594, 841 ],
    a2: [ 420, 594 ],
    a3: [ 297, 420 ],
    a4: [ 210, 297 ],
    a5: [ 148, 210 ],
    a6: [ 105, 148 ],

    b0: [ 1000, 1414 ],
    b1: [ 707, 1000 ],
    b2: [ 500, 707 ],
    b3: [ 353, 500 ],
    b4: [ 250, 353 ],
    b5: [ 176, 250 ],
    b6: [ 125, 176 ],

    c0: [ 917, 1297 ],
    c1: [ 648, 917 ],
    c2: [ 458, 648 ],
    c3: [ 324, 458 ],
    c4: [ 229, 324 ],
    c5: [ 162, 229 ],

    d0: [ 764, 1064 ],
    d1: [ 532, 760 ],
    d2: [ 380, 528 ],
    d3: [ 264, 376 ],
    d4: [ 188, 260 ],
    d5: [ 130, 184 ],
    d6: [ 92, 126 ],

    letter:   [ 216, 279 ],
    postcard: [ 100, 148 ],
    poster:   [ 390, 540 ],
  };

  const modes = {
    portrait: 'p',
    pt: 'p',
    p: 'p',

    landscape: 'l',
    ls: 'l',
    l: 'l',
  };

  const unit = 'mm';

  function get_preset(name, mode) {
    name = String(name).toLowerCase();

    // Default to landscape mode
    let [h, w] = presets[name] || [];

    if (modes[mode] == 'p') {
      [w, h] = [h, w];
    }

    return [w, h].map(n => n + unit);
  }

  function is_preset(name) {
    return !!presets[name];
  }

  let all_props = [];

  function get_props(arg) {
    if (!all_props.length) {
      let props = new Set();
      if (typeof document !== 'undefined') {
        for (let n in document.head.style) {
          if (!n.startsWith('-')) {
            props.add(n.replace(/[A-Z]/g, '-$&').toLowerCase());
          }
        }
      }
      if (!props.has('grid-gap')) {
        props.add('grid-gap');
      }
      all_props = Array.from(props);
    }
    return (arg instanceof RegExp)
      ? all_props.filter(n => arg.test(n))
      : all_props;
  }

  function build_mapping(prefix) {
    let reg = new RegExp(`\\-?${ prefix }\\-?`);
    return get_props(reg)
      .map(n => n.replace(reg, ''))
      .reduce((obj, n) => { return obj[n] = n, obj }, {});
  }

  const props_webkit_mapping = build_mapping('webkit');
  const props_moz_mapping = build_mapping('moz');

  function prefixer(prop, rule) {
    if (props_webkit_mapping[prop]) {
      return `-webkit-${ rule } ${ rule }`;
    }
    else if (props_moz_mapping[prop]) {
      return `-moz-${ rule } ${ rule }`;
    }
    return rule;
  }

  const map_left_right = {
    center: '50%',
    left: '0%', right: '100%',
    top: '50%', bottom: '50%'
  };

  const map_top_bottom = {
    center: '50%',
    top: '0%', bottom: '100%',
    left: '50%', right: '50%',
  };

  var Property = add_alias({

    size(value, { is_special_selector, grid }) {
      let [w, h = w, ratio] = parse$9(value);
      if (is_preset(w)) {
        [w, h] = get_preset(w, h);
      }
      let styles = `
      width: ${w};
      height: ${h};
    `;
      if (w === 'auto' || h === 'auto') {
        if (ratio) {
          if (/^\(.+\)$/.test(ratio)) {
            ratio = ratio.substring(1, ratio.length - 1);
          } else if (!/^calc/.test(ratio)) {
            ratio = `calc(${ratio})`;
          }
          if (!is_special_selector) {
            styles += `aspect-ratio: ${ratio};`;
          }
        }
        if (is_special_selector) {
          styles += `aspect-ratio: ${ratio || grid.ratio};`;
        }
      }
      if (!is_special_selector) {
        styles += `
        --internal-cell-width: ${w};
        --internal-cell-height: ${h};
      `;
      }
      return styles;
    },

    place(value, { extra }) {
      let [left, top = '50%'] = parse$9(value);
      left = map_left_right[left] || left;
      top = map_top_bottom[top] || top;
      const cw = 'var(--internal-cell-width, 25%)';
      const ch = 'var(--internal-cell-height, 25%)';
      return `
      position: absolute;
      left: ${left};
      top: ${top};
      width: ${cw};
      height: ${ch};
      margin-left: calc(${cw} / -2);
      margin-top: calc(${ch} / -2);
      grid-area: unset;
      --plot-angle: ${extra || 0};
      rotate: ${extra || 0}deg;
    `;
    },

    grid(value, options) {
      let result = {
        clip: true,
      };
      if (/no\-*clip/i.test(value)) {
        result.clip = false;
        value = value.replace(/no\-*clip/i, '');
      }
      let groups = parse$9(value, {
        symbol: ['/', '+', '*', '|', '-', '~'],
        noSpace: true,
        verbose: true
      });
      for (let { group, value } of groups) {
        if (group === '+') result.scale = value;
        if (group === '*') result.rotate = value;
        if (group === '~') result.translate = value;
        if (group === '/') {
          if (result.size === undefined) result.size = this.size(value, options);
          else result.fill = value;
        }
        if ((group === '|' || group == '-' || group == '') && !result.grid) {
          result.grid = parse_grid(value, options.max_grid);
          if (group === '|') {
            result.flexColumn = true;
          }
          if (group === '-') {
            result.flexRow = true;
          }
        }
      }
      return result;
    },

    gap(value) {
      return value;
    },

    seed(value) {
      return value;
    },

    shape: memo('shape-property', value => {
      let { points, preset} = generate_shape(value);
      if (!preset) return '';
      let prop = 'clip-path';
      let style = `${prop}: polygon(${points.join(',')});`;
      return prefixer(prop, style);
    }),

    use(rules) {
      if (rules.length > 2) {
        return rules;
      }
    },

    content(value) {
      return value;
    },

  }, {
    // legacy names.
    'place-cell': 'place',
    'offset': 'place',
    'position': 'place',
  });

  /* an +/- b */
  function parse$1(input) {
    let iter = iterator$1(scan(input));
    let a = [], b = [], op, error;
    while (iter.next()) {
      let { prev, curr, next } = iter.get();
      let v = curr.value;
      if (curr.isSymbol()) {
        if (v === '+' || v === '-') {
          op = v;
        } else {
          error = 'Unexpected ' + curr.value;
          break;
        }
      }
      else if (curr.isNumber()) {
        if ((a.length || b.length) && !op) {
          error = 'Syntax error';
          break;
        }
        v = withOp(Number(v), op);
        op = null;
        if (next && next.value === 'n') {
          a.push(v);
          iter.next();
          continue;
        } else {
          b.push(v);
        }
      }
      else if (v === 'n') {
        if ((a.length || b.length) && !op) {
          error = 'Syntax error';
          break;
        }
        a.push(withOp(1, op));
        op = null;
      }
      else if (!curr.isSpace()) {
        error = 'Unexpected ' + v;
        break;
      }
    }
    if (error) {
      return { a: 0, b: 0, error }
    }
    return { a: sum(a), b: sum(b) };
  }

  function withOp(num, op) {
    if (op === '+') return num;
    if (op === '-') return -1 * num;
    return num;
  }

  function sum(list) {
    return list.reduce((a, b) => a + b, 0);
  }

  function odd(n) {
    return n % 2;
  }

  function even(n) {
    return !odd(n);
  }

  function get_selector(offset) {
    let selector = '';
    if (offset == 0) {
      selector = '$:hover';
    }
    else if (offset > 0) {
      selector = `$:hover ${'+*'.repeat(offset)}`;
    }
    else {
      selector = `:has(+ ${'*+'.repeat(Math.abs(offset + 1))} $:hover)`;
    }
    return selector;
  }

  function compare(rule, value) {
    if (rule === 'even') {
      return even(value);
    }
    if (rule === 'odd') {
      return odd(value);
    }
    if (rule == 'n') {
      return true;
    }
    let { a, b, error } = parse$1(rule);
    if (error) {
      return false;
    }
    if (a === 0) {
      return value === b;
    } else {
      let result = (value - b) / a;
      return result >= 0 && Number.isInteger(result);
    }
  }

  var Selector = add_alias({

    at({ x, y }) {
      return (x1, y1) => (x == x1 && y == y1);
    },

    nth({ count, grid }) {
      return (...exprs) => {
        for (let expr of exprs) {
          if (compare(expr, count)) return true;
        }
      }
    },

    y({ y, grid }) {
      return (...exprs) => {
        for (let expr of exprs) {
          if (compare(expr, y)) return true;
        }
      };
    },

    x({ x, grid }) {
      return (...exprs) => {
        for (let expr of exprs) {
          if (compare(expr, x)) return true;
        }
      };
    },

    even({ x, y }) {
      return _ => odd(x + y);
    },

    odd({ x, y}) {
      return _ => even(x + y);
    },

    random({ random, count, x, y, grid }) {
      return (ratio = .5) => {
        if (/\D/.test(ratio)) {
          return random() < calc$1('(' + ratio + ')', {
            x, X: grid.x,
            y, Y: grid.y,
            i: count, I: grid.count,
            random,
          });
        }
        return random() < ratio;
      }
    },

    match({ count, grid, x, y, random }) {
      return expr => {
        return !!calc$1('(' + expr + ')', {
          x, X: grid.x,
          y, Y: grid.y,
          i: count, I: grid.count,
          random,
        });
      }
    },

    hover({ count, x, y, grid, random }) {
      return (...args) => {
        let selectors = [];
        if (!args.length) {
          selectors.push(get_selector(0));
        }
        for (let arg of args) {
          let [dx, dy] = String(arg).split(/\s+/);
          dx = Number(dx);
          dy = Number(dy);
          // @hover(1, 2, 3)
          if (Number.isNaN(dy) && !Number.isNaN(dx)) {
            selectors.push(get_selector(dx));
          }
          // @hover(1 -1, 0 1)
          if (!Number.isNaN(dx) && !Number.isNaN(dy)) {
            let rx = dx + x;
            let ry = dy + y;
            if (rx >= 1 && rx <= grid.x && ry >= 1 && ry <= grid.y) {
              let offset = (dy * grid.y) + dx;
              selectors.push(get_selector(offset));
            }
          }
        }
        if (!selectors.length) {
          return false;
        }
        return {
          selector: selectors.join(',')
        }
      }
    },

  }, {
    col: 'x',
    row: 'y',
  });

  /*
  Copyright 2019 David Bau.
  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:
  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */

  var global = globalThis;
  var math = Math;
  var pool = [];

  //
  // The following constants are related to IEEE 754 limits.
  //

  var width = 256,        // each RC4 output is 0 <= x < 256
      chunks = 6,         // at least six RC4 outputs for each double
      digits = 52,        // there are 52 significant digits in a double
      rngname = 'random', // rngname: name for Math.random and Math.seedrandom
      startdenom = math.pow(width, chunks),
      significance = math.pow(2, digits),
      overflow = significance * 2,
      mask = width - 1,
      nodecrypto;         // node.js crypto module, initialized at the bottom.

  //
  // seedrandom()
  // This is the seedrandom function described above.
  //
  function seedrandom(seed, options, callback) {
    var key = [];
    options = (options == true) ? { entropy: true } : (options || {});

    // Flatten the seed string or build one from local entropy if needed.
    var shortseed = mixkey(flatten(
      options.entropy ? [seed, tostring(pool)] :
      (seed == null) ? autoseed() : seed, 3), key);

    // Use the seed to initialize an ARC4 generator.
    var arc4 = new ARC4(key);

    // This function returns a random double in [0, 1) that contains
    // randomness in every bit of the mantissa of the IEEE 754 value.
    var prng = function() {
      var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
          d = startdenom,                 //   and denominator d = 2 ^ 48.
          x = 0;                          //   and no 'extra last byte'.
      while (n < significance) {          // Fill up all significant digits by
        n = (n + x) * width;              //   shifting numerator and
        d *= width;                       //   denominator and generating a
        x = arc4.g(1);                    //   new least-significant-byte.
      }
      while (n >= overflow) {             // To avoid rounding up, before adding
        n /= 2;                           //   last byte, shift everything
        d /= 2;                           //   right using integer math until
        x >>>= 1;                         //   we have exactly the desired bits.
      }
      return (n + x) / d;                 // Form the number within [0, 1).
    };

    prng.int32 = function() { return arc4.g(4) | 0; };
    prng.quick = function() { return arc4.g(4) / 0x100000000; };
    prng.double = prng;

    // Mix the randomness into accumulated entropy.
    mixkey(tostring(arc4.S), pool);

    // Calling convention: what to return as a function of prng, seed, is_math.
    return (options.pass || callback ||
        function(prng, seed, is_math_call, state) {
          if (state) {
            // Load the arc4 state from the given state if it has an S array.
            if (state.S) { copy(state, arc4); }
            // Only provide the .state method if requested via options.state.
            prng.state = function() { return copy(arc4, {}); };
          }

          // If called as a method of Math (Math.seedrandom()), mutate
          // Math.random because that is how seedrandom.js has worked since v1.0.
          if (is_math_call) { math[rngname] = prng; return seed; }

          // Otherwise, it is a newer calling convention, so return the
          // prng directly.
          else return prng;
        })(
    prng,
    shortseed,
    'global' in options ? options.global : (this == math),
    options.state);
  }

  //
  // ARC4
  //
  // An ARC4 implementation.  The constructor takes a key in the form of
  // an array of at most (width) integers that should be 0 <= x < (width).
  //
  // The g(count) method returns a pseudorandom integer that concatenates
  // the next (count) outputs from ARC4.  Its return value is a number x
  // that is in the range 0 <= x < (width ^ count).
  //
  function ARC4(key) {
    var t, keylen = key.length,
        me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

    // The empty key [] is treated as [0].
    if (!keylen) { key = [keylen++]; }

    // Set up S using the standard key scheduling algorithm.
    while (i < width) {
      s[i] = i++;
    }
    for (i = 0; i < width; i++) {
      s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
      s[j] = t;
    }

    // The "g" method returns the next (count) outputs as one number.
    (me.g = function(count) {
      // Using instance members instead of closure state nearly doubles speed.
      var t, r = 0,
          i = me.i, j = me.j, s = me.S;
      while (count--) {
        t = s[i = mask & (i + 1)];
        r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
      }
      me.i = i; me.j = j;
      return r;
      // For robust unpredictability, the function call below automatically
      // discards an initial batch of values.  This is called RC4-drop[256].
      // See http://google.com/search?q=rsa+fluhrer+response&btnI
    })(width);
  }

  //
  // copy()
  // Copies internal state of ARC4 to or from a plain object.
  //
  function copy(f, t) {
    t.i = f.i;
    t.j = f.j;
    t.S = f.S.slice();
    return t;
  }
  //
  // flatten()
  // Converts an object tree to nested arrays of strings.
  //
  function flatten(obj, depth) {
    var result = [], typ = (typeof obj), prop;
    if (depth && typ == 'object') {
      for (prop in obj) {
        try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
      }
    }
    return (result.length ? result : typ == 'string' ? obj : obj + '\0');
  }

  //
  // mixkey()
  // Mixes a string seed into a key that is an array of integers, and
  // returns a shortened string seed that is equivalent to the result key.
  //
  function mixkey(seed, key) {
    var stringseed = seed + '', smear, j = 0;
    while (j < stringseed.length) {
      key[mask & j] =
        mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
    }
    return tostring(key);
  }

  //
  // autoseed()
  // Returns an object for autoseeding, using window.crypto and Node crypto
  // module if available.
  //
  function autoseed() {
    try {
      var out;
      if (nodecrypto && (out = nodecrypto.randomBytes)) ; else {
        out = new Uint8Array(width);
        (global.crypto || global.msCrypto).getRandomValues(out);
      }
      return tostring(out);
    } catch (e) {
      var browser = global.navigator,
          plugins = browser && browser.plugins;
      return [+new Date, global, plugins, global.screen, tostring(pool)];
    }
  }

  //
  // tostring()
  // Converts an array of charcodes to a string
  //
  function tostring(a) {
    return String.fromCharCode.apply(0, a);
  }

  //
  // When seedrandom.js is loaded, we immediately mix a few bits
  // from the built-in RNG into the entropy pool.  Because we do
  // not want to interfere with deterministic PRNG state later,
  // seedrandom will not call math.random on its own again after
  // initialization.
  //
  mixkey(math.random(), pool);

  function is_host_selector(s) {
    return /^\:(host|doodle)/.test(s);
  }

  function is_parent_selector(s) {
    return /^\:(container|parent)/.test(s);
  }

  function is_special_selector(s) {
    return is_host_selector(s) || is_parent_selector(s);
  }

  function is_pseudo_selecotr(s) {
    return /\:before|\:after/.test(s);
  }

  const MathFunc = {};
  for (let name of Object.getOwnPropertyNames(Math)) {
    MathFunc[name] = () => (...args) => {
      if (typeof Math[name] === 'number') {
        return Math[name];
      }
      args = args.map(n => calc$1(get_value(n)));
      return Math[name](...args);
    };
  }

  class Rules {

    constructor(tokens) {
      this.tokens = tokens;
      this.rules = {};
      this.props = {};
      this.keyframes = {};
      this.grid = null;
      this.seed = null;
      this.is_grid_set = false;
      this.is_gap_set = false;
      this.coords = [];
      this.doodles = {};
      this.pattern = {};
      this.shaders = {};
      this.vars = {};
      this.uniforms = {};
      this.content = {};
      this.reset();
    }

    reset() {
      this.styles = {
        host: '',
        container: '',
        cells: '',
        keyframes: ''
      };
      this.coords = [];
      this.doodles = {};
      this.pattern = {};
      this.shaders = {};
      this.content = {};
      for (let key in this.rules) {
        if (key.startsWith('#c')) {
          delete this.rules[key];
        }
      }
    }

    add_rule(selector, rule) {
      let rules = this.rules[selector];
      if (!rules) {
        rules = this.rules[selector] = [];
      }
      rules.push.apply(rules, make_array(rule));
    }

    pick_func(name) {
      if (name.startsWith('$')) name = 'calc';
      return Expose[name] || MathFunc[name];
    }

    apply_func(fn, coords, args, fname, contextVariable = {}) {
      let _fn = fn(...make_array(coords));
      let input = [];
      args.forEach(arg => {
        let type = typeof arg.value;
        if (!arg.cluster && ((type === 'number' || type === 'string'))) {
          input.push(...parse$9(arg.value, { noSpace: true }));
        }
        else if (typeof arg === 'function') {
          input.push(arg);
        }
        else if (!is_nil(arg.value)) {
          let value = get_value(arg.value);
          input.push(value);
        }
      });
      input = make_array(remove_empty_values(input));
      if (typeof _fn === 'function') {
        if (fname.startsWith('$')) {
          let group = Object.assign({},
            this.vars['host'],
            this.vars['container'],
            this.vars[coords.count],
            contextVariable
          );
          let context = {};
          let unit = '';
          for (let [name, key] of Object.entries(group)) {
            context[name.substr(2)] = key;
          }
          if (fname.length > 1) {
            unit = fname.split('$')[1] ?? '';
          }
          return _fn(input, context) + unit;
        }
        return _fn(...input);
      }
      return _fn;
    }

    compose_aname(...args) {
      return args.join('-');
    }

    compose_selector({ x, y, z}, pseudo = '') {
      return `#${cell_id(x, y, z)}${pseudo}`;
    }

    is_composable(name) {
      return ['doodle', 'shaders', 'pattern'].includes(name);
    }

    read_var(value, coords, contextVariable) {
      let count = coords.count;
      let group = Object.assign({},
        this.vars['host'],
        this.vars['container'],
        this.vars[count],
        contextVariable
      );
      if (group[value] !== undefined) {
        let result = String(group[value]).trim();
        if (result[0] == '(') {
          let last = result[result.length - 1];
          if (last === ')') {
            result = result.substring(1, result.length - 1);
          }
        }
        return result.replace(/;+$/g, '');
      }
      return value;
    }

    compose_argument(argument, coords, extra = [], parent, contextVariable) {
      if (!coords.extra) coords.extra = [];
      coords.extra.push(extra);
      let result = argument.map(arg => {
        if (arg.type === 'text') {
          if (/^\-\-\w/.test(arg.value)) {
            if (parent && parent.name === '@var') {
              return arg.value;
            }
            return this.read_var(arg.value, coords, contextVariable);
          }
          return arg.value;
        }
        else if (arg.type === 'func') {
          let fname = arg.name.substr(1);
          let fn = this.pick_func(fname);
          if (typeof fn === 'function') {
            this.check_uniforms(fname);
            if (this.is_composable(fname)) {
              let value = get_value((arg.arguments[0] || [])[0]);
              let temp;
              if (fname === 'doodle' && /^\d/.test(value)) {
                temp = value;
                value = get_value((val.arguments[1] || [])[0]);
              }
              if (!is_nil(value)) {
                switch (fname) {
                  case 'doodle':
                    return this.compose_doodle(this.inject_variables(value, coords.count), temp);
                  case 'shaders':
                    return this.compose_shaders(value, coords);
                  case 'pattern':
                    return this.compose_pattern(value, coords);
                }
              }
            }
            coords.position = arg.position;
            let args = arg.arguments.map(n => {
              return fn.lazy
                ? (...extra) => this.compose_argument(n, coords, extra, arg, contextVariable)
                : this.compose_argument(n, coords, extra, arg, contextVariable);
            });
            return this.apply_func(fn, coords, args, fname, contextVariable);
          } else {
            return arg.name;
          }
        }
      });

      coords.extra.pop();

      return {
        cluster: argument.cluster,
        value: (result.length >= 2 ? ({ value: result.join('') }) : result[0])
      }
    }

    compose_doodle(doodle, arg) {
      let id = unique_id('doodle');
      this.doodles[id] = { doodle, arg };
      return '${' + id + '}';
    }

    compose_shaders(shader, {x, y, z}) {
      let id = unique_id('shader');
      this.shaders[id] = {
        shader,
        id: '--' + id,
        cell: cell_id(x, y, z)
      };
      return '${' + id + '}';
    }

    compose_pattern(code, {x, y, z}) {
      let id = unique_id('pattern');
      this.pattern[id] = {
        code,
        id: '--' + id,
        cell: cell_id(x, y, z)
      };
      return '${' + id + '}';
    }

    check_uniforms(name) {
      switch (name) {
        case 'ut': case 't': this.uniforms.time = true; break;
        case 'ux': this.uniforms.mousex = true; break;
        case 'uy': this.uniforms.mousey = true; break;
        case 'uw': this.uniforms.width = true; break;
        case 'uh': this.uniforms.height = true; break;
      }
    }

    inject_variables(value, count) {
      let group = Object.assign({},
        this.vars['host'],
        this.vars['container'],
        this.vars[count]
      );
      let variables = [];
      for (let [name, key] of Object.entries(group)) {
        variables.push(`${name}: ${key};`);
      }
      variables = variables.join('');
      if (variables.length) {
        return `:doodle {${variables}}` + value;
      }
      return value;
    }

    compose_variables(variables, coords, result = {}) {
      for (let [name, value] of Object.entries(variables)) {
        result[name] = this.get_composed_value(value, coords, result).value;
      }
      return result;
    }

    compose_value(value, coords, contextVariable = {}) {
      if (!Array.isArray(value)) {
        return {
          value: '',
          extra: '',
        }
      }
      let extra = '';
      let output = value.reduce((result, val) => {
        switch (val.type) {
          case 'text': {
            result += val.value;
            break;
          }
          case 'func': {
            let fname = val.name.substr(1);
            let fn = this.pick_func(fname);
            if (typeof fn === 'function') {
              this.check_uniforms(fname);
              if (this.is_composable(fname)) {
                let value = get_value((val.arguments[0] || [])[0]);
                let temp;
                if (fname === 'doodle') {
                  if (/^\d/.test(value)) {
                    temp = value;
                    value = get_value((val.arguments[1] || [])[0]);
                  }
                }
                if (!is_nil(value)) {
                  switch (fname) {
                    case 'doodle':
                      result += this.compose_doodle(this.inject_variables(value, coords.count), temp); break;
                    case 'shaders':
                      result += this.compose_shaders(value, coords); break;
                    case 'pattern':
                      result += this.compose_pattern(value, coords); break;
                  }
                }
              } else {
                coords.position = val.position;
                if (val.variables) {
                  this.compose_variables(val.variables, coords, contextVariable);
                }
                let args = val.arguments.map(arg => {
                  return fn.lazy
                    ? (...extra) => this.compose_argument(arg, coords, extra, val, contextVariable)
                    : this.compose_argument(arg, coords, [], val, contextVariable);
                });

                let output = this.apply_func(fn, coords, args, fname, contextVariable);
                if (!is_nil(output)) {
                  result += output;
                  if (output.extra) {
                    extra = output.extra;
                  }
                }
              }
            } else {
              result += val.name;
            }
          }
        }
        return result;
      }, '');

      return {
        value: output,
        extra: extra,
      }
    }

    get_composed_value(value, coords, context) {
      let extra, group = [];
      if (Array.isArray(value)) {
        group = value.reduce((ret, v) => {
          let composed = this.compose_value(v, coords, context || {});
          if (composed) {
            if (composed.value) ret.push(composed.value);
            if (composed.extra) extra = composed.extra;
          }
          return ret;
        }, []);
      }
      return {
        extra, group, value: group.join(',')
      }
    }

    add_grid_style({ fill, clip, rotate, scale, translate, flexRow, flexColumn }) {
      if (fill) {
        this.add_rule(':host', `background-color:${fill};`);
      }
      if (!clip) {
        this.add_rule(':host', 'contain:none;');
      }
      if (rotate) {
        this.add_rule(':container', `rotate:${rotate};`);
      }
      if (scale) {
        this.add_rule(':container', `scale:${scale};`);
      }
      if (translate) {
        this.add_rule(':container', `translate:${translate};`);
      }
      if (flexRow) {
        this.add_rule(':container', `display:flex;`);
        this.add_rule('cell', `flex: 1;`);
      }
      if (flexColumn) {
        this.add_rule(':container', `display:flex;flex-direction:column;`);
        this.add_rule('cell', `flex:1;`);
      }
    }

    compose_rule(token, _coords, selector) {
      let coords = Object.assign({}, _coords);
      let prop = token.property;
      if (prop === '@seed') {
        return '';
      }
      let composed = this.get_composed_value(token.value, coords);
      let extra = composed.extra;
      let value = composed.value;

      if (/^animation(\-name)?$/.test(prop)) {
        this.props.has_animation = true;

        if (is_host_selector(selector)) {
          let prefix = utime[prop];
          if (prefix && value) {
            value =  prefix + ',' + value;
          }
        }

        if (coords.count > 1) {
          let { count } = coords;
          switch (prop) {
            case 'animation-name': {
              value = composed.group
                .map(n => this.compose_aname(n, count))
                .join(',');
              break;
            }
            case 'animation': {
              value = composed.group
                .map(n => {
                  let group = (n || '').split(/\s+/);
                  group[0] = this.compose_aname(group[0], count);
                  return group.join(' ');
                })
                .join(',');
            }
          }
        }
      }

      if (prop === 'content') {
        if (!/["']|^none\s?$|^(var|counter|counters|attr|url)\(/.test(value)) {
          value = `'${value}'`;
        }
      }

      if (prop === 'transition') {
        this.props.has_transition = true;
      }

      let rule = `${ prop }: ${ value };`;
      rule = prefixer(prop, rule);

      if (prop === 'width' || prop === 'height') {
        if (!is_special_selector(selector)) {
          rule += `--internal-cell-${ prop }: ${ value };`;
        }
      }

      let is_image = (
        /^(background|background\-image)$/.test(prop) &&
        /\$\{(shader|pattern)/.test(value)
      );
      if (is_image) {
        rule += 'background-size: 100% 100%;';
      }

      if (/^\-\-/.test(prop)) {
        let key = _coords.count;
        if (is_parent_selector(selector)) {
          key = 'container';
        }
        if (is_host_selector(selector)) {
          key = 'host';
        }
        if (!this.vars[key]) {
          this.vars[key] = {};
        }
        this.vars[key][prop] = value;
      }

      if (/^@/.test(prop) && Property[prop.substr(1)]) {
        let name = prop.substr(1);
        let transformed = Property[name](value, {
          is_special_selector: is_special_selector(selector),
          grid: coords.grid,
          max_grid: coords.max_grid,
          extra
        });
        switch (name) {
          case 'grid': {
            if (is_host_selector(selector)) {
              rule = transformed.size || '';
              this.add_grid_style(transformed);
            } else {
              rule = '';
              if (!this.is_grid_set) {
                transformed = Property[name](value, {
                  is_special_selector: true,
                  grid: coords.grid,
                  max_grid: coords.max_grid
                });
                this.add_rule(':host', transformed.size || '');
                this.add_grid_style(transformed);
              }
            }
            this.grid = coords.grid;
            this.is_grid_set = true;
            break;
          }
          case 'gap': {
            rule = '';
            if (!this.is_gap_set) {
              this.add_rule(':container', `gap:${transformed};`);
              this.is_gap_set = true;
            }
            break;
          }
          case 'content': {
            rule = '';
            let key = this.compose_selector(coords);
            if (transformed !== undefined && !is_pseudo_selecotr(selector) && !is_parent_selector(selector)) {
              this.content[key] = remove_quotes(String(transformed));
            }
            this.content[key] = Expose.raw({
              rules: {
                doodles: this.doodles
              }
            })(this.content[key] || '');
          }
          case 'seed': {
            rule = '';
            break;
          }
          case 'place-cell':
          case 'place':
          case 'position':
          case 'offset': {
            if (!is_host_selector(selector)) {
              rule = transformed;
            }
            break;
          }
          case 'use': {
            if (token.value.length) {
              this.compose(coords, token.value);
            }
            rule = '';
            break;
          }
          default: {
            rule = transformed;
          }
        }
      }

      return rule;
    }

    get_raw_value(token) {
      let raw = token.raw();
      if (is_nil(raw)){
        raw = '';
      }
      let [_, ...rest] = raw.split(token.property);
      // It's not accurate, will be solved after the rewrite of css parser.
      rest = rest.join(token.property)
        .replace(/^\s*:\s*/, '')
        .replace(/[;}<]$/, '').trim()
        .replace(/[;}<]$/, '');
      return rest;
    }

    pre_compose_rule(token, _coords) {
      let coords = Object.assign({}, _coords);
      let prop = token.property;

      switch (prop) {
        case '@grid': {
          let value = this.get_composed_value(token.value, coords).value;
          let name = prop.substr(1);
          let transformed = Property[name](value, {
            max_grid: _coords.max_grid
          });
          this.grid = transformed.grid;
          break;
        }
        case '@use': {
          if (token.value.length) {
            this.pre_compose(coords, token.value);
          }
          break;
        }
      }
    }

    pre_compose(coords, tokens) {
      if (is_nil(this.seed)) {
  (tokens || this.tokens).forEach(token => {
          if (token.type === 'rule' && token.property === '@seed') {
            this.seed = this.get_raw_value(token);
          }
          if (token.type === 'pseudo' && is_host_selector(token.selector)) {
            for (let t of make_array(token.styles)) {
              if (t.type === 'rule' && t.property === '@seed') {
                this.seed = this.get_raw_value(t);
              }
            }
          }
        });
        if (is_nil(this.seed)) ; else {
          coords.update_random(this.seed);
        }
      }
  (tokens || this.tokens).forEach(token => {
        switch (token.type) {
          case 'rule': {
            this.pre_compose_rule(token, coords);
            break;
          }
          case 'pseudo': {
            if (is_host_selector(token.selector)) {
              (token.styles || []).forEach(token => {
                this.pre_compose_rule(token, coords);
              });
            }
            break;
          }
        }
      });
    }

    compose(coords, tokens, initial) {
      this.coords.push(coords);
      (tokens || this.tokens).forEach((token, i) => {
        if (token.skip) return false;
        if (initial && this.grid) return false;

        switch (token.type) {
          case 'rule': {
            this.add_rule(
              this.compose_selector(coords),
              this.compose_rule(token, coords)
            );
            break;
          }

          case 'pseudo': {
            if (token.selector.startsWith(':doodle')) {
              token.selector = token.selector.replace(/^\:+doodle/, ':host');
            }
            let special = is_special_selector(token.selector);
            if (special) {
              token.skip = true;
            }
            token.selector.split(',').forEach(selector => {
              let pseudo = token.styles.map(s =>
                this.compose_rule(s, coords, selector)
              );
              let composed = special
                ? selector
                : this.compose_selector(coords, selector);
              this.add_rule(composed, pseudo);
            });

            break;
          }

          case 'cond': {
            let name = token.name.substr(1);
            let fn = Selector[name];
            if (fn) {
              let args = token.arguments.map(arg => {
                return this.compose_argument(arg, coords);
              });
              let cond = this.apply_func(fn, coords, args, name);
              if (Array.isArray(token.addition)) {
                for (let c of token.addition) {
                  if (c === 'not') cond = !cond;
                }
              }
              if (cond) {
                if (cond.selector) {
                  token.styles.forEach(_token => {
                    if (_token.type === 'rule') {
                      this.add_rule(
                        cond.selector.replaceAll('$', this.compose_selector(coords)),
                        this.compose_rule(_token, coords)
                      );
                    }
                    if (_token.type === 'pseudo') {
                      _token.selector.split(',').forEach(selector => {
                        let pseudo = _token.styles.map(s =>
                          this.compose_rule(s, coords, selector)
                        );
                        this.add_rule(
                          (cond.selector + selector).replaceAll('$', this.compose_selector(coords)),
                          pseudo
                        );
                      });
                    }
                  });
                } else {
                  this.compose(coords, token.styles);
                }
              }
            }
            break;
          }

          case 'keyframes': {
            if (!this.keyframes[token.name]) {
              this.keyframes[token.name] = coords => `
              ${join(token.steps.map(step =>  `
                ${this.get_composed_value(step.name, coords).value} {
                  ${join(step.styles.map(s => this.compose_rule(s, coords)))}
                }
              `))}
            `;
            }
          }
        }
      });
    }

    output() {
      for (let [selector, rule] of Object.entries(this.rules)) {
        if (is_parent_selector(selector)) {
          this.styles.container += `grid {${join(rule)}}`;
        } else {
          let target = is_host_selector(selector) ? 'host' : 'cells';
          let value = join(rule).trim();
          if (value.length) {
            let name = (target === 'host') ? `${selector},.host` : selector;
            this.styles[target] += `${name} {${value}}`;
          }
        }
      }

      if (this.uniforms.time) {
        this.styles.container += `
        :host,.host {
          animation: ${utime.animation};
        }
      `;
        this.styles.keyframes += `
       @keyframes ${utime['animation-name']} {
         from {--${utime.name }:0}
         to {--${utime.name}:${utime['animation-duration'] / 10 }}
       }
      `;
      }

      this.coords.forEach((coords, i) => {
        for (let [name, keyframe] of Object.entries(this.keyframes)) {
          let aname = this.compose_aname(name, coords.count);
          this.styles.keyframes += `
          ${ i === 0 ? `@keyframes ${name} {${keyframe(coords)}}` : ''}
          @keyframes ${aname} {${keyframe(coords)}}
        `;
        }
      });

      let { keyframes, host, container, cells } = this.styles;
      let main = keyframes + host + container;

      return {
        props: this.props,
        styles: { main, cells, all: main + cells },
        grid: this.grid,
        seed: this.seed,
        random: this.random,
        doodles: this.doodles,
        shaders: this.shaders,
        pattern: this.pattern,
        uniforms: this.uniforms,
        content: this.content,
      }
    }

  }

  function remove_quotes(input) {
    let remove = (input.startsWith('"') && input.endsWith('"'))
      || (input.startsWith("'") && input.endsWith("'"));
    if (remove) {
      return input.substring(1, input.length - 1);
    }
    return input;
  }

  function generate_css(tokens, grid_size, seed_value, max_grid, seed_random) {
    let rules = new Rules(tokens);
    let random = seed_random || seedrandom(String(seed_value));
    let context = {};

    function update_random(seed) {
      random = seedrandom(String(seed));
    }

    function rand(start = 0, end) {
      if (arguments.length == 1) {
        [start, end] = [0, start];
      }
      return lerp(random(), start, end);
    }

    function pick(...items) {
      let args = items.reduce((acc, n) => acc.concat(n), []);
      return args[~~(random() * args.length)];
    }

    function shuffle(arr) {
      let ret = [...arr];
      let m = arr.length;
      while (m) {
        let i = ~~(random() * m--);
        let t = ret[m];
        ret[m] = ret[i];
        ret[i] = t;
      }
      return ret;
    }

    rules.pre_compose({
      x: 1, y: 1, z: 1, count: 1, context: {},
      grid: { x: 1, y: 1, z: 1, count: 1 },
      random, rand, pick, shuffle,
      max_grid, update_random,
      seed_value,
      rules,
    });

    let { grid, seed } = rules.output();

    if (grid) {
      grid_size = grid;
    }

    if (seed) {
      seed = String(seed);
      random = seedrandom(seed);
    } else {
      seed = seed_value;
    }

    if (is_nil(seed)) {
      seed = Date.now();
      random = seedrandom(seed);
    }

    seed = String(seed);
    rules.seed = seed;
    rules.random = random;
    rules.reset();

    if (grid_size.z == 1) {
      for (let y = 1, count = 0; y <= grid_size.y; ++y) {
        for (let x = 1; x <= grid_size.x; ++x) {
          rules.compose({
            x, y, z: 1,
            count: ++count, grid: grid_size, context,
            rand, pick, shuffle,
            random, seed,
            max_grid,
            rules,
          });
        }
      }
    }
    else {
      for (let z = 1, count = 0; z <= grid_size.z; ++z) {
        rules.compose({
          x: 1, y: 1, z,
          count: ++count, grid: grid_size, context,
          rand, pick, shuffle,
          random, seed,
          max_grid,
          rules,
        });
      }
    }

    return rules.output();
  }

  function create_shader(gl, type, source) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  function create_program(gl, vss, fss) {
    let vs = create_shader(gl, gl.VERTEX_SHADER, vss);
    let fs = create_shader(gl, gl.FRAGMENT_SHADER, fss);
    let prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Link failed: ' + gl.getProgramInfoLog(prog));
      console.warn('vs info-log: ' + gl.getShaderInfoLog(vs));
      console.warn('fs info-log: ' + gl.getShaderInfoLog(fs));
    }
    return prog;
  }

  function add_uniform(fragment, uniform) {
    if (!fragment.includes(uniform)) {
      return uniform + '\n' + fragment;
    }
    return fragment;
  }

  const fragment_head = `#version 300 es
  precision highp float;
  out vec4 FragColor;
`;

  const default_vertex_shader = `#version 300 es
  in vec4 position;
  void main() {
    gl_Position = position;
  }
`;

  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
  function load_texture(gl, image, i) {
    const texture = gl.createTexture();
    gl.activeTexture(gl['TEXTURE' + i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  function draw_shader(shaders, seed) {
    let result = Cache.get(shaders);
    if (result) {
      return Promise.resolve(result);
    }
    let canvas = document.createElement('canvas');
    let ratio = devicePixelRatio || 1;
    let width = canvas.width = shaders.width * ratio;
    let height = canvas.height = shaders.height * ratio;
    let texture_list = [];

    let gl = canvas.getContext('webgl2', {preserveDrawingBuffer: true});
    if (!gl) return Promise.resolve('');

    // resolution uniform
    let fragment = add_uniform(shaders.fragment || '', 'uniform vec2 u_resolution;');

    fragment = add_uniform(fragment, 'uniform float u_time;');
    fragment = add_uniform(fragment, 'uniform float u_timeDelta;');
    fragment = add_uniform(fragment, 'uniform int u_frameIndex;');
    fragment = add_uniform(fragment, 'uniform vec2 u_seed;');
    // fragment = add_uniform(fragment, 'uniform vec4 u_mouse;');

    // texture uniform
    shaders.textures.forEach(n => {
      let uniform = `uniform sampler2D ${n.name};`;
      fragment = add_uniform(fragment, uniform);
    });

    const isShaderToyFragment = /(^|[^\w\_])void\s+mainImage\(\s*out\s+vec4\s+fragColor,\s*in\s+vec2\s+fragCoord\s*\)/mg.test(fragment);

    // https://www.shadertoy.com/howto
    if (isShaderToyFragment) {
      fragment = `
#define iResolution vec3(u_resolution, 0)
#define iTime u_time
#define iTimeDelta u_timeDelta
#define iFrame u_frameIndex

${shaders.textures.map((n, i) => `#define iChannel${i} ${n.name}`).join('\n')}

${fragment}

void main() {
  mainImage(FragColor, gl_FragCoord.xy);
}`;
    }

    let program = create_program(
      gl,
      shaders.vertex || default_vertex_shader,
      fragment_head + fragment
    );

    // position in vertex shader
    let positionAttributeLocation = gl.getAttribLocation(program, 'position');
    let positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    let vertices = [-1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    const getUniform = name => gl.getUniformLocation(program, name);

    // resolve uniforms
    const uResolutionLoc = getUniform('u_resolution');
    gl.uniform2fv(uResolutionLoc, [width, height]);

    shaders.textures.forEach((n, i) => {
      texture_list.push(load_texture(gl, n.value, i));
      gl.uniform1i(gl.getUniformLocation(program, n.name), i);
    });

    // vec2 u_seed, u_seed.x = hash(doodle.seed) / 1e16, u_seed.y = Math.random()
    const uSeed = getUniform('u_seed');
    if (uSeed) {
      gl.uniform2f(uSeed, hash(seed) / 1e16, Math.random());
    }

    // resolve image data in 72dpi :(
    const uTimeLoc = getUniform('u_time');
    const uFrameLoc = getUniform('u_frameIndex');
    const uTimeDelta = getUniform('u_timeDelta');
    if (uTimeLoc || uTimeDelta || uFrameLoc) {
      let frameIndex = 0;
      let currentTime = 0;
      return Promise.resolve(Cache.set(shaders, (t, w, h, textures) => {
        gl.clear(gl.COLOR_BUFFER_BIT);
        // update textures and resolutions
        if (shaders.width !== w || shaders.height !== h) {
          textures.forEach((n, i) => {
            gl.bindTexture(gl.TEXTURE_2D, texture_list[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n.value);
          });
          shaders.width = w;
          shaders.height = h;
          canvas.width = w * ratio;
          canvas.height = h * ratio;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2fv(uResolutionLoc, [canvas.width, canvas.height]);
        }

        if (uTimeLoc) gl.uniform1f(uTimeLoc, t / 1000);
        if (uFrameLoc) gl.uniform1i(uFrameLoc, frameIndex++);
        if (uTimeDelta) {
          gl.uniform1f(uTimeDelta, (currentTime - t) / 1000);
          currentTime = t;
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return canvas.toDataURL();
      }));
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return Promise.resolve(Cache.set(shaders, canvas.toDataURL()));
    }
  }

  function readStatement(iter, token) {
    let fragment = [];
    while (iter.next()) {
      let { curr, next } = iter.get();
      let isStatementBreak = !next || curr.isSymbol(';') || next.isSymbol('}');
      fragment.push(curr);
      if (isStatementBreak) {
        break;
      }
    }
    if (fragment.length) {
      token.value = joinToken(fragment);
    }
    return token;
  }

  function walk(iter, parentToken) {
    let rules = [];
    let fragment = [];
    let tokenType = parentToken && parentToken.type || '';
    let stack = [];

    while (iter.next()) {
      let { prev, curr, next } = iter.get();
      let isBlockBreak = !next || curr.isSymbol('}');
      if (tokenType === 'block' && isBlockBreak) {
        if (!next && rules.length && !curr.isSymbol('}')) {
          rules[rules.length - 1].value += (';' + curr.value);
        }
        parentToken.value = rules;
        break;
      }
      else if (curr.isSymbol('{') && fragment.length && !stack.length) {
        let selectors = parseSelector(fragment);
        if (!selectors.length) {
          continue;
        }
        let block = walk(iter, {
          type: 'block',
          name: 'unkown',
          value: []
        });

        selectors.forEach(selector => {
          let newBlock = Object.assign({}, block, {
            name: selector.name,
            args: selector.args
          });
          rules.push(newBlock);
        });
        fragment = [];
      }
      else if (curr.isSymbol(':') && fragment.length && !stack.length) {
        let prop = joinToken(fragment);
        rules.push(readStatement(iter, {
          type: 'statement',
          name: prop,
          value: ''
        }));
        if (tokenType == 'block') {
          parentToken.value = rules;
        }
        fragment = [];
      }
      else if (curr.isSymbol(';')) {
        if (rules.length && fragment.length) {
          rules[rules.length - 1].value += (';' + joinToken(fragment));
          fragment = [];
        }
      } else {
        if (curr.isSymbol('(')) {
          stack.push(curr);
        }
        if (curr.isSymbol(')')) {
          stack.pop();
        }
        fragment.push(curr);
      }
    }

    if (rules.length && tokenType == 'block') {
      parentToken.value = rules;
    }
    return tokenType ? parentToken : rules;
  }

  function joinToken(tokens) {
    return tokens
      .filter((token, i) => {
        if (token.isSymbol(';') && i === tokens.length - 1) return false;
        return true;
      })
      .map(n => n.value).join('');
  }

  function parseSelector(tokens) {
    let iter = iterator$1(tokens);
    let groups = [];
    let selectorName = '';
    let args = [];
    let fragments = [];
    let stack = [];
    while (iter.next()) {
      let { curr, next } = iter.get();
      if (!selectorName.length && curr.isWord()) {
        selectorName = curr.value;
      }
      else if (curr.isSymbol('(')) {
        if (stack.length) {
          fragments.push(curr.value);
        }
        stack.push(curr);
      }
      else if (curr.isSymbol(')')) {
        stack.pop();
        if (stack.length) {
          fragments.push(curr.value);
        } else if (fragments.length) {
          args.push(fragments.join(''));
          fragments = [];
        }
      }
      else if (curr.isSymbol(',')) {
        if (stack.length) {
          args.push(fragments.join(''));
          fragments = [];
        } else {
          if (fragments.length) {
            args.push(fragments.join(''));
            fragments = [];
          }
          if (selectorName) {
            groups.push({
              name: selectorName,
              args
            });
            selectorName = '';
            args = [];
            fragments = [];
          }
        }
      }
      else {
        fragments.push(curr.value);
      }
    }

    if (selectorName) {
      groups.push({
        name: selectorName,
        args
      });
    }

    return groups.filter((v, i, self) => {
      let idx = self.findIndex(n => {
        return (n.name === v.name && v.args.join('') == n.args.join(''));
      });
      return idx === i;
    });
  }

  function parse(source) {
    let iter = iterator$1(scan(source));
    let tokens = walk(iter);
    return tokens;
  }

  function generate_shader(input, {x, y}) {
    return `
    vec3 mapping(vec2 uv, vec2 grid) {
      vec2 _grid = 1.0/grid;
      float x = ceil(uv.x/_grid.x);
      float y = ceil(grid.y - uv.y/_grid.y);
      float i = x + (y - 1.0) * y;
      return vec3(x, y, i);
    }
    vec4 getColor(float x, float y, float i, float I, float X, float Y, float t) {
      vec4 color = vec4(0, 0, 0, 0);
      ${input}
      return color;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy/u_resolution.xy;
      vec2 v = vec2(${x}, ${y});
      vec3 p = mapping(uv, v);
      FragColor = getColor(p.x, p.y, p.z, v.x * v.y, v.x, v.y, u_time);
    }
  `;
  }

  function generate_statement(token, extra) {
    if (token.name === 'fill') {
      let {r, g, b, a} = extra.get_rgba_color(token.value);
      return {
        type: 'statement',
        value: `\ncolor = vec4(${float(r/255)}, ${float(g/255)}, ${float(b/255)}, ${float(a)});\n`,
      }
    }
    if (token.name == 'grid') {
      return {
        type: 'grid',
        value: token.value,
      }
    }
    return {
      type: 'statement',
      value: ''
    }
  }

  function generate_block(token, extra) {
    if (token.name === 'match') {
      let cond = token.args[0];
      let values = [];
      token.value.forEach(t => {
        let statement = generate_statement(t, extra);
        if (statement.type == 'statement') {
          values.push(statement.value);
        }
      });
      return `
      if (${cond}) {
        ${values.join('')}
      }
    `
    }
    return '';
  }

  function float(n) {
    return String(n).includes('.') ? n : n + '.0';
  }

  function draw_pattern(code, extra) {
    let tokens = parse(code);
    let result = [];
    let grid = {x: 1, y: 1};
    tokens.forEach(token => {
      if (token.type === 'statement') {
        let statement = generate_statement(token, extra);
        if (statement.type == 'statement') {
          result.push(statement.value);
        }
        if (statement.type === 'grid') {
          grid = parse_grid(statement.value, Infinity);
        }
      } else if (token.type === 'block') {
        result.push(generate_block(token, extra));
      }
    });
    return generate_shader(result.join(''), grid);
  }

  function svg_to_png(svg, width, height, scale) {
    return new Promise((resolve, reject) => {
      let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
      function action() {
        let img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = source;

        img.onload = () => {
          let canvas = document.createElement('canvas');
          let ctx = canvas.getContext('2d');

          let dpr = devicePixelRatio || 1;
          /* scale with devicePixelRatio only when the scale equals 1 */
          if (scale != 1) {
            dpr = 1;
          }

          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          try {
            canvas.toBlob(blob => {
              resolve({
                blob,
                source,
                url: URL.createObjectURL(blob)
              });
            });
          } catch (e) {
            reject(e);
          }
        };
      }

      if (is_safari()) {
        cache_image(source, action, 200);
      } else {
        action();
      }
    });
  }

  function transform(color) {
    let [r, g, b, a = 1] = color
      .replace(/rgba?\((.+)\)/, (_, v) => v)
      .split(/,\s*/);
    return {r, g, b, a};
  }

  function get_rgba_color(root, value) {
    let element = root.querySelector('style');
    if (!element) {
      return { r: 0, g: 0, b: 0, a: 1 }
    }
    element.style.color = value;
    return transform(getComputedStyle(element).color);
  }

  function get_all_variables(element) {
    if (typeof getComputedStyle === 'undefined') {
      return '';
    }
    let ret = {};
    if (element.computedStyleMap) {
      for (let [prop, value] of element.computedStyleMap()) {
        if (prop.startsWith('--')) {
          ret[prop] = value[0][0];
        }
      }
    } else {
      let styles = getComputedStyle(element);
      for (let prop of styles) {
        if (prop.startsWith('--')) {
          ret[prop] = styles.getPropertyValue(prop);
        }
      }
    }
    return inline(ret);
  }

  function get_variable(element, name) {
    if (typeof getComputedStyle === 'undefined') {
      return '';
    }
    return getComputedStyle(element).getPropertyValue(name)
      .trim()
      .replace(/^\(|\)$/g, '');
  }

  function inline(map) {
    let result = [];
    for (let [prop, value] of Object.entries(map)) {
      result.push(prop + ':' + value);
    }
    return result.join(';');
  }

  const STEP60 = 1000 / 60; // 60fps
  const STEP1 = 1000 / 1;   // 1fps

  function createAnimation(fn) {
    let id;
    let time = 0;
    let lastTime = 0;
    let lastStep = 0;
    let paused = false;
    function loop(stamp) {
      if (!time) time = stamp;
      fn(time);
      let step = (stamp - lastTime);
      if (step < STEP60) step = STEP60;
      if (step > STEP1) step = lastStep || STEP1;
      if (lastTime) time += step;
      lastStep = step;
      lastTime = stamp;
      id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);
    return {
      resume() {
        if (id && paused) {
          paused = false;
          id = requestAnimationFrame(loop);
        }
      },
      pause() {
        if (id) {
          cancelAnimationFrame(id);
          paused = true;
        }
      },
      cancel() {
        if (id) {
          paused = false;
          cancelAnimationFrame(id);
          id = null;
        }
      },
    }
  }

  if (typeof customElements !== 'undefined') {
    class Doodle extends HTMLElement {
      constructor() {
        super();
        this.doodle = this.attachShadow({ mode: 'open' });
        this.animations = [];
        this.extra = {
          get_variable: name => get_variable(this, name),
          get_rgba_color: value => get_rgba_color(this.shadowRoot, value),
        };
      }

      connectedCallback(again) {
        if (this.innerHTML) {
          this.load(again);
        } else {
          setTimeout(() => this.load(again));
        }
      }

      disconnectedCallback() {
        this.cleanup();
      }

      cleanup() {
        Cache.clear();
        for (let animation of this.animations) {
          animation.cancel();
        }
        this.animations = [];
      }

      update(styles) {
        this.cleanup();
        // Use old rules to update
        if (!styles) {
          styles = un_entity(this._innerHTML);
        }
        if (this._innerHTML !== styles) {
          this._innerHTML = styles;
        }
        if (!this.grid_size) {
          this.grid_size = this.get_grid();
        }

        const { x: gx, y: gy, z: gz } = this.grid_size;
        const use = this.get_use();

        let old_content = '';
        let old_styles = '';
        if (this.compiled) {
          old_content = this.compiled.content;
          old_styles = this.compiled.styles.all;
        }

        const compiled = this.generate(parse$7(use + styles, this.extra));

        let grid = compiled.grid || this.get_grid();
        let { x, y, z } = grid;

        let should_rebuild = (
             !this.shadowRoot.innerHTML
          ||  this.shadowRoot.querySelector('css-doodle')
          || (gx !== x || gy !== y || gz !== z)
          || (JSON.stringify(old_content) !== JSON.stringify(compiled.content))
        );

        Object.assign(this.grid_size, grid);

        if (should_rebuild) {
          return compiled.grid
            ? this.build_grid(compiled, grid)
            : this.build_grid(this.generate(parse$7(use + styles, this.extra)), grid);
        }

        let replace = this.replace(compiled);
        if (compiled.props.has_animation) {
          this.set_style(old_styles.replace(/animation/g, 'x'));
          this.reflow();
        }
        this.set_style(replace(
          get_basic_styles(this.grid_size) +
          compiled.styles.all
        ));
      }

      get grid() {
        return Object.assign({}, this.grid_size);
      }

      set grid(grid) {
        this.attr('grid', grid);
        this.connectedCallback(true);
      }

      get seed() {
        return this._seed_value;
      }

      set seed(seed) {
        this.attr('seed', seed);
        this.connectedCallback(true);
      }

      get use() {
        return this.attr('use');
      }

      set use(use) {
        this.attr('use', use);
        this.connectedCallback(true);
      }

      get_max_grid() {
        return this.hasAttribute('experimental') ? 256 : 64;
      }

      get_grid() {
        return parse_grid(this.attr('grid'), this.get_max_grid());
      }

      get_use() {
        let use = String(this.attr('use') || '').trim();
        if (/^var\(/.test(use)) {
          use = `@use:${use};`;
        }
        return use;
      }

      attr(name, value) {
        let len = arguments.length;
        if (len === 1) {
          return this.getAttribute(name);
        }
        if (len === 2) {
          this.setAttribute(name, value);
          return value;
        }
      }

      generate(parsed) {
        let grid = this.get_grid();
        let seed = this.attr('seed') || this.attr('data-seed');
        if (is_nil(seed)) {
          seed = Date.now();
        }
        let compiled = this.compiled = generate_css(
          parsed, grid, seed, this.get_max_grid()
        );
        this._seed_value = compiled.seed;
        this._seed_random = compiled.random;
        return compiled;
      }

      doodle_to_image(code, options, fn) {
        if (typeof options === 'function') {
          fn = options;
          options = null;
        }
        code = ':doodle {width:100%;height:100%}' + code;
        let parsed = parse$7(code, this.extra);
        let _grid = parse_grid('');
        let compiled = generate_css(parsed, _grid, this._seed_value, this.get_max_grid(), this._seed_random);
        let grid = compiled.grid ? compiled.grid : _grid;
        let viewBox = '';
        if (options && options.arg) {
          let v = parse_grid(options.arg, Infinity);
          if (v.x && v.y) {
            options.width = v.x + 'px';
            options.height = v.y + 'px';
            viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
          }
        }

        let replace = this.replace(compiled);
        let grid_container = create_grid(grid, compiled.content);

        let size = (options && options.width && options.height)
          ? `width="${options.width}" height="${options.height}"`
          : '';

        replace(`
        <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
          <foreignObject width="100%" height="100%">
            <div class="host" width="100%" height="100%" ${NSXHtml}>
              <style>
                ${get_basic_styles(grid)}
                ${compiled.styles.all}
              </style>
              ${grid_container}
            </div>
          </foreignObject>
        </svg>
      `).then(result => {
          let source =`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
          if (is_safari()) {
            cache_image(source);
          }
          fn(source);
        });
      }

      pattern_to_image({ code, cell, id }, fn) {
        let shader = draw_pattern(code, this.extra);
        this.shader_to_image({ shader, cell, id }, fn);
      }

      pause() {
        this.setAttribute('cssd-paused', true);
        for (let animation of this.animations) {
          animation.pause();
        }
      }

      resume() {
        this.removeAttribute('cssd-paused');
        for (let animation of this.animations) {
          animation.resume();
        }
      }

      shader_to_image({ shader, cell, id }, fn) {
        const element = this.doodle.getElementById(cell);
        if (!element) {
          return false;
        }
        let { width, height } = element.getBoundingClientRect();
        let ratio = devicePixelRatio || 1;
        let seed = this.seed;
        let parsed = typeof shader === 'string' ? parse$6(shader) : shader;
        parsed.width = width;
        parsed.height = height;

        let sources = parsed.textures;
        let images = [];

        const set_shader_prop = v => {
          element.style.setProperty(id, `url(${v})`);
        };

        const tick = v => {
          if (typeof v === 'function') {
            this.animations.push(createAnimation(t => {
              set_shader_prop(v(t, width, height, images));
            }));
          } else {
            set_shader_prop(v);
          }
        };

        const transform = (sources, fn) => {
          Promise.all(sources.map(({ name, value }) => {
            return new Promise(resolve => {
              this.doodle_to_image(value, {width, height}, src => {
                let img = new Image();
                img.width = width * ratio;
                img.height = width * ratio;
                img.onload = () => resolve({ name, value: img });
                img.src = src;
              });
            });
          })).then(fn);
        };

        if (!element.observer) {
          element.observer = new ResizeObserver(() => {
            let rect = element.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            transform(sources, result => images = result);
          });
          element.observer.observe(element);
        }

        if (sources.length) {
          transform(sources, result => {
            parsed.textures = images = result;
            parsed.width = width;
            parsed.height = height;
            draw_shader(parsed, seed).then(tick).then(fn);
          });
        } else {
          draw_shader(parsed, seed).then(tick).then(fn);
        }
      }

      load(again) {
        this.cleanup();
        let use = this.get_use();
        let parsed = parse$7(use + un_entity(this.innerHTML), this.extra);
        let compiled = this.generate(parsed);

        if (!again) {
          if (this.hasAttribute('click-to-update')) {
            this.addEventListener('click', e => this.update());
          }
        }

        this.grid_size = compiled.grid
          ? compiled.grid
          : this.get_grid();

        this.build_grid(compiled, this.grid_size);
        this._innerHTML = this.innerHTML;
        this.innerHTML = '';
      }

      replace({ doodles, shaders, pattern }) {
        let doodle_ids = Object.keys(doodles);
        let shader_ids = Object.keys(shaders);
        let pattern_ids = Object.keys(pattern);
        let length = doodle_ids.length + shader_ids.length + pattern_ids.length;
        return input => {
          if (!length) {
            return Promise.resolve(input);
          }
          let mappings = [].concat(
            doodle_ids.map(id => {
              if (input.includes(id)) {
                return new Promise(resolve => {
                  let { arg, doodle } = doodles[id];
                  this.doodle_to_image(doodle, { arg }, value => resolve({ id, value }));
                });
              } else {
                return Promise.resolve('');
              }
            }),
            shader_ids.map(id => {
              if (input.includes(id)) {
                return new Promise(resolve => {
                  this.shader_to_image(shaders[id], value => resolve({ id, value }));
                });
              } else {
                return Promise.resolve('');
              }
            }),
            pattern_ids.map(id => {
              if (input.includes(id)) {
                return new Promise(resolve => {
                  this.pattern_to_image(pattern[id], value => resolve({ id, value }));
                });
              } else {
                return Promise.resolve('');
              }
            }),
          );

          return Promise.all(mappings).then(mapping => {
            for (let {id, value} of mapping) {
              /* default to data-uri for doodle and pattern */
              let target = `url(${value})`;
              /* shader uses css vars */
              if (/^shader|^pattern/.test(id)) target = `var(--${id})`;
              input = input.replaceAll('${' + id + '}', target);
            }
            return input;
          });
        }
      }

      reflow() {
        this.shadowRoot.querySelector('grid').offsetWidth;
      }

      build_grid(compiled, grid) {
        const { has_transition, has_animation } = compiled.props;
        let has_delay = (has_transition || has_animation);
        const { uniforms, content, styles } = compiled;

        this.doodle.innerHTML = `
        <style>${get_basic_styles(grid) + styles.main}</style>
        ${create_grid(grid, content)}
      `;
        if (has_delay) {
          this.reflow();
        }
        let replace = this.replace(compiled);
        this.set_style(replace(
          get_basic_styles(grid) +
          styles.all
        ));
        if (uniforms.time) {
          this.register_utime();
        }
        if (uniforms.mousex || uniforms.mousey) {
          this.register_umouse(uniforms);
        } else {
          this.remove_umouse();
        }
        if (uniforms.width || uniforms.height) {
          this.register_usize(uniforms);
        } else {
          this.remove_usize();
        }
      }

      register_umouse(uniforms) {
        if (!this.umouse_fn) {
          this.umouse_fn = e => {
            let data = e.detail || e;
            if (uniforms.mousex) {
              this.style.setProperty('--' + umousex.name, data.offsetX);
            }
            if (uniforms.mousey) {
              this.style.setProperty('--' + umousey.name, data.offsetY);
            }
          };
          this.addEventListener('pointermove', this.umouse_fn);
          let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0}});
          this.dispatchEvent(event);
        }
      }

      remove_umouse() {
        if (this.umouse_fn) {
          this.style.removeProperty('--' + umousex.name);
          this.style.removeProperty('--' + umousey.name);
          this.removeEventListener('pointermove', this.umouse_fn);
          this.umouse_fn = null;
        }
      }

      register_usize(uniforms) {
        if (!this.usize_observer) {
          this.usize_observer = new ResizeObserver(() => {
            let box = this.getBoundingClientRect();
            if (uniforms.width) {
              this.style.setProperty('--' + uwidth.name, box.width);
            }
            if (uniforms.height) {
              this.style.setProperty('--' + uheight.name, box.height);
            }
          });
          this.usize_observer.observe(this);
        }
      }

      remove_usize() {
        if (this.usize_observer) {
          this.style.removeProperty('--' + uwidth.name);
          this.style.removeProperty('--' + uheight.name);
          this.usize_observer.unobserve(this);
          this.usize_observer = null;
        }
      }

      register_utime() {
        if (!this.is_utime_set) {
          try {
            CSS.registerProperty({
              name: '--' + utime.name,
              syntax: '<number>',
              initialValue: 0,
              inherits: true
            });
          } catch (e) {}
          this.is_utime_set = true;
        }
      }

      export({ scale, name, download, detail } = {}) {
        return new Promise((resolve, reject) => {
          let variables = get_all_variables(this);
          let html = this.doodle.innerHTML;

          let { width, height } = this.getBoundingClientRect();
          scale = parseInt(scale) || 1;

          let w = width * scale;
          let h = height * scale;

          let svg = `
          <svg ${NS}
            preserveAspectRatio="none"
            viewBox="0 0 ${width} ${height}"
            ${is_safari() ? '' : `width="${w}px" height="${h}px"`}
          >
            <foreignObject width="100%" height="100%">
              <div class="host" ${NSXHtml} style="width: ${width}px; height: ${height}px">
                <style>.host {${entity(variables)}}</style>
                ${html}
              </div>
            </foreignObject>
          </svg>
        `;

          if (download || detail) {
            svg_to_png(svg, w, h, scale)
              .then(({ source, url, blob }) => {
                resolve({
                  width: w, height: h, svg, blob, source
                });
                if (download) {
                  let a = document.createElement('a');
                  a.download = get_png_name(name);
                  a.href = url;
                  a.click();
                }
              })
              .catch(error => {
                reject(error);
              });
          } else {
            resolve({
              width: w, height: h, svg: svg
            });
          }
        });
      }

      set_style(styles) {
        if (styles instanceof Promise) {
          styles.then(v => {
            this.set_style(v);
          });
        } else {
          const el = this.shadowRoot.querySelector('style');
          el && (el.styleSheet
            ? (el.styleSheet.cssText = styles)
            : (el.innerHTML = styles));
        }
      }
    }
    if (!customElements.get('css-doodle')) {
      customElements.define('css-doodle', Doodle);
    }
  }

  function get_basic_styles(grid) {
    let { x, y } = grid || {};
    return `
    *,*::after,*::before {
      box-sizing: border-box;
    }
    :host,.host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
      contain: content;
      box-sizing: border-box;
      --${utime.name}: 0
    }
    :host([hidden]),[hidden] {
      display: none
    }
    grid {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      ${get_props(/grid/).map(n => `${n}:inherit;`).join('')}
    }
    cell {
      position: relative;
      display: grid;
      place-items: center
    }
    svg {
      position: absolute;
      width: 100%;
      height: 100%
    }
    :host([cssd-paused]),
    :host([cssd-paused]) * {
      animation-play-state: paused !important
    }
    :host, .host {
      grid-template-rows: repeat(${y},1fr);
      grid-template-columns: repeat(${x},1fr)
    }
  `;
  }

  function get_content(input) {
    return is_nil(input) ? '' : input;
  }

  function create_cell(x, y, z, content, child = '') {
    let id = cell_id(x, y, z);
    let head = get_content(content['#' + id]);
    let tail = get_content(child);
    return `<cell id="${id}">${head}${tail}</cell>`;
  }

  function create_grid(grid_obj, content) {
    let { x, y, z } = grid_obj || {};
    let result = '';
    if (z == 1) {
      for (let j = 1; j <= y; ++j) {
        for (let i = 1; i <= x; ++i) {
          result += create_cell(i, j, 1, content);
        }
      }
    }
    else {
      let child = '';
      for (let i = z; i >= 1; i--) {
        let cell = create_cell(1, 1, i, content, child);
        child = cell;
      }
      result = child;
    }
    return `<grid>${result}</grid>`;
  }

})();
