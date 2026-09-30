import { Plugin } from '@opencode/plugin/tui';
import type { RGBA } from '@opentui/core';
import { For, Switch, Match, createSignal } from 'solid-js';
import { loadConfig, DEFAULT_THRESHOLDS } from './config';
import type { RawAppConfig, Thresholds } from './config';
import { layoutPlan, providerMark, BAR_DOTS, DOT_EMPTY, DOT_FILLED, LABEL_WIDTH } from './layout';
import type { RenderedBlock, LayoutInput, Level } from './layout';
import { clamp } from './format';
import { enabledProviders } from './providers/index';
import type { ProviderDefinition } from './providers/index';
import type { ProviderId, ProviderResult, ProviderState } from './types';

const PLUGIN_ID = 'ai-signal-light.usage';
/** 与 config.json 的 intervalMinutes 解耦：侧边栏要更新鲜，但也不能打爆配额接口 */
const REFRESH_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/** 重绘「刷新 Xm前」的节拍 */
const TICK_MS = 30 * 1000;
const REFRESH_COMMAND_ID = 'usage.refresh';
const TOGGLE_COMMAND_ID = 'usage.toggle';

/**
 * 纵向留白：窗口行不加（`5h / 周 / 月` 属于同一家，紧贴成块）；
 * 每家标题行上方留 1 行空行，于是「家与家之间」自然分隔开。
 * 想更松：PROVIDER_GAP 改 2；想全去掉：两个都改 0。
 */
const WINDOW_GAP = 0;
const PROVIDER_GAP = 1;

/**
 * 供应商名前的竖色条 + 粗体。
 * 色条承担「状态色」（按最紧窗口的档位），粗体承担「这是一组的标题」——
 * 两者叠加才够起眼；去掉色条会失去状态信号，去掉粗体会退回成一堆等重文本行。
 */
const PROVIDER_MARK = '▌';

/**
 * 刷新按钮字形。表头「用量」后面一个，每个 provider 行的右端一个。
 * 它不参与任何列对齐，只是右端的一个可点小格，所以不必像色条那样按显示宽度补齐
 * （`⟳` 属于 East-Asian Ambiguous，换字体会差 1 列，但不影响任何对齐）。
 */
const REFRESH_GLYPH = '⟳';

/** 外框样式，与 `opencode-tokenwatch` 保持一致 */
const BORDER_STYLE = 'rounded';

interface Snapshot {
  updatedAt: number | null;
  configError: string | null;
  thresholds: Thresholds;
  providers: ProviderState[];
  /** 折叠态：整个侧边栏只剩表头一行 */
  collapsed: boolean;
}

const EMPTY_STATE = (definition: ProviderDefinition): ProviderState => ({  id: definition.id,
  name: definition.name,
  windows: [],
  balance: null,
  error: null,
  lastUpdated: null,
});

type HeaderBlock = Extract<RenderedBlock, { kind: 'header' }>;
type ProviderHeadBlock = Extract<RenderedBlock, { kind: 'providerHead' }>;
type BalanceBlock = Extract<RenderedBlock, { kind: 'balance' }>;
type NoteBlock = Extract<RenderedBlock, { kind: 'note' }>;
type WindowBlock = Extract<RenderedBlock, { kind: 'window' }>;

/** 类型收窄用：把联合类型按 kind 缩到具体成员，<Match> 里 TS 才能识别字段 */
function asKind<K extends RenderedBlock['kind']>(
  block: RenderedBlock,
  kind: K,
): Extract<RenderedBlock, { kind: K }> | undefined {
  return block.kind === kind ? (block as Extract<RenderedBlock, { kind: K }>) : undefined;
}

interface BlockViewProps {
  block: RenderedBlock;
  colorFor: (level: Level) => RGBA;
  trackColor: RGBA;
  /** 表头点击 = 折叠 / 展开 */
  onToggle: () => void;
  /** 表头「刷新」按钮点击 = 重新拉取全部 provider */
  onRefresh: () => void;
  /** 单个 provider 行的刷新按钮点击 = 只重拉这一家 */
  onRefreshProvider: (id: ProviderId) => void;
  /** 某个 provider 是否正在刷新（把它的刷新按钮压暗当忙碌指示） */
  isRefreshing: (id: ProviderId) => boolean;
  /** 刷新进行中（把刷新按钮压暗当忙碌指示） */
  refreshing: boolean;
  /** 刷新按钮常态色：中性文字色，不和红/黄/绿状态色抢眼 */
  actionColor: RGBA;
}

