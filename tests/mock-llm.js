/* 本地 mock OpenAI 兼容接口, 用于端到端测试 LLM 集成
 * 用法: node tests/mock-llm.js  (监听 127.0.0.1:8124)
 * 返回固定格式的决策 JSON, 带 500ms 模拟延迟。
 */
'use strict';
const http = require('http');
let hits = 0;
const server = http.createServer((req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    hits++;
    let action = 'call', amount = 0, reason = 'mock: 按胜率跟注', confidence = 72;
    try {
      const data = JSON.parse(body);
      const sys = data.messages[0].content + '';
      const user = (data.messages[1] || {}).content + '';
      // 简单策略模拟: 胜率高就加注
      const m = user.match(/胜率[^0-9]*(\d+(?:\.\d+)?)%/);
      const winPct = m ? parseFloat(m[1]) : 40;
      if (winPct > 65) { action = 'raise'; amount = 200; reason = 'mock: 胜率' + winPct + '%加注施压'; confidence = 88; }
      else if (winPct < 25) { action = 'fold'; reason = 'mock: 胜率太低弃牌'; confidence = 91; }
      const isCoach = sys.includes('教练');
      if (isCoach) reason = '教练建议: ' + reason;
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ action, amount, reason, confidence }) } }]
        }));
      }, 400);
    } catch (e) {
      res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
      res.end('{}');
    }
  });
});
server.listen(8124, '127.0.0.1', () => console.log('mock LLM on http://127.0.0.1:8124/v1, hits so far: ' + hits));
process.on('SIGTERM', () => server.close());
