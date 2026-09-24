'use strict';
/* 一次性: GitHub 仓库改名 poker3d -> AgentPoker */
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('missing GITHUB_TOKEN'); process.exit(1); }
(async () => {
  const res = await fetch('https://api.github.com/repos/XYZach/poker3d', {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agentpoker-uploader',
    },
    body: JSON.stringify({ name: 'AgentPoker' }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  if (!res.ok) { console.error('RENAME FAILED', res.status, String(text).slice(0, 400)); process.exit(1); }
  console.log('renamed ok:', data.full_name, '| url:', data.html_url, '| pages:', (data.has_pages ? 'yes' : 'no'));
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