/**
 * 点阵进度条。
 *
 * 不用实心背景色，而是画一串圆点，让父盒**裁剪**出可见部分：
 * - 外层 `flexBasis={0} + flexGrow={1}` —— 从 0 开始长到满，**忽略 256 个点的固有宽度**
 * - 内层 `overflow="hidden"` —— 超出部分被裁掉，于是「撑多宽」完全由布局引擎说了算，
 *   不需要知道侧边栏有多宽
 * - 填充层绝对定位 + `width={percent}%`，盖在空槽层上，得到已用部分
 */
function Meter(props: { percent: number; fill: RGBA; empty: RGBA }) {
  return (
    <box flexBasis={0} flexGrow={1} flexShrink={1} height={1} overflow="hidden">
      <box width="100%" height={1} overflow="hidden">
        <text fg={props.empty}>{DOT_EMPTY.repeat(BAR_DOTS)}</text>
      </box>
      <box position="absolute" left={0} top={0} height={1} width={`${clamp(props.percent)}%`} overflow="hidden">
        <text fg={props.fill}>{DOT_FILLED.repeat(BAR_DOTS)}</text>
      </box>
    </box>
  );
}

/**
 * 刷新按钮：一个「空格 + ⟳」的可点小格，表头与每个 provider 行共用。
 * 一律 `stopPropagation()` —— 表头整行是可点的折叠热区，不拦住冒泡的话点刷新会顺手折叠；
 * provider 行没有整行点击，拦一下也无害。
 * 空闲用中性色，忙碌（该 provider 或全局刷新中）时压成 muted 作为指示。
 */
function RefreshCell(props: { active: boolean; mutedColor: RGBA; actionColor: RGBA; onRefresh: () => void }) {
  return (
    <box
      flexShrink={0}
      onMouseDown={(event) => {
        event.stopPropagation();
        props.onRefresh();
      }}
    >
      <text fg={props.active ? props.mutedColor : props.actionColor}>{` ${REFRESH_GLYPH}`}</text>
    </box>
  );
}

/**
 * 把 layout 决策翻译成 yoga 布局。
 *
 * 列宽分工：
 * - 标签 / 百分比 / 倒计时：layout 已按本轮最大位数算好并补齐空格，
 *   这里直接用字符串长度当 box 宽度 → 固定列宽，右边缘连成直线
 * - 进度条：`Meter` 独占剩余空间
 * 空间不够时靠 flexShrink 依次让步（先压进度条，再压倒计时），
 * 标签和百分比永远不被压掉。
 */
