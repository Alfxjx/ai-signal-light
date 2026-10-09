<script setup lang="ts">
import NavBar from './components/NavBar.vue';
import HeroSection from './components/HeroSection.vue';
import PlatformMarquee from './components/PlatformMarquee.vue';
import ShowcaseOrbPet from './components/ShowcaseOrbPet.vue';
import ShowcaseMobile from './components/ShowcaseMobile.vue';
import ShowcasePlugin from './components/ShowcasePlugin.vue';
import MoreFeatures from './components/MoreFeatures.vue';
import HowItWorks from './components/HowItWorks.vue';
import FAQSection from './components/FAQSection.vue';
import DownloadsSection from './components/DownloadsSection.vue';
import SiteFooter from './components/SiteFooter.vue';
</script>

<template>
  <div class="relative flex min-h-screen flex-col">
    <NavBar />
    <main class="relative z-10 flex-1">
      <HeroSection />
      <PlatformMarquee />
      <ShowcaseOrbPet />
      <ShowcaseMobile />
      <ShowcasePlugin />
      <MoreFeatures />
      <HowItWorks />
      <FAQSection />
      <DownloadsSection />
    </main>
    <SiteFooter />
  </div>
</template>
