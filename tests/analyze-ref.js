'use strict';
/* 分析参考图: 尺寸 + 分区色彩 + 结构推断(供 2D 重设计参考) */
const fs = require('fs');
const buf = fs.readFileSync('E:/File/Project/Agents/poker3d/shots/reference.jpg');
let i = 2;
let w = 0, h = 0;
while (i < buf.length) {
  if (buf[i] !== 0xFF) { i++; continue; }
  const marker = buf[i + 1];
  if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
    h = buf.readUInt16BE(i + 5);
    w = buf.readUInt16BE(i + 7);
    break;
  }
  i += 2 + buf.readUInt16BE(i + 2);
}
console.log('size:', w, 'x', h, 'bytes:', buf.length);
