import { Plugin } from '@opencode/plugin/tui';
import { For, createSignal } from 'solid-js';
import { loadConfig, DEFAULT_THRESHOLDS } from './config';
import type { RawAppConfig, Thresholds } from './config';
import { formatHeader, formatProviderLines } from './format';
import type { Level } from './format';
import { PROVIDERS } from './providers/index';
import type { ProviderDefinition } from './providers/index';
import type { ProviderId, ProviderResult, ProviderState } from './types';

const PLUGIN_ID = 'ai-signal-light.usage';
/** 与 config.json 的 intervalMinutes 解耦：侧边栏要更新鲜，但也不能打爆配额接口 */
const REFRESH_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/** 重绘「刷新 Xm前」的节拍 */
const TICK_MS = 30 * 1000;
const COMMAND_ID = 'usage.refresh';

interface Snapshot {
  updatedAt: number | null;
  configError: string | null;
  thresholds: Thresholds;
  providers: ProviderState[];
}

const EMPTY_STATE = (definition: ProviderDefinition): ProviderState => ({
  id: definition.id,
  name: definition.name,
  windows: [],
  balance: null,
  error: null,
  lastUpdated: null,
});

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    const [snapshot, updateSnapshot] = context.storage.store<Snapshot>('snapshot', {
      initial: {
        updatedAt: null,
        configError: null,
        thresholds: { ...DEFAULT_THRESHOLDS },
        // 首屏还不知道哪些 provider 被启用，先空着；第一轮刷新后填充
        providers: [],
      },
    });

    // 让「刷新 Xm前」自己走字
    const [now, setNow] = createSignal(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);

    /** 最近一次写入的结果，用于在退避期间保留上一轮的值 */
    let latest: ProviderState[] = [];
    const failures = new Map<ProviderId, number>();
    const backoffUntil = new Map<ProviderId, number>();
    let inFlight: Promise<void> | null = null;

    /** 只处理 config.json 里 enabled === true 的 provider；已启用但没填凭据的仍会渲染成「未配置」 */
    function activeProviders(config: RawAppConfig): ProviderDefinition[] {
      return PROVIDERS.filter((p) => config[p.id]?.enabled === true);
    }

    async function fetchOne(definition: ProviderDefinition, config: RawAppConfig): Promise<ProviderState> {
      try {
        const result: ProviderResult = await definition.fetch(config);
        failures.delete(definition.id);
        backoffUntil.delete(definition.id);
        return {
          id: definition.id,
          name: definition.name,
          windows: result.windows,
          balance: result.balance,
          error: null,
          lastUpdated: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '拉取失败';
        const count = (failures.get(definition.id) ?? 0) + 1;
        failures.set(definition.id, count);
        backoffUntil.set(
          definition.id,
          Date.now() + Math.min(MAX_BACKOFF_MS, REFRESH_MS * 2 ** count),
        );
        return {
          id: definition.id,
          name: definition.name,
          windows: [],
          balance: null,
          error: message,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    /** 单飞：轮询、首次加载、手动刷新共享同一个 in-flight promise */
    function refreshAll(manual = false): Promise<void> {
      if (inFlight) return inFlight;
      const run = async (): Promise<void> => {
        const { config, thresholds, error } = loadConfig();
        const startedAt = Date.now();
        const active = activeProviders(config);
        const due = active.filter((p) => manual || startedAt >= (backoffUntil.get(p.id) ?? 0));

        const settled = await Promise.all(due.map((p) => fetchOne(p, config)));
        const byId = new Map<ProviderId, ProviderState>(settled.map((s) => [s.id, s]));
        // 按注册表顺序输出本轮启用的 provider；退避中没参与本轮的直接沿用上一轮的值
        latest = active.map((p) => byId.get(p.id) ?? latest.find((s) => s.id === p.id) ?? EMPTY_STATE(p));

        await updateSnapshot((draft) => {
          draft.updatedAt = Date.now();
          draft.configError = error;
          draft.thresholds = thresholds;
          draft.providers = latest;
        });
      };

      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }

    const colorFor = (level: Level) => {
      if (level === 'danger') return context.theme.text.feedback.error.base;
      if (level === 'warn') return context.theme.text.feedback.warning.base;
      if (level === 'muted') return context.theme.text.muted;
      return context.theme.text.feedback.success.base;
    };

    const unclaim = context.ui.slot({
      append: 'sidebar.content',
      render: () => (
        <box flexDirection="column">
          <text fg={context.theme.text.base}>{formatHeader(snapshot.updatedAt, now())}</text>
          {snapshot.configError ? (
            <text fg={context.theme.text.feedback.error.base}>{snapshot.configError}</text>
          ) : null}
          <For each={snapshot.providers}>
            {(state) => (
              <For each={formatProviderLines(state, snapshot.thresholds, now())}>
                {(line) => <text fg={colorFor(line.level)}>{line.text}</text>}
              </For>
            )}
          </For>
        </box>
      ),
    });

    const unclaimCommands = context.ui.slot({
      append: 'app',
      render: () => {
        // keymap.layer 必须由「组件」调用（setup 里调用会报 Keymap.Provider is missing）——
        // app 插槽常驻挂载，适合放命令注册。
        context.keymap.layer(() => ({
          mode: 'global',
          commands: [
            {
              id: COMMAND_ID,
              title: '刷新供应商用量',
              description: '立即重新拉取 Kimi / MiniMax / 火山 / DeepSeek / MiMo 用量',
              group: '用量',
              bind: 'ctrl+alt+u',
              palette: true,
              slash: { name: 'usage' },
              run: async () => {
                await refreshAll(true);
                const failed = latest.filter((s) => s.error).length;
                context.ui.toast.show({
                  message: `已刷新 ${latest.length} 家${failed > 0 ? `（${failed} 家失败）` : ''}`,
                  variant: failed > 0 ? 'warning' : 'success',
                  duration: 3000,
                });
              },
            },
          ],
          bindings: [COMMAND_ID],
        }));
        return null;
      },
    });

    void refreshAll();
    const timer = setInterval(() => void refreshAll(), REFRESH_MS);

    return () => {
      clearInterval(timer);
      clearInterval(ticker);
      unclaim();
      unclaimCommands();
    };
  },
});
