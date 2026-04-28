import { Hero } from './components/Hero';
import { IntentVideoShowcase } from './components/IntentVideoShowcase';
import { IntentMatrix } from './components/IntentMatrix';
import { TallyEmbed } from './components/TallyEmbed';
import { Footer } from './components/Footer';

export function App() {
  return (
    <main>
      <Hero />
      <IntentVideoShowcase />
      <IntentMatrix />
      <TallyEmbed />
      <Footer />
    </main>
  );
}
