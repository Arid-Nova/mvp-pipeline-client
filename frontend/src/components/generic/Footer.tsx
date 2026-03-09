import React from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-purple-400 text-white py-5 px-6 z-40">
      <div className="relative flex items-center justify-between text-sm hidden md:flex">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          <span>© {currentYear} CloudHubs at University of Arizona. All rights reserved.</span>
        </div>

        {/* Center section: Users */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-5">
          <span className="font-bold text-purple-100 uppercase tracking-widest text-[10px] mr-1">Users</span>
          <a href="/docs" className="hover:text-blue-200 transition-colors cursor-pointer">
            Documentation
          </a>
          <a href="/privacy" className="hover:text-blue-200 transition-colors cursor-pointer">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-blue-200 transition-colors cursor-pointer">
            Terms of Service
          </a>
          <a href="/support" className="hover:text-blue-200 transition-colors cursor-pointer">
            Support
          </a>
        </div>

        {/* Right section: Developers */}
        <div className="flex items-center space-x-5">
          <span className="font-bold text-purple-100 uppercase tracking-widest text-[10px] mr-1">Developers</span>
          
          {/* Trello Link */}
          <a
            href="https://trello.com/b/Uv6vuZr2/cimet-pipeline"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-blue-200 transition-colors"
            title="Developer Trello Board"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.333 0H4.667C2.09 0 0 2.09 0 4.667v14.666C0 21.91 2.09 24 4.667 24h14.666C21.91 24 24 21.91 24 19.333V4.667C24 2.09 21.91 0 19.333 0zM10.667 17.6c0 .59-.477 1.067-1.067 1.067H4.267C3.677 18.667 3.2 18.19 3.2 17.6V4.267C3.2 3.677 3.677 3.2 4.267 3.2h5.333c.59 0 1.067.477 1.067 1.067v13.333zm10.133-5.333c0 .59-.477 1.067-1.067 1.067h-5.333c-.59 0-1.067-.477-1.067-1.067V4.267c0-.59.477-1.067 1.067-1.067h5.333c.59 0 1.067.477 1.067 1.067v8z"/>
            </svg>
            <span className="sr-only">Trello</span>
          </a>

          {/* GitHub Link */}
          <a
            href="https://github.com/UACloudVision/mvp-pipeline-client"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-blue-200 transition-colors"
            title="GitHub Repository"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="sr-only">GitHub</span>
          </a>

          {/* Divider & Version */}
          <div className="border-l border-purple-300 pl-5 ml-2">
            <span className="text-purple-100 font-mono text-xs">v1.1.1</span>
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex flex-col space-y-4 mt-2 text-center text-sm">
        {/* Mobile Users */}
        <div className="flex flex-col items-center space-y-2">
          <span className="font-bold text-purple-100 uppercase tracking-widest text-[10px]">Users</span>
          <div className="flex justify-center space-x-4">
            <a href="/docs" className="hover:text-blue-200 transition-colors">Docs</a>
            <a href="/privacy" className="hover:text-blue-200 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-blue-200 transition-colors">Terms</a>
            <a href="/support" className="hover:text-blue-200 transition-colors">Support</a>
          </div>
        </div>

        {/* Mobile Developers */}
        <div className="flex flex-col items-center space-y-2 pt-2 border-t border-purple-300/50">
          <span className="font-bold text-purple-100 uppercase tracking-widest text-[10px]">Developers</span>
          <div className="flex justify-center space-x-6">
            <a href="https://trello.com/b/Uv6vuZr2/cimet-pipeline" target="_blank" rel="noopener noreferrer" className="hover:text-blue-200 transition-colors flex items-center gap-1">
              Trello
            </a>
            <a href="https://github.com/UACloudVision/mvp-pipeline-client" target="_blank" rel="noopener noreferrer" className="hover:text-blue-200 transition-colors flex items-center gap-1">
              GitHub
            </a>
          </div>
        </div>

        {/* Mobile Copyright & Version */}
        <div className="text-purple-100 text-xs pt-2">
          © {currentYear} CloudHubs Explorer • v1.1.1
        </div>
      </div>
    </footer>
  );
};

export default Footer;