import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { parseStageResult, resolveMainlineChallengeSide, MAINLINE_SIDE_AUTHORIZATION } from '../src/stages.mjs';

// Existing offline protocol artifact only. No account store, game client or network.
const protocol = loadProtocol();
const roundtrip = body => protocol.ChallengeStageResponse.decode(protocol.ChallengeStageResponse.encode(body).finish());
const options = side => ({ stage: 41, player: { playerId: 'synthetic-player' }, resolvePlayerSide: () => side });

test('actual protobuf explicitly encoded true and false preserve result presence and stage', () => {
  for (const isLeftWin of [true, false]) {
    const body = roundtrip({ initialData: { mainlineStage: 41 }, stats: { isLeftWin } });
    assert.equal(Object.hasOwn(body.stats, 'isLeftWin'), true);
    assert.equal(body.initialData.mainlineStage, 41);
    assert.equal(parseStageResult(body, options('LEFT')).outcome, isLeftWin ? 'SUCCESS' : 'FAILED');
    assert.equal(parseStageResult(body, options('RIGHT')).outcome, isLeftWin ? 'FAILED' : 'SUCCESS');
  }
});
test('actual protobuf missing optional win flag inherits false but must stay UNKNOWN', () => {
  const body = roundtrip({ initialData: { mainlineStage: 41 }, stats: {} });
  assert.equal(body.stats.isLeftWin, false);
  assert.equal(Object.hasOwn(body.stats, 'isLeftWin'), false);
  assert.throws(() => parseStageResult(body, options('LEFT')), { code: 'UNKNOWN_RESULT' });
});
test('actual protobuf missing or wrong stage cannot be attributed to the pending battle', () => {
  for (const initialData of [{}, { mainlineStage: 42 }]) {
    const body = roundtrip({ initialData, stats: { isLeftWin: true } });
    assert.throws(() => parseStageResult(body, options('LEFT')), { code: 'STAGE_MISMATCH' });
  }
});
test('actual protobuf cannot establish player side from a winner flag alone', () => {
  const body = roundtrip({ initialData: { mainlineStage: 41 }, stats: { isLeftWin: true } });
  assert.throws(() => parseStageResult(body, { stage: 41 }), { code: 'SIDE_UNVERIFIED' });
  assert.throws(() => parseStageResult(body, options(null)), { code: 'SIDE_UNVERIFIED' });
});


test('accepted mainline mapping matches actual BattleType and protobuf preserves its explicit presence', () => {
  assert.equal(protocol.BattleType.BT_MAINLINE, MAINLINE_SIDE_AUTHORIZATION.battleType);
  for (const isLeftWin of [true, false]) {
    const body = roundtrip({ initialData: { mainlineStage: 41, battleType: protocol.BattleType.BT_MAINLINE }, stats: { isLeftWin } });
    assert.equal(Object.hasOwn(body.initialData, 'battleType'), true);
    assert.equal(parseStageResult(body, { stage: 41, resolvePlayerSide: resolveMainlineChallengeSide }).outcome, isLeftWin ? 'SUCCESS' : 'FAILED');
  }
});

test('actual protobuf cannot promote a default battle type or another mode into accepted mainline mapping', () => {
  for (const initialData of [{ mainlineStage: 41 }, { mainlineStage: 41, battleType: protocol.BattleType.BT_ARENA }]) {
    const body = roundtrip({ initialData, stats: { isLeftWin: true } });
    assert.throws(() => parseStageResult(body, { stage: 41, resolvePlayerSide: resolveMainlineChallengeSide }), { code: 'SIDE_UNVERIFIED' });
  }
});
