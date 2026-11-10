// 只读探测：把日常任务可能用到的信息类请求全部发一遍，看服务端实际返回什么。
// 用法: node tools/probe-dailies.mjs
import { GameClient } from '../src/client.mjs';
import { loadProtocol } from '../src/proto.mjs';

import { createCliOutput, loadCliCredential, cliAccountSelector, isCliEntry } from '../src/cli-safety.mjs';

export async function runDailiesProbe({ selector = cliAccountSelector(), accountStore, output = createCliOutput(), protocolSource = loadProtocol, createClient = (options) => new GameClient(options) } = {}) {
  const { url, login } = loadCliCredential({ selector, output, ...(accountStore ? { accountStore } : {}) });
  const protocol = protocolSource();
  const client = createClient({ url, protocol });
  client.on('warn', (message) => output.log('warn:', message));
  client.on('fatal', (info) => output.log('fatal:', info));
  try {
    const response = await client.connect(login);
    output.log('login ok:', response.playerInfo?.nickname, response.playerInfo?.level);

    const queries = [
      ['ArenaInfoRequest', {}],
      ['ClickGoldInfoRequest', {}],
      ['DiscountShopRequest', {}],
      ['ShopInfoRequest', { type: 1 }],
      ['TrialRaidInfoRequest', { raidId: 1 }],
      ['MuseumInfoRequest', {}],
      ['AllPirateRequest', {}],
      ['GuildCityInfoRequest', {}],
      ['GuildAidListRequest', { type: 0 }],
      ['LeagueInfoRequest', {}],
      ['LeagueReportListRequest', {}],
      ['TradeGuildRadarRequest', {}],
      ['TradeInfoRequest', {}],
      ['CargoShipsRequest', {}],
      ['PassStageStateRequest', {}],
      ['RecruitInfoRequest', {}],
      ['RadarInfoRequest', {}],
      ['CityFortInfoRequest', {}],
      ['WeekInfoRequest', {}],
    ];

    for (const [name, body] of queries) {
      const responseName = `${name.slice(0, -7)}Response`;
      try {
        const result = await client.request(name, body, responseName, 8000);
        const text = output.json(result);
        output.log(`\n=== ${name}`);
        output.log(text.length > 1200 ? `${text.slice(0, 1200)}...` : text);
      } catch (error) {
        output.log(`\n=== ${name} 失败: ${error.message}`);
      }
    }


  } finally { client.stop(); }
}

if (isCliEntry(import.meta.url)) {
  const output = createCliOutput();
  runDailiesProbe({ output }).catch((error) => { output.error(error.message); process.exitCode = 1; });
}
