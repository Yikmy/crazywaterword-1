import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

function confirmCapture(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.once('close', () => resolve(false));
    rl.question(question, (answer) => {
      resolve(/^y(es)?$/i.test(answer.trim()));
      rl.close();
    });
  });
}

// Importing this module does not load capture dependencies, register process hooks,
// inspect account files, or change Windows settings. The transaction controller owns
// system changes and recovery; this command only confirms, stores, waits and stops.
export async function runCaptureCli({
  controller = null,
  accountStore = null,
  confirm = confirmCapture,
  write = (line) => console.log(line),
  waitMs = Number(process.env.CW_WAIT_MS ?? 300000),
  pollMs = 250,
  port = Number(process.env.CW_PROXY_PORT ?? 17322),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!Number.isFinite(waitMs) || waitMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0 || !Number.isInteger(port) || port < 1 || port > 65535) {
    write('抓包参数无效；等待时间必须为非负数，代理端口必须有效。');
    return { status: 'failed', reason: 'options' };
  }
  write('本次会临时修改当前用户的根证书信任和系统代理，可能影响使用系统代理的程序。');
  write('捕获结束、超时或失败后由同一事务控制器恢复；未完成的恢复记录会保留，供下次处理。');
  write('仅保存正常账号凭证到受控账号库，不打印凭证，不自动登录游戏。');
  if (!(await confirm('确认开始捕获？[y/N] '))) {
    write('已取消，未启动捕获或修改系统设置。');
    return { status: 'cancelled' };
  }

  // Load the default implementation only after explicit confirmation. Tests inject
  // both dependencies and a clock, so they never reach Windows or the game network.
  try {
    controller ??= await import('../src/capture.mjs');
    accountStore ??= await import('../src/accounts.mjs');
  } catch {
    write('无法加载捕获依赖；捕获尚未启动。');
    return { status: 'failed', reason: 'dependencies' };
  }

  let completion = null;
  let accepting = true;
  let savedId = null;
  let result;
  const onLogin = async (record) => {
    if (!accepting || completion) return savedId ? { id: savedId } : null;
    // All raw frame material stays outside the account store and command output.
    // A complete validated LoginRequest is sufficient for normal authentication.
    try {
      const credential = {
        url: record.url,
        login: structuredClone(record.body),
        source: 'mitm',
        capturedAt: new Date(now()).toISOString(),
      };
      const store = accountStore.loadStore();
      const { account, created } = accountStore.upsertAccount(store, credential);
      accountStore.saveStore(store);
      savedId = account.id;
      completion = { status: 'captured', created: Boolean(created) };
      return { id: savedId };
    } catch {
      completion = { status: 'failed', reason: 'store' };
      throw new Error('账号凭证保存失败');
    }
  };

  try {
    const state = await controller.startCapture({ onLogin, port, keepCa: false });
    if (state.error || state.recoveryPending || state.phase === 'recovery_required' || !state.running) {
      result = state.recoveryPending || state.phase === 'recovery_required' ? { status: 'recovery_required', reason: 'start' } : completion || { status: 'failed', reason: 'start' };
    } else {
      write('捕获已就绪，请在电脑版微信中重新进入《疯狂水世界》。');
      const deadline = now() + waitMs;
      while (!completion && now() < deadline) {
        const current = controller.captureState();
        if (current.error || !current.running) {
          completion = { status: current.recoveryPending ? 'recovery_required' : 'failed', reason: 'capture' };
          break;
        }
        await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
      }
      result = completion || { status: 'timeout' };
    }
  } catch {
    result = completion || { status: 'failed', reason: 'start' };
  } finally {
    accepting = false;
    try {
      const stopped = await controller.stopCapture('CLI 捕获结束');
      if (stopped.recoveryPending || stopped.phase === 'recovery_required' || stopped.running) result = { status: 'recovery_required', reason: 'cleanup' };
    } catch {
      result = { status: 'recovery_required', reason: 'cleanup' };
    }
  }
  if (result.status === 'captured') write('账号凭证已保存到受控账号库，系统设置已恢复；本命令没有登录游戏。');
  else if (result.status === 'timeout') write('等待登录包超时，系统设置已恢复。请检查游戏是否重新进入及是否使用系统代理。');
  else if (result.status === 'recovery_required') write('系统设置恢复尚未完成；事务恢复记录已保留。再次运行捕获前必须完成恢复。');
  else write(result.reason === 'store' ? '账号凭证保存失败，捕获已停止并恢复系统设置。' : '捕获失败，捕获已停止并恢复系统设置。');
  return result;
}

// Recovery is deliberately separate from capture: confirmation precedes loading
// the controller, and only an existing transaction may change system settings.
export async function runRecoveryCli({
  controller = null,
  confirm = confirmCapture,
  write = (line) => console.log(line),
} = {}) {
  write('本次仅恢复已有抓包事务记录中的系统代理，并清理该事务新增的 CA。');
  write('不会启动抓包、安装证书、设置新代理或读取账号凭证。');
  if (!(await confirm('确认恢复已有抓包事务？[y/N] '))) {
    write('已取消恢复，未修改系统设置。');
    return { status: 'cancelled' };
  }
  try { controller ??= await import('../src/capture.mjs'); }
  catch {
    write('无法加载恢复依赖；恢复尚未执行，请保留事务恢复记录。');
    return { status: 'failed', reason: 'dependencies' };
  }
  try {
    const state = await controller.recoverCapture();
    if (state.error || state.running || state.recoveryPending || state.phase === 'recovery_required') {
      write('系统设置恢复尚未完成；请保留事务恢复记录，解决恢复条件后再次执行 --recover。');
      return { status: 'recovery_required', reason: 'recovery' };
    }
    write('已有事务恢复检查完成，当前没有待恢复事务；未启动抓包。');
    return { status: 'recovered' };
  } catch {
    write('系统设置恢复尚未完成；请保留事务恢复记录，解决恢复条件后再次执行 --recover。');
    return { status: 'recovery_required', reason: 'recovery' };
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const run = args.length === 0 ? runCaptureCli : args.length === 1 && args[0] === '--recover' ? runRecoveryCli : null;
  if (!run) {
    console.error('用法: node tools/capture-credentials.mjs [--recover]');
    process.exitCode = 1;
  } else run().then((result) => {
    if (!['captured', 'recovered', 'cancelled'].includes(result.status)) process.exitCode = 1;
  }).catch(() => {
    console.error('捕获或恢复命令异常结束；请检查事务恢复记录。');
    process.exitCode = 1;
  });
}
