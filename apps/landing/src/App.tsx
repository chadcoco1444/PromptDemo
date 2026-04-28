import { Hero } from './components/Hero';
import { IntentMatrix } from './components/IntentMatrix';
import { TallyEmbed } from './components/TallyEmbed';
import { Footer } from './components/Footer';

export function App() {
  return (
    <main>
      <Hero />
      <IntentMatrix />
      <TallyEmbed />
      <Footer />
    </main>
  );
}
