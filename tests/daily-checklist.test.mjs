import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfig } from '../src/config.mjs';
import { createCodec } from '../src/codec.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { dailyChecklist, formatDailyChecklist } from '../src/daily-checklist.mjs';
import { toSnapshotJson } from '../src/game.mjs';

const config={tables:getConfig().tables},codec=createCodec(loadProtocol()),clone=v=>structuredClone(v);
const typed=(request,body)=>codec.decode(codec.encode(request.replace(/Request$/,'Response'),1,body)).body;
function fixture({snapshot=false}={}) {
  const bodies={DailyTaskInfoRequest:{dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false},{id:1002,progress:1,targetProgress:2,rewardClaimed:false},{id:1010,progress:1,targetProgress:1,rewardClaimed:true}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[1],weeklyRewardClaimed:[],dailyResetTime:1780000000},
    DailyGiftPackRequest:{boughtPack:[],drawnPack:[],resetTime:1780000000,heroId:'合成英雄'}};
  const raw=Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,snapshot?toSnapshotJson(typed(name,body)):typed(name,body)]));
  return {raw,ok:clone(bodies),outcomes:Object.fromEntries(Object.keys(bodies).map(name=>[name,{status:'SUCCESS',updatedAt:'2026-11-12T01:00:00.000Z'}])),failed:{}};
}

