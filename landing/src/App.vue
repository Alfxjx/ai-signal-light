<script setup lang="ts">
import NavBar from './components/NavBar.vue';
import HeroSection from './components/HeroSection.vue';
import FeatureCards from './components/FeatureCards.vue';
import HowItWorks from './components/HowItWorks.vue';
import FAQSection from './components/FAQSection.vue';
import SiteFooter from './components/SiteFooter.vue';
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <NavBar />
    <main class="flex-1">
      <HeroSection />
      <FeatureCards />
      <HowItWorks />
      <FAQSection />
    </main>
    <SiteFooter />
  </div>
</template>
