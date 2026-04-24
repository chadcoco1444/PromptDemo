import './globals.css';

export const metadata = {
  title: 'PromptDemo',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <nav className="border-b">
          <div className="max-w-5xl mx-auto p-4 flex items-center gap-4">
            <a href="/" className="font-semibold text-lg">
              PromptDemo
            </a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