test('real local Codec/config project three task states and independent daily/weekly thresholds',()=>{
  for(const snapshot of[false,true]){
    const v=dailyChecklist(fixture({snapshot}),{config});
    assert.equal(v.readOnly,true);assert.deepEqual(v.tasks.counts,{total:3,completed:2,claimed:1,eligible:1});
    assert.deepEqual(v.tasks.rows.map(r=>r.status),['ELIGIBLE','INCOMPLETE','CLAIMED']);
    assert.deepEqual(v.tasks.rows[0].configuredReward,{activity:5,experience:100});
    assert.equal(v.tasks.rows[2].functionId,'pirate-sweep');
    assert.deepEqual(v.activity.daily.tiers.map(r=>r.status),['CLAIMED','ELIGIBLE','INCOMPLETE','INCOMPLETE','INCOMPLETE']);
    assert.ok(v.activity.weekly.tiers.every(r=>r.status==='INCOMPLETE'));
    assert.equal(v.activity.daily.nextAt,60);assert.equal(v.activity.weekly.nextAt,120);
    assert.equal(v.gift.status,'ELIGIBLE');assert.equal(v.gift.heroId,'合成英雄');assert.equal(v.resetMarker,1780000000);
    assert.ok([...v.tasks.rows,...v.activity.daily.tiers,...v.activity.weekly.tiers,v.gift].every(r=>r.executable===false&&!Object.hasOwn(r,'action')));
    assert.equal(v.sources.daily.precision,'DECODED_EXACT');assert.equal(v.sources.daily.observedAt,'2026-11-12T01:00:00.000Z');
  }
});
test('only season-independent configured rewards are displayed; tier five is never guessed',()=>{
  const v=dailyChecklist(fixture(),{config});
  assert.deepEqual(v.activity.daily.tiers[0].configuredRewards,[{id:'加速器',num:120}]);
  assert.equal(v.activity.daily.tiers[4].configuredRewards,null);assert.equal(v.activity.daily.tiers[4].rewardReason,'SEASON_REWARD_AMBIGUOUS');
  assert.deepEqual(v.activity.weekly.tiers[4].configuredRewards,[{id:'橙卡万能碎片',num:10}]);
  assert.deepEqual(v.activity.weekly.tiers[0].configuredRewards,[{id:'藏品券',num:10}]);
});
test('protobuf omitted scalar defaults are unknown, including claimed flags, activity and reset',()=>{
  const s=fixture();s.raw.DailyTaskInfoRequest=typed('DailyTaskInfoRequest',{dailyTask:[{id:1001}]});
  const v=dailyChecklist(s,{config});assert.equal(v.tasks.rows[0].status,'UNKNOWN');assert.equal(v.tasks.counts.eligible,null);assert.equal(v.tasks.counts.completed,null);
  assert.equal(v.activity.daily.activity,null);assert.equal(v.activity.weekly.activity,null);assert.equal(v.activity.daily.complete,null);assert.equal(v.resetMarker,null);
  assert.equal(v.gift.status,'ELIGIBLE');
});
test('actual decoded empty lists are distinct from missing or malformed lists',()=>{
  const s=fixture();s.raw.DailyTaskInfoRequest=typed('DailyTaskInfoRequest',{dailyActivity:0,weeklyActivity:0});
  let v=dailyChecklist(s,{config});assert.deepEqual(v.tasks.counts,{total:0,completed:0,claimed:0,eligible:0});assert.equal(v.activity.daily.activity,0);assert.equal(v.activity.daily.complete,false);
  s.raw.DailyTaskInfoRequest={};v=dailyChecklist(s,{config});assert.equal(v.tasks.counts.total,null);assert.equal(v.activity.daily.tiers[0].eligible,null);
});
for(const[title,change]of[
  ['duplicate task identity',s=>s.raw.DailyTaskInfoRequest.dailyTask.push(s.raw.DailyTaskInfoRequest.dailyTask[0])],
  ['sparse task list',s=>s.raw.DailyTaskInfoRequest.dailyTask=Array(1)],
  ['invalid task ID',s=>s.raw.DailyTaskInfoRequest.dailyTask[0].id=0],
])test(title+' invalidates only the task list',()=>{const s=fixture();change(s);const v=dailyChecklist(s,{config});assert.equal(v.tasks.counts.total,null);assert.equal(v.activity.daily.tiers[1].eligible,true);assert.equal(v.gift.status,'ELIGIBLE');});
test('bad scalar in one task preserves unrelated rows and independent claimed state',()=>{
  for(const mutate of[row=>delete row.progress,row=>row.progress=-1,row=>row.targetProgress=0,row=>delete row.rewardClaimed,row=>row.rewardClaimed=0]){
    const s=fixture();mutate(s.raw.DailyTaskInfoRequest.dailyTask[0]);const v=dailyChecklist(s,{config});assert.equal(v.tasks.rows[0].eligible,null);assert.equal(v.tasks.rows[1].status,'INCOMPLETE');assert.equal(v.tasks.rows[2].status,'CLAIMED');assert.equal(v.tasks.counts.eligible,null);
  }
  const s=fixture();delete s.raw.DailyTaskInfoRequest.dailyTask[2].progress;assert.equal(dailyChecklist(s,{config}).tasks.rows[2].status,'CLAIMED');
});
test('failure or absent current response cannot reuse stale normalized data',()=>{
  for(const mutate of[s=>s.failed.DailyTaskInfoRequest='token=hidden',s=>s.outcomes.DailyTaskInfoRequest.status='FAILED',s=>delete s.outcomes.DailyTaskInfoRequest,s=>delete s.raw.DailyTaskInfoRequest,s=>s.raw.DailyTaskInfoRequest=null]){
    const s=fixture();mutate(s);const v=dailyChecklist(s,{config});assert.equal(v.tasks.counts.total,null);assert.equal(v.activity.daily.activity,null);assert.equal(v.gift.status,'ELIGIBLE');assert.doesNotMatch(JSON.stringify(v),/hidden/);
  }
  const s=fixture();s.failed.DailyGiftPackRequest='hidden';const v=dailyChecklist(s,{config});assert.equal(v.gift.eligible,null);assert.equal(v.tasks.counts.eligible,1);
});
test('legacy snapshot accepts explicit own fields but current raw requires explicit success',()=>{
  const s=fixture(),legacy={ok:s.ok,failed:{}};assert.equal(dailyChecklist(legacy,{config}).tasks.counts.eligible,1);assert.equal(dailyChecklist(legacy,{config}).sources.daily.precision,'LEGACY_NORMALIZED');
  delete s.outcomes;assert.equal(dailyChecklist(s,{config}).tasks.counts.eligible,null);
});
test('inherited fields and accessors never fabricate task, activity or gift facts',()=>{
  const boom=()=>{throw Error('getter must not run');};
  const s=fixture();Object.defineProperty(s.raw.DailyTaskInfoRequest.dailyTask[0],'rewardClaimed',{get:boom,enumerable:true});
  Object.defineProperty(s.raw.DailyTaskInfoRequest,'dailyActivity',{get:boom,enumerable:true});
  Object.defineProperty(s.raw.DailyGiftPackRequest,'drawnPack',{get:boom,enumerable:true});
  const v=dailyChecklist(s,{config});assert.equal(v.tasks.rows[0].eligible,null);assert.equal(v.activity.daily.activity,null);assert.equal(v.gift.eligible,null);
  s.raw.DailyTaskInfoRequest=Object.create(s.ok.DailyTaskInfoRequest);assert.equal(dailyChecklist(s,{config}).tasks.counts.total,null);
  s.outcomes.DailyTaskInfoRequest={get status(){return boom();}};assert.equal(dailyChecklist(s,{config}).sources.daily.status,'UNKNOWN');
});
test('ambiguous threshold or config does not stop independent weekly eligibility',()=>{
  for(const mutate of[c=>delete c.tables.DailyActivityRewardCfg,c=>c.tables.DailyActivityRewardCfg.data.push(clone(c.tables.DailyActivityRewardCfg.data[0]))]){
    const c=clone(config),s=fixture();mutate(c);const v=dailyChecklist(s,{config:c});assert.equal(v.activity.daily.status,'UNKNOWN');assert.equal(v.activity.weekly.status,'AVAILABLE');assert.equal(v.tasks.status,'AVAILABLE');
  }
  const c=clone(config);c.tables.DailyActivityRewardCfg.data.find(r=>r.season===2&&r.id===2).activity=45;
  const v=dailyChecklist(fixture(),{config:c});assert.equal(v.activity.daily.tiers[1].eligible,null);assert.equal(v.activity.daily.tiers[0].status,'CLAIMED');
});
test('duplicate or unrecognized claimed tier cannot appear unclaimed or complete',()=>{
  for(const ids of[[1,1],[999],['1'],Array(1)]){
    const s=fixture();s.raw.DailyTaskInfoRequest.dailyRewardClaimed=ids;const v=dailyChecklist(s,{config});assert.equal(v.activity.daily.complete,null);assert.ok(v.activity.daily.tiers.every(r=>r.claimed===null&&r.eligible===null));assert.equal(v.activity.weekly.status,'AVAILABLE');
  }
});
test('all explicit tiers claimed gives complete, absence of claimed array never does',()=>{
  const s=fixture();s.raw.DailyTaskInfoRequest.dailyRewardClaimed=[1,2,3,4,5];assert.equal(dailyChecklist(s,{config}).activity.daily.complete,true);
  delete s.raw.DailyTaskInfoRequest.dailyRewardClaimed;assert.equal(dailyChecklist(s,{config}).activity.daily.complete,null);
});
test('free gift binds the existing free pack and explicit hero and list, independent of paid packs',()=>{
  const s=fixture();s.raw.DailyGiftPackRequest.drawnPack=['礼包1'];assert.equal(dailyChecklist(s,{config}).gift.eligible,true);
  s.raw.DailyGiftPackRequest.drawnPack=['礼包1','赠礼'];assert.equal(dailyChecklist(s,{config}).gift.status,'CLAIMED');
  for(const change of[g=>delete g.heroId,g=>g.heroId='',g=>g.drawnPack=['赠礼','赠礼'],g=>delete g.drawnPack,g=>g.drawnPack=Array(1)]){
    const copy=fixture();change(copy.raw.DailyGiftPackRequest);const v=dailyChecklist(copy,{config});assert.equal(v.gift.eligible,null);assert.equal(v.tasks.counts.eligible,1);
  }
});
test('configuration defects preserve observed claim eligibility and never invent configured reward',()=>{
  for(const mutate of[c=>delete c.tables.DailyTaskCfg,c=>c.tables.DailyTaskCfg.data.push(clone(c.tables.DailyTaskCfg.data[0])),c=>c.tables.DailyTaskCfg.data[0].exp=-1]){
    const c=clone(config);mutate(c);const v=dailyChecklist(fixture(),{config:c});assert.equal(v.tasks.rows[0].eligible,true);assert.equal(v.tasks.rows[0].configuredReward,null);
  }
  const c=clone(config);c.tables.DailyActivityRewardCfg.data[0].reward=['加速器',-1];assert.equal(dailyChecklist(fixture(),{config:c}).activity.daily.tiers[0].rewardReason,'REWARD_CONFIG_INVALID');
});
test('empty cache stays unknown, formats concise status and never claims live confirmation',()=>{
  const v=dailyChecklist(null,{config});assert.equal(v.tasks.counts.total,null);assert.equal(v.gift.eligible,null);assert.ok(v.activity.daily.tiers.every(r=>r.eligible===null));
  assert.match(formatDailyChecklist(v),/未知/);assert.match(formatDailyChecklist(dailyChecklist(fixture(),{config})),/1 项达到领奖门槛/);
});


test('incomplete season coverage blocks only affected tier threshold and reward',()=>{
  const c=clone(config);c.tables.DailyActivityRewardCfg.data=c.tables.DailyActivityRewardCfg.data.filter(row=>row.id!==5||row.season===1);
  const v=dailyChecklist(fixture(),{config:c});assert.equal(v.activity.daily.tiers[4].eligible,null);assert.equal(v.activity.daily.tiers[4].requiredActivity,null);assert.equal(v.activity.daily.tiers[4].configuredRewards,null);assert.equal(v.activity.daily.tiers[4].rewardReason,'SEASON_CONFIG_INCOMPLETE');assert.equal(v.activity.daily.tiers[1].eligible,true);assert.equal(v.activity.weekly.status,'AVAILABLE');
});