function BlockView(props: BlockViewProps) {
  return (
    <Switch>
      {/* 表头：三角 + 「用量」在左，紧随一个「刷新」按钮（⟳），新鲜度被弹性空间推到最右。
          onMouseDown 挂在整行 box 上（而不是里面的 text），
          点击热区才能横跨整行宽度 —— 参照 opencode-tokenwatch 的做法。
          刷新按钮自己再挂一个 onMouseDown 并 stopPropagation，避免点刷新顺带折叠。 */}
      <Match when={asKind(props.block, 'header')}>
        {(b: () => HeaderBlock) => (
          <box flexDirection="row" width="100%" onMouseDown={props.onToggle}>
            <box flexShrink={0}>
              <text fg={props.colorFor(b().collapsed ? 'muted' : 'fresh')}>
                <b>{b().left}</b>
              </text>
            </box>
            {/* 表头刷新按钮：点它只刷新、不折叠（RefreshCell 内部已 stopPropagation） */}
            <RefreshCell
              active={props.refreshing}
              mutedColor={props.colorFor('muted')}
              actionColor={props.actionColor}
              onRefresh={props.onRefresh}
            />
            <box flexGrow={1} />
            <box flexShrink={0}>
              <text fg={props.colorFor('muted')}>{b().right}</text>
            </box>
          </box>
        )}
      </Match>

      {/* provider 标题行：色条 + 粗体名。色条占满 LABEL_WIDTH 宽，
          于是供应商名的左边缘和下面 `5h / 周 / 月` 的左边缘严格对齐。
          右端一个单家刷新按钮（⟳）。 */}
      <Match when={asKind(props.block, 'providerHead')}>
        {(b: () => ProviderHeadBlock) => (
          <box flexDirection="row" width="100%" marginTop={PROVIDER_GAP}>
            <box flexShrink={0} width={LABEL_WIDTH}>
              <text fg={props.colorFor(b().level)}>
                <b>{providerMark(PROVIDER_MARK)}</b>
              </text>
            </box>
            <text fg={props.colorFor(b().level)}>
              <b>{b().name}</b>
            </text>
            <box flexGrow={1} />
            <RefreshCell
              active={props.isRefreshing(b().id)}
              mutedColor={props.trackColor}
              actionColor={props.actionColor}
              onRefresh={() => props.onRefreshProvider(b().id)}
            />
          </box>
        )}
      </Match>

      {/* 余额型：名称在左、金额被弹性空间推到最右，与百分比型结构不同 */}
      <Match when={asKind(props.block, 'balance')}>
        {(b: () => BalanceBlock) => (
          <box flexDirection="row" width="100%" marginTop={PROVIDER_GAP}>
            <box flexShrink={0} width={LABEL_WIDTH}>
              <text fg={props.colorFor(b().level)}>
                <b>{providerMark(PROVIDER_MARK)}</b>
              </text>
            </box>
            <box flexShrink={0}>
              <text fg={props.colorFor(b().level)}>
                <b>{b().name}</b>
              </text>
            </box>
            <box flexGrow={1} />
            <box flexShrink={0}>
              <text fg={props.colorFor(b().level)}>{b().amount}</text>
            </box>
            <RefreshCell
              active={props.isRefreshing(b().id)}
              mutedColor={props.trackColor}
              actionColor={props.actionColor}
              onRefresh={() => props.onRefreshProvider(b().id)}
            />
          </box>
        )}
      </Match>

      {/* 错误 / configError：整行一条；provider 错误行右端带单家刷新按钮（可单独重试），
          configError 没有对应 provider，因而不带按钮。 */}
      <Match when={asKind(props.block, 'note')}>
        {(b: () => NoteBlock) => {
          const id = b().id;
          return (
            <box flexDirection="row" width="100%" marginTop={PROVIDER_GAP}>
              <box flexGrow={1} flexShrink={1}>
                <text fg={props.colorFor(b().level)}>{b().text}</text>
              </box>
              {id ? (
                <RefreshCell
                  active={props.isRefreshing(id)}
                  mutedColor={props.trackColor}
                  actionColor={props.actionColor}
                  onRefresh={() => props.onRefreshProvider(id)}
                />
              ) : null}
            </box>
          );
        }}
      </Match>

      {/* 窗口行：标签 | 点阵进度条 | 百分比 | 倒计时。marginBottom 较小，组内紧凑 */}
      <Match when={asKind(props.block, 'window')}>
        {(b: () => WindowBlock) => (
          <box flexDirection="row" width="100%" gap={1} marginBottom={WINDOW_GAP}>
            <box flexShrink={0} width={LABEL_WIDTH}>
              <text fg={props.colorFor(b().level)}>{b().label}</text>
            </box>
            <Meter percent={b().percent} fill={props.colorFor(b().level)} empty={props.trackColor} />
            {/* 宽度 = 补齐后的字符串长度，这就是那一列的固定宽度 */}
            <box flexShrink={0} width={b().percentText.length}>
              <text fg={props.colorFor(b().level)}>{b().percentText}</text>
            </box>
            {b().resetText ? (
              <box flexShrink={0} width={b().resetText.length}>
                <text fg={props.colorFor('muted')}>{b().resetText}</text>
              </box>
            ) : null}
          </box>
        )}
      </Match>
    </Switch>
  );
}
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
        // 默认展开：用量是常驻信息，折叠交给用户主动切
        collapsed: false,
      },
    });

    // 让「刷新 Xm前」自己走字
    const [now, setNow] = createSignal(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);

    // 刷新按钮的忙碌态：拉取进行中把它压暗
    const [refreshing, setRefreshing] = createSignal(false);

    /** 最近一次写入的结果，用于在退避期间保留上一轮的值 */
    let latest: ProviderState[] = [];
    const failures = new Map<ProviderId, number>();
    const backoffUntil = new Map<ProviderId, number>();
    let inFlight: Promise<void> | null = null;

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
      setRefreshing(true);
      const run = async (): Promise<void> => {
        const { config, thresholds, error } = loadConfig();
        const startedAt = Date.now();
        const active = enabledProviders(config);
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
        setRefreshing(false);
      });
      return inFlight;
    }

    const colorFor = (level: Level) => {
      if (level === 'danger') return context.theme.text.feedback.error.base;
      if (level === 'warn') return context.theme.text.feedback.warning.base;
      if (level === 'muted') return context.theme.text.muted;
      return context.theme.text.feedback.success.base;
    };

    /** 单家刷新按钮的忙碌态：按 provider id 记录，与全局 `refreshing` 相互独立 */
    const [refreshingIds, setRefreshingIds] = createSignal<ReadonlySet<ProviderId>>(new Set());
    const markRefreshing = (id: ProviderId, on: boolean): void => {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    };
    const isRefreshing = (id: ProviderId): boolean => refreshingIds().has(id);

    /** 单家重拉的单飞表：同 id 的重复点击共享同一个 promise */
    const singleFlight = new Map<ProviderId, Promise<void>>();

    /**
     * 单家手动刷新：绕过退避，只重拉这一家并就地更新快照，不弹 toast（避免刷屏）。
     * 刻意**不动 `updatedAt`** —— 表头的新鲜度代表「整份快照最后一次全量刷新」的时间，
     * 只刷一家的部分更新不该把它冒充成全量新鲜。
     */
    async function refreshOne(id: ProviderId): Promise<void> {
      const pending = singleFlight.get(id);
      if (pending) return pending;
      const definition = enabledProviders(loadConfig().config).find((p) => p.id === id);
      if (!definition) return;
      markRefreshing(id, true);
      const run = (async (): Promise<void> => {
        const { config } = loadConfig();
        const state = await fetchOne(definition, config);
        latest = latest.map((s) => (s.id === id ? state : s));
        await updateSnapshot((draft) => {
          draft.providers = latest;
        });
      })();
      singleFlight.set(id, run);
      try {
        await run;
      } finally {
        singleFlight.delete(id);
        markRefreshing(id, false);
      }
    }

    /** 进度条 track 恒为 muted，fill 用 level 色 —— 对比由「灰 vs 亮色」承担 */
    const trackColor = context.theme.text.muted;

    /** 刷新按钮常态色：用中性文字色，避免和红/黄/绿状态色混淆 */
    const actionColor = context.theme.text.base;

    const planInput = (): LayoutInput => ({
      updatedAt: snapshot.updatedAt,
      configError: snapshot.configError,
      thresholds: snapshot.thresholds,
      providers: snapshot.providers,
      now: now(),
      collapsed: snapshot.collapsed,
    });

    /** 点击表头与快捷键 / 斜杠命令共用这一个入口，避免两处逻辑漂移 */
    const toggleCollapsed = async (notify: boolean): Promise<void> => {
      let next = false;
      await updateSnapshot((draft) => {
        draft.collapsed = !draft.collapsed;
        next = draft.collapsed;
      });
      if (notify) {
        context.ui.toast.show({
          message: next ? '已折叠用量侧边栏' : '已展开用量侧边栏',
          duration: 1500,
        });
      }
    };

    /** 手动刷新：表头按钮点击与斜杠命令 / 快捷键共用，避免两处逻辑漂移 */
    const manualRefresh = async (): Promise<void> => {
      await refreshAll(true);
      const failed = latest.filter((s) => s.error).length;
      context.ui.toast.show({
        message: `已刷新 ${latest.length} 家${failed > 0 ? `（${failed} 家失败）` : ''}`,
        variant: failed > 0 ? 'warning' : 'success',
        duration: 3000,
      });
    };

    const unclaim = context.ui.slot({
      append: 'sidebar.content',
      render: () => (
        // 外框：圆角 + 主题边框色，把整块用量和侧边栏其它内容视觉隔离。
        // paddingX 是必需的 —— 边框吃掉左右各 1 列，不留白的话文字会贴在线上。
        <box
          flexDirection="column"
          width="100%"
          border={true}
          borderStyle={BORDER_STYLE}
          borderColor={context.theme.border.base}
          paddingX={1}
        >
          <For each={layoutPlan(planInput())}>
            {(block) => (
              <BlockView
                block={block}
                colorFor={colorFor}
                trackColor={trackColor}
                onToggle={() => void toggleCollapsed(false)}
                onRefresh={() => void manualRefresh()}
                onRefreshProvider={(id) => void refreshOne(id)}
                isRefreshing={isRefreshing}
                refreshing={refreshing()}
                actionColor={actionColor}
              />
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
              id: REFRESH_COMMAND_ID,
              title: '刷新供应商用量',
              description: '立即重新拉取 Kimi / MiniMax / 火山 / DeepSeek / MiMo 用量',
              group: '用量',
              bind: 'ctrl+alt+u',
              palette: true,
              slash: { name: 'usage' },
              run: manualRefresh,
            },
            {
              id: TOGGLE_COMMAND_ID,
              title: '折叠 / 展开用量侧边栏',
              description: '折叠后只保留表头一行',
              group: '用量',
              bind: 'ctrl+alt+y',
              palette: true,
              slash: { name: 'usage-toggle' },
              run: () => toggleCollapsed(true),
            },
          ],
          bindings: [REFRESH_COMMAND_ID, TOGGLE_COMMAND_ID],
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


