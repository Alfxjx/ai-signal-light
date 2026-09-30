<script setup lang="ts">
import { ref } from 'vue';
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';

const faqs = [
  {
    question: '支持哪些 AI 平台？',
    answer:
      '项目状态：Claude Code（扫 ~/.claude/projects 下的对话记录）与 Kimi Code (web)（连本机 kimi web 服务订阅实时会话）。配额：Kimi、MiniMax、GitHub Copilot、DeepSeek、Codex、火山方舟 Ark、MiMo 共七家。另外 opencode 用户可以装侧边栏插件，在终端里看其中五家。',
  },
  {
    question: '数据安全吗？会不会上传？',
    answer:
      '不会。应用只读本机的对话记录、配置文件和额度接口，配置与密钥都存在本机 userData 目录。除了各家平台自己的额度接口，没有任何自建服务器。手机端走的是局域网 WebSocket，只在你自己的 WiFi 里通信，二维码里只有本机地址、端口和一个随机 apiKey。',
  },
  {
    question: '需要注册或登录账号吗？',
    answer:
      '不需要注册本应用的账号。各平台凭证按需填写：Kimi 用开放平台 API Key，Copilot 走 GitHub 设备码 OAuth，Codex 直接读本机 ~/.codex/auth.json 并自动刷新，DeepSeek / MiMo / 火山方舟填自己的 key 或控制台 cookie。不填的 provider 直接不显示。',
  },
  {
    question: '会一直轮询、费流量吗？',
    answer:
      '默认 5 分钟一次，可以在设置里改成 10 / 15 / 30 / 60 分钟。项目状态每 30 秒扫一次本地文件，不产生任何网络请求。悬浮球、宠物、主面板之间走本机回环 WebSocket，不出网卡。',
  },
  {
    question: '悬浮球会不会抢焦点、打断我打字？',
    answer:
      '不会。悬浮球窗口是 focusable: false，点它不夺走 IDE 的输入焦点。桌面宠物同理，单击才打开本机 Kimi Web（相同 URL 浏览器会自动聚焦已有标签，不会重复开）。',
  },
  {
    question: '开源吗？怎么更新？',
    answer:
      'MIT 协议开源，仓库在 GitHub。桌面端每次启动会检查新版本，也可以直接去 Releases 页面下载对应平台的最新包。',
  },
];

const openIndex = ref<number | null>(0);

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? null : index;
}
</script>

<template>
  <section id="faq" class="relative py-24">
    <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <SectionHeading
          align="center"
          eyebrow="FAQ"
          title="常见问题"
          desc="关于支持范围、数据安全和安装的疑问。"
        />
      </ScrollReveal>

      <div class="mt-12 space-y-2">
        <ScrollReveal v-for="(faq, index) in faqs" :key="index">
          <div class="panel overflow-hidden">
            <button
              class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              :aria-expanded="openIndex === index"
              @click="toggle(index)"
            >
              <span class="text-[15px] font-medium text-gray-100">{{ faq.question }}</span>
              <span
                class="num shrink-0 text-base text-ink-400 transition-transform duration-200"
                :class="{ 'rotate-45 text-led-green': openIndex === index }"
              >
                +
              </span>
            </button>
            <div
              class="grid transition-all duration-300 ease-out"
              :class="openIndex === index ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
            >
              <div class="overflow-hidden">
                <p class="px-5 pb-5 text-[13px] leading-relaxed text-gray-400">{{ faq.answer }}</p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>
