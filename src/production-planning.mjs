// Pure projections ported from the existing world/factories reference algorithms.
// Unknown input stays unknown; these results never grant a write or anticipated income.
import { resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
const own=(o,k)=>o!==null&&typeof o==='object'&&Object.hasOwn(o,k);
const id=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
const quantity=value=>safeResourceQuantity(value);
const premiumCost=costs=>costs.some(cost=>['RUBY','钻石','4'].includes(cost.id));
const rows=(config,name)=>Array.isArray(config?.tables?.[name]?.data)?config.tables[name].data:null;
const unknown=reason=>({reliable:false,reason,source:'LOCAL_CONFIGURATION_AND_EXPLICIT_FACTS'});
function unique(values,key){return Array.isArray(values)&&values.every(row=>own(row,key))&&new Set(values.map(row=>row[key])).size===values.length;}
function balance(stock,key){return stock instanceof Map?quantity(stock.has(key)?stock.get(key):0):null;}

// AppointUtil.getAppointEffect: quality base plus per-star contribution.
export function appointEffectValue(effect,hero,star){
 if(!effect||!hero||effect.viewType!=='数值'||!Number.isInteger(hero.qualityIndex)||hero.qualityIndex<1||hero.qualityIndex>4||quantity(star)===null)return null;
 const index=hero.qualityIndex-1,base=effect.heroAdd?.[index],per=effect.starAdd?.[index];
 if(quantity(base)===null||quantity(per)===null)return null;
 const value=quantity(base)+quantity(per)*quantity(star);return Number.isSafeInteger(value)?value:null;
}
export function appointProduceReduce(config,{appointed,heroes,reliable=false}={}){
 const effects=rows(config,'AppointEffectCfg'),positions=rows(config,'AppointPosCfg'),catalog=rows(config,'HeroCfg');
 if(!reliable||!unique(effects,'effectId')||!unique(positions,'posId')||!unique(catalog,'id')||!unique(appointed,'posId')||!unique(appointed,'heroId')||!unique(heroes,'heroId'))return {...unknown('APPOINT_SOURCE_UNKNOWN'),seconds:null,contributions:[]};
 const effect=effects.find(row=>row.effectId==='生产时间');if(!effect)return {...unknown('APPOINT_EFFECT_UNKNOWN'),seconds:null,contributions:[]};
 let seconds=0;const contributions=[];
 for(const slot of appointed){
  if(!Number.isSafeInteger(slot.posId)||slot.posId<1||!id(slot.heroId))return {...unknown('APPOINT_IDENTITY_UNKNOWN'),seconds:null,contributions:[]};
  const position=positions.find(row=>row.posId===slot.posId);if(!position)return {...unknown('APPOINT_POSITION_UNKNOWN'),seconds:null,contributions:[]};
  if(position.effectId!=='生产时间')continue;
  const hero=catalog.find(row=>row.id===slot.heroId),owned=heroes.find(row=>row.heroId===slot.heroId);
  const amount=own(owned,'star')?appointEffectValue(effect,hero,owned.star):null;
  if(amount===null||!Number.isSafeInteger(seconds+amount))return {...unknown('APPOINT_HERO_UNKNOWN'),seconds:null,contributions:[]};
  seconds+=amount;contributions.push({posId:slot.posId,heroId:slot.heroId,star:quantity(owned.star),seconds:amount});
 }
 return {reliable:true,seconds,contributions,source:'AppointInfo.heroes+AllHero.star+AppointEffectCfg/AppointPosCfg/HeroCfg'};
}
export function produceFinalTime(produceTime,reduce,speedUp=0){
 if(quantity(produceTime)===null||quantity(reduce)===null||typeof speedUp!=='number'||!Number.isFinite(speedUp)||speedUp<0)return null;
 const result=Math.ceil(Math.max(0,quantity(produceTime)-quantity(reduce))/(1+speedUp));return Number.isSafeInteger(result)?result:null;
}

export const MATERIAL_PACKS=Object.freeze(['原料自选包','工事材料自选包']);
// Coverage remains a projection. Explicit owned-pack exchange is separately
// authorized by material-packs; confirmed inventory must be surveyed anew.
export function packCoverPlan(config,{costs,stock}={}){
 const table=rows(config,'SelectPackLibCfg');let normalized;
 try{normalized=resourceCosts(costs);}catch{return {...unknown('COST_UNKNOWN'),gaps:[],needs:[],ok:false,executable:false};}
 if(!(stock instanceof Map)||!Array.isArray(table))return {...unknown('PACK_SOURCE_UNKNOWN'),gaps:[],needs:[],ok:false,executable:false};
 const gaps=[],used=new Map();let reliable=true;
 for(const cost of normalized){
  if(premiumCost([cost])){gaps.push({...cost,have:balance(stock,cost.id),gap:null,pack:null,reason:'D6_FORBIDDEN'});continue;}
  const have=balance(stock,cost.id);if(have===null){reliable=false;gaps.push({...cost,have:null,gap:null,reason:'INVENTORY_UNKNOWN'});continue;}
  const gap=Math.max(0,cost.num-have);if(!gap)continue;
  const options=table.filter(row=>row.selectItemId===cost.id&&MATERIAL_PACKS.includes(row.itemId));
  const valid=options.filter(row=>row.type==='道具'&&quantity(row.num)!==null&&quantity(row.num)>0);
  if(options.length!==valid.length||new Set(valid.map(row=>row.itemId)).size!==valid.length){reliable=false;gaps.push({...cost,have,gap,reason:'PACK_CONFIG_AMBIGUOUS'});continue;}
  const row=valid[0];if(!row){gaps.push({...cost,have,gap,pack:null,reason:'NO_ALLOWED_PACK'});continue;}
  const per=quantity(row.num),packs=Math.ceil(gap/per),packHave=balance(stock,row.itemId),total=(used.get(row.itemId)??0)+packs;
  if(packHave===null||!Number.isSafeInteger(packs)||!Number.isSafeInteger(total)||!Number.isSafeInteger(packs*per))reliable=false;else used.set(row.itemId,total);
  gaps.push({...cost,have,gap,pack:row.itemId,per,packs,packHave,projectedGain:Number.isSafeInteger(packs*per)?packs*per:null});
 }
 const needs=[...used].map(([pack,num])=>({pack,num,have:balance(stock,pack)}));
 const ok=reliable&&gaps.length>0&&gaps.every(row=>row.pack)&&needs.every(row=>row.have>=row.num);
 return {reliable,reason:reliable?null:'PACK_FACT_UNKNOWN',gaps,needs,ok,executable:false,source:'SelectPackLibCfg+reliable inventory; existing-material packages only',notes:['仅展示持有包覆盖；预期产物不计入可支出余额。','包领取数量语义与实际效果须另行核验；本投影不构造请求。']};
}

export const CROP_SUPPLY_POLICY=Object.freeze({cropCap:250,seedReserve:8,maxSurplusPerRecipe:3});
export function cropSupplyPlan(config,{stock,buildings,farmsReliable=false,policy=CROP_SUPPLY_POLICY}={}){
 const crops=rows(config,'FarmlandPlantCfg'),recipes=rows(config,'BuildingProduceCfg');
 if(!policy||Object.keys(policy).some(key=>!['cropCap','seedReserve','maxSurplusPerRecipe'].includes(key))||!['cropCap','seedReserve','maxSurplusPerRecipe'].every(key=>Number.isSafeInteger(policy[key])&&policy[key]>=0)||policy.cropCap>1000000||policy.seedReserve>100||policy.maxSurplusPerRecipe>100)throw new TypeError('Invalid finite crop strategy');
 if(!(stock instanceof Map)||!farmsReliable||!Array.isArray(buildings)||!unique(crops,'id')||!Array.isArray(recipes))return {...unknown('CROP_FACT_UNKNOWN'),waterlines:[],seedDemand:[],surplusDemand:[],projectionOnly:true};
 const types=new Set(crops.map(row=>row.id)),uses=new Map([...types].map(key=>[key,0])),normalized=[];
 for(const recipe of recipes){
  let costs;try{costs=resourceCosts(recipe.costItem);}catch{return {...unknown('RECIPE_COST_UNKNOWN'),waterlines:[],seedDemand:[],surplusDemand:[],projectionOnly:true};}
  if(!id(recipe.buildType)||!id(recipe.itemId)||quantity(recipe.unlockLevel)===null)return {...unknown('RECIPE_IDENTITY_UNKNOWN'),waterlines:[],seedDemand:[],surplusDemand:[],projectionOnly:true};
  normalized.push({...recipe,costs});for(const cost of costs)if(types.has(cost.id))uses.set(cost.id,uses.get(cost.id)+1);
 }
 if(new Set(normalized.map(row=>JSON.stringify([row.buildType,row.itemId]))).size!==normalized.length)return {...unknown('RECIPE_DUPLICATE'),waterlines:[],seedDemand:[],surplusDemand:[],projectionOnly:true};
 const waterlines=crops.map(row=>{const count=uses.get(row.id),threshold=count>=6?200:count===5?180:count===4?150:count===3?120:count===2?80:40;return {cropId:row.id,uses:count,target:policy.cropCap===0?null:Math.min(threshold,Math.max(40,policy.cropCap-1)),capDisabled:policy.cropCap===0,source:'USER_STRATEGY_NOT_SERVER_FACT'};});
 const line=key=>waterlines.find(row=>row.cropId===key)?.target;
 const factories=buildings.filter(row=>id(row.type)&&quantity(row.level)!==null&&quantity(row.buildFinishTime)!==null&&row.level>0&&row.buildFinishTime===0);
 const seedFactories=factories.filter(row=>row.type==='种子厂'),plots=buildings.filter(row=>row.type==='农田'&&row.level>0&&row.buildFinishTime===0);
 const seedDemand=[],surplusDemand=[];let reliable=true;
 if(plots.length&&seedFactories.length)for(const crop of crops){
  if(!Array.isArray(crop.material)||crop.material.length!==2||!id(crop.material[0])||quantity(crop.material[1])===null||quantity(crop.material[1])===0){reliable=false;continue;}
  const seed=crop.material[0],cropHave=balance(stock,crop.id),seedHave=balance(stock,seed),recipe=normalized.find(row=>row.buildType==='种子厂'&&row.itemId===seed);
  if(cropHave===null||seedHave===null){reliable=false;continue;}
  const threshold=line(crop.id)??40;
  if(!recipe||premiumCost(recipe.costs)||!seedFactories.some(row=>row.level>=recipe.unlockLevel)||cropHave>=threshold||seedHave>=policy.seedReserve)continue;
  seedDemand.push({cropId:crop.id,itemId:seed,required:policy.seedReserve,have:seedHave,missing:policy.seedReserve-seedHave,urgency:Math.min(0.9,0.9*(threshold-cropHave)/Math.max(1,threshold)),reason:'SEED_RESERVE_BELOW_STRATEGY'});
 }
 for(const recipe of normalized){
  const cropCosts=recipe.costs.filter(row=>types.has(row.id));if(premiumCost(recipe.costs)||!cropCosts.length||!factories.some(row=>row.type===recipe.buildType&&row.level>=recipe.unlockLevel))continue;
  let fits=policy.maxSurplusPerRecipe;
  for(const cost of recipe.costs){const have=balance(stock,cost.id);if(have===null){reliable=false;fits=0;break;}fits=Math.min(fits,Math.floor(have/cost.num));}
  for(const cost of cropCosts){const threshold=line(cost.id),have=balance(stock,cost.id);if(threshold===null||have===null){fits=0;break;}fits=Math.min(fits,Math.floor((have-threshold)/cost.num));}
  if(fits>0)surplusDemand.push({itemId:recipe.itemId,buildType:recipe.buildType,maximumUnits:fits,costs:recipe.costs,reason:'AVAILABLE_SURPLUS_ABOVE_STRATEGY',allowPacks:false});
 }
 return {reliable,reason:reliable?null:'PARTIAL_CROP_INVENTORY',waterlines,seedDemand,surplusDemand,policy:{...policy},projectionOnly:true,source:'FarmlandPlantCfg/BuildingProduceCfg+inventory+explicit strategy',notes:['策略需求不覆盖订单规则；本视图不自动排产、不购买材料、不打开包。']};
}
