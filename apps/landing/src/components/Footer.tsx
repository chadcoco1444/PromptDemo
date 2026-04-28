export function Footer() {
  return (
    <footer className="bg-black text-gray-500 py-12 px-6 border-t border-gray-800">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm">
          © {new Date().getFullYear()} LumeSpec. Made with{' '}
          <a
            href="https://github.com/chadcoco1444/LumeSpec"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300"
          >
            open source
          </a>
          .
        </div>
        <div className="flex gap-6 text-sm">
          <a
            href="https://github.com/chadcoco1444/LumeSpec"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition"
          >
            GitHub
          </a>
          <a href="#waitlist" className="hover:text-white transition">
            Waitlist
          </a>
        </div>
      </div>
    </footer>
  );
}
