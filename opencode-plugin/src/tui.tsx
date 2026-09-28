import { Plugin } from '@opencode/plugin/tui';

export default Plugin.define({
  id: 'ai-signal-light.usage',
  setup(context) {
    context.ui.toast.show({
      message: `用量侧边栏插件已加载（opencode ${context.app.version}）`,
      variant: 'success',
      duration: 4000,
    });

    const unclaim = context.ui.slot({
      append: 'sidebar.content',
      render: () => <text fg={context.theme.text.muted}>用量插件占位</text>,
    });

    return () => unclaim();
  },
});
